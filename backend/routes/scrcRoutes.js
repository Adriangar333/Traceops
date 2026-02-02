const express = require('express');
const router = express.Router();
const { TARIFFS } = require('../utils/tariffs');
const { validateOrderClosure } = require('../services/auditService');
const { BRIGADE_CAPACITIES, RoutingEngine, ALCANCE_BRIGADE_MATRIX } = require('../services/routingEngine');


// SCRC Routes for ISES Field Service Management
// Accepts pool as dependency injection from index.js

module.exports = (pool, io) => {
    const routingEngine = new RoutingEngine(pool);

    // In-memory cache for technician locations (for real-time tracking)
    const techLocations = new Map(); // techId -> {lat, lng, timestamp, brigade_id}
    const GPS_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes - consider GPS "off" if no update

    // ============================================
    // REAL-TIME GPS TRACKING
    // ============================================

    // Technician sends their location (from mobile app)
    router.post('/tech-location', async (req, res) => {
        const { technician_id, brigade_id, latitude, longitude, accuracy, battery } = req.body;

        if (!technician_id || !latitude || !longitude) {
            return res.status(400).json({ error: 'technician_id, latitude, longitude required' });
        }

        const locationData = {
            technician_id,
            brigade_id: brigade_id || null,
            lat: parseFloat(latitude),
            lng: parseFloat(longitude),
            accuracy: accuracy || null,
            battery: battery || null,
            timestamp: new Date().toISOString(),
            is_online: true
        };

        // Update in-memory cache
        techLocations.set(technician_id, locationData);

        // Broadcast to all admin clients listening
        io.emit('tech:location', locationData);

        // Optionally persist to DB (batch insert every 30s handled elsewhere)
        res.json({ success: true, received: locationData.timestamp });
    });

    // Admin gets all current technician locations
    router.get('/tech-locations', async (req, res) => {
        const now = Date.now();
        const locations = [];

        techLocations.forEach((loc, techId) => {
            const locTime = new Date(loc.timestamp).getTime();
            const isStale = (now - locTime) > GPS_TIMEOUT_MS;

            locations.push({
                ...loc,
                is_online: !isStale,
                last_seen_minutes_ago: Math.round((now - locTime) / 60000)
            });
        });

        res.json({
            success: true,
            locations,
            gps_timeout_minutes: GPS_TIMEOUT_MS / 60000
        });
    });

    // Check for GPS alerts (technicians who haven't reported in X minutes)
    router.get('/gps-alerts', async (req, res) => {
        const { timeout_minutes = 10 } = req.query;
        const threshold = parseInt(timeout_minutes) * 60 * 1000;
        const now = Date.now();
        const alerts = [];

        techLocations.forEach((loc, techId) => {
            const locTime = new Date(loc.timestamp).getTime();
            if ((now - locTime) > threshold) {
                alerts.push({
                    technician_id: techId,
                    brigade_id: loc.brigade_id,
                    last_location: { lat: loc.lat, lng: loc.lng },
                    last_seen: loc.timestamp,
                    minutes_ago: Math.round((now - locTime) / 60000),
                    alert_type: 'GPS_TIMEOUT'
                });
            }
        });

        // Also emit alert event if any found
        if (alerts.length > 0) {
            io.emit('gps:alerts', { count: alerts.length, alerts });
        }

        res.json({ success: true, alerts });
    });

    // ============================================
    // 1. INGEST DATA (Webhook from n8n or direct upload)
    // ============================================
    // EXPECTS: { orders: [...] } where each order maps to Excel columns:
    // ORDEN, NIC, TECNICO, TIPO DE OS, BRIGADA, MUNICIPIO, BARRIO, DIRECCION, 
    // NOMBRE DEL CLIENTE, DEUDA, TIPO DE BRIGADA, LINEA ESTRATEGICA, etc.

    router.post('/ingest', async (req, res) => {
        const { orders } = req.body;

        if (!orders || !Array.isArray(orders)) {
            return res.status(400).json({ error: 'Invalid payload: orders array required' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // ---------------------------------------------------------
            // STEP 0: Auto-create Brigades / Technicians found in Input
            // ---------------------------------------------------------
            const brigadesMap = new Map();

            for (const order of orders) {
                // Key logic: Who is doing the work?
                // The Excel often has 'TECNICO' or 'BRIGADA' (code).
                // We use 'TECNICO' as the human-readable name if available, else 'BRIGADA'.
                const rawName = order['TECNICO'] || order.tecnico;
                const rawCode = order['BRIGADA'] || order.brigada;
                const rawType = order['TIPO DE BRIGADA'] || order.tipo_brigada || 'SCR LIVIANA';

                // If we have a name (Technician) or Code, we treat it as a Brigade unit.
                // Priority: Use CODE if available (unique ID), else Name.
                // Actually, 'name' in our DB is UNIQUE. Let's use the most descriptive one.
                const brigadeName = rawName || rawCode;

                if (brigadeName) {
                    if (!brigadesMap.has(brigadeName)) {
                        // Determine default capacity based on type
                        // Clean up type string to match keys (e.g., trim extra spaces)
                        const cleanType = rawType.trim().toUpperCase();
                        let capacity = 20; // Default

                        // Try to find matching capacity
                        for (const [key, cap] of Object.entries(BRIGADE_CAPACITIES)) {
                            if (cleanType.includes(key)) {
                                capacity = cap;
                                break;
                            }
                        }

                        brigadesMap.set(brigadeName, {
                            name: brigadeName,
                            type: cleanType,
                            capacity_per_day: capacity,
                            current_zone: order['MUNICIPIO'] || order.municipio || 'Norte',
                            // If we have a code and a name, store name in members or as description?
                            // For now, let's just use the name column.
                            members: rawName && rawCode ? [{ name: rawName, role: 'titular', code: rawCode }] : []
                        });
                    }
                }
            }

            // Upsert detected brigades
            let newBrigadesCount = 0;
            for (const b of brigadesMap.values()) {
                await client.query(`
                    INSERT INTO brigades (name, type, capacity_per_day, current_zone, members, status)
                    VALUES ($1, $2, $3, $4, $5, 'active')
                    ON CONFLICT (name) DO UPDATE SET
                        type = EXCLUDED.type,
                        updated_at = NOW()
                    -- Note: We generally don't overwrite capacity/members if they already exist 
                    -- to avoid resetting manual configs. But updating 'type' is reasonable if it changes.
                `, [b.name, b.type, b.capacity_per_day, b.current_zone, JSON.stringify(b.members)]);
                newBrigadesCount++;
            }
            console.log(`👷 Verified/Created ${newBrigadesCount} brigades/technicians from input.`);


            // ---------------------------------------------------------
            // STEP 1: Insert Orders
            // ---------------------------------------------------------
            let count = 0;
            let skipped = 0;

            for (const order of orders) {
                // Map TIPO DE OS to priority
                // TO501 (Suspension) -> 2
                // TO502 (Corte) -> 1 (highest)
                // TO503 (Reconexion) -> 3
                let priority = 2;
                const tipoOS = order['TIPO DE OS'] || order.tipo_os || '';
                if (tipoOS === 'TO502' || tipoOS.includes('70501')) priority = 1; // Corte
                if (tipoOS === 'TO503' || tipoOS.includes('70502')) priority = 3; // Reconexion

                // Determine order type from TIPO DE OS
                let orderType = 'suspension';
                if (tipoOS === 'TO502' || tipoOS.includes('Corte')) orderType = 'corte';
                if (tipoOS === 'TO503' || tipoOS.includes('Recon')) orderType = 'reconexion';
                if (tipoOS === 'TO501') orderType = 'suspension';

                // Skip if no NIC or ORDEN
                const nic = order['NIC'] || order.nic;
                const ordenNum = order['ORDEN'] || order.orden;
                if (!nic || !ordenNum) {
                    skipped++;
                    continue;
                }

                await client.query(`
                    INSERT INTO scrc_orders (
                        nic, order_number, order_type, product_code, priority, 
                        technician_name, client_name, 
                        address, municipality, neighborhood, department,
                        zone_code, brigade_type, strategic_line,
                        amount_due, tariff, meter_number, meter_brand,
                        status, assignment_date, notes
                    )
                    VALUES (
                        $1, $2, $3, $4, $5, 
                        $6, $7, 
                        $8, $9, $10, $11,
                        $12, $13, $14,
                        $15, $16, $17, $18,
                        'pending', $19, $20
                    )
                    ON CONFLICT (order_number) DO UPDATE SET
                        status = EXCLUDED.status,
                        amount_due = EXCLUDED.amount_due,
                        technician_name = EXCLUDED.technician_name,
                        updated_at = NOW()
                `, [
                    nic,
                    ordenNum,
                    orderType,
                    tipoOS,
                    priority,
                    order['TECNICO'] || order.tecnico || null,
                    order['NOMBRE DEL CLIENTE'] || order.nombre_cliente || null,
                    order['DIRECCION'] || order.direccion || null,
                    order['MUNICIPIO'] || order.municipio || null,
                    order['BARRIO'] || order.barrio || null,
                    order['DEPARTAMENTO'] || order.departamento || null,
                    order['BRIGADA'] || order.brigada || null,
                    order['TIPO DE BRIGADA'] || order.tipo_brigada || null,
                    order['LINEA ESTRATEGICA'] || order.linea_estrategica || null,
                    parseFloat(order['DEUDA']) || 0,
                    order['TARIFA'] || order.tarifa || null,
                    order['MEDIDOR'] || order.medidor || null,
                    order['MARCA MEDIDOR'] || order.marca_medidor || null,
                    order['FECHA ASIGNACION'] || new Date(),
                    order['OBSERVACIONES'] || order.observaciones || null
                ]);
                count++;
            }

            await client.query('COMMIT');
            console.log(`📥 Ingested ${count} SCRC orders (${skipped} skipped)`);
            res.json({ success: true, count, skipped, brigades_processed: newBrigadesCount });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Ingest error:', err);
            res.status(500).json({ error: 'Failed to ingest data', details: err.message });
        } finally {
            client.release();
        }
    });

    // ============================================
    // 2. GET ALL ORDERS (with filters)
    // ============================================
    router.get('/orders', async (req, res) => {
        const { status, brigade_type, technician, municipality, limit = 100, offset = 0 } = req.query;

        try {
            let query = 'SELECT * FROM scrc_orders WHERE 1=1';
            const params = [];
            let paramIndex = 1;

            if (status) {
                query += ` AND status = $${paramIndex++}`;
                params.push(status);
            }
            if (brigade_type) {
                query += ` AND brigade_type = $${paramIndex++}`;
                params.push(brigade_type);
            }
            if (technician) {
                query += ` AND technician_name ILIKE $${paramIndex++}`;
                params.push(`%${technician}%`);
            }
            if (municipality) {
                query += ` AND municipality = $${paramIndex++}`;
                params.push(municipality);
            }

            query += ` ORDER BY priority ASC, created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
            params.push(parseInt(limit), parseInt(offset));

            const result = await pool.query(query, params);
            res.json({ orders: result.rows, count: result.rowCount });
        } catch (err) {
            console.error('Get orders error:', err);
            res.status(500).json({ error: 'Failed to fetch orders' });
        }
    });

    // ============================================
    // 3. UPDATE DEBT / CANCEL ORDERS (n8n 30min job)
    // ============================================
    // ============================================
    // 3. UPDATE DEBT / CANCEL ORDERS (n8n 30min job)
    // ============================================
    router.post('/update-debt', async (req, res) => {
        const { payments } = req.body; // Array of NICs that paid

        if (!payments || !Array.isArray(payments)) {
            return res.status(400).json({ error: 'Invalid payload: payments array required' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const placeholders = payments.map((_, i) => `$${i + 1}`).join(',');
            const result = await client.query(`
                UPDATE scrc_orders 
                SET status = 'cancelled_payment', 
                    updated_at = NOW(),
                    notes = COALESCE(notes, '') || ' | Auto-cancelled by debt payment'
                WHERE nic IN (${placeholders}) 
                  AND status IN ('pending', 'assigned')
                  AND order_type IN ('corte', 'suspension')
                RETURNING nic, order_number
            `, payments);

            await client.query('COMMIT');
            console.log(`💸 Processed payments, cancelled ${result.rowCount} orders`);

            // Real-time Notification: "Turn off the point"
            if (io && result.rowCount > 0) {
                io.emit('scrc:orders-cancelled', {
                    cancelled_orders: result.rows,
                    count: result.rowCount,
                    reason: 'payment_received'
                });
                console.log('📡 Emitted scrc:orders-cancelled event');
            }

            res.json({
                success: true,
                cancelled_count: result.rowCount,
                cancelled: result.rows
            });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Update debt error:', err);
            res.status(500).json({ error: 'Failed to update debt' });
        } finally {
            client.release();
        }
    });

    // ============================================
    // 3.1 COMPLETE ORDER (Mobile App) - With Audit
    // ============================================
    router.patch('/orders/:id/complete', async (req, res) => {
        const { id } = req.params;
        const {
            latitude, longitude,
            notes, photos,
            durationMinutes
        } = req.body;

        try {
            // 1. Get current order data
            const orderRes = await pool.query('SELECT * FROM scrc_orders WHERE id = $1', [id]);
            if (orderRes.rowCount === 0) return res.status(404).json({ error: 'Order not found' });

            const order = orderRes.rows[0];

            // 2. Perform Audit
            const closingData = { latitude, longitude, durationMinutes };
            const { isFlagged, flags } = validateOrderClosure(order, closingData);

            // 3. Update Order
            // Use PostGIS to store execution location
            const locParams = (latitude && longitude)
                ? `ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`
                : 'NULL';

            const result = await pool.query(`
                UPDATE scrc_orders SET
                    status = 'completed',
                    execution_date = NOW(),
                    notes = $1,
                    evidence_photos = $2,
                    audit_flags = $3,
                    is_flagged = $4,
                    execution_duration = $5,
                    execution_location = ${locParams},
                    updated_at = NOW()
            WHERE id = $6
                RETURNING *
            `, [
                notes,
                photos || [],
                flags,
                isFlagged,
                durationMinutes || 0,
                id
            ]);

            // 4. Check for Refill (Dynamic Assignment) - "Gatillo de Terminación"
            if (order.assigned_brigade_id) {
                const hour = new Date().getHours();
                // If before 4 PM (16:00), we can assign more
                if (hour < 16) {
                    const pendingRes = await pool.query(`
                        SELECT COUNT(*) as count 
                        FROM scrc_orders 
                        WHERE assigned_brigade_id = $1 
                        AND status IN ('assigned', 'in_progress')
                        AND DATE(assignment_date) = CURRENT_DATE
                    `, [order.assigned_brigade_id]);

                    const pendingCount = parseInt(pendingRes.rows[0].count);

                    // If queue is almost empty (< 3), trigger refill
                    if (pendingCount < 3) {
                        console.log(`⚡ Triggering Auto-Refill for Brigade ${order.assigned_brigade_id} (Load: ${pendingCount})`);
                        try {
                            const refillResult = await routingEngine.autoAssign({
                                specificBrigadeId: order.assigned_brigade_id,
                                boostCapacity: 5, // Allow +5 orders
                                maxOrders: 5,
                                dryRun: false
                            });

                            if (refillResult.assigned > 0 && io) {
                                io.emit('scrc:refill', {
                                    brigade_id: order.assigned_brigade_id,
                                    count: refillResult.assigned,
                                    message: `Asignadas ${refillResult.assigned} nuevas órdenes por terminación anticipada.`
                                });
                            }
                        } catch (refillErr) {
                            console.error('Refill error:', refillErr);
                        }
                    }
                }
            }

            res.json({
                success: true,
                order: result.rows[0],
                audit: { isFlagged, flags }
            });

        } catch (err) {
            console.error('Complete order error:', err);
            res.status(500).json({ error: 'Failed to complete order' });
        }
    });

    // ============================================
    // 3.2 AUDIT REPORT (Dashboard)
    // ============================================
    router.get('/audit', async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT 
                    id, order_number, technician_name, brigade_type,
                    audit_flags, execution_date,
                    order_type
                FROM scrc_orders
                WHERE is_flagged = TRUE
                ORDER BY execution_date DESC
                LIMIT 100
            `);
            res.json(result.rows);
        } catch (err) {
            console.error('Audit report error:', err);
            res.status(500).json({ error: 'Failed to fetch audit report' });
        }
    });

    // ============================================
    // 4. GET STATS (Dashboard summary)
    // ============================================
    router.get('/stats', async (req, res) => {
        try {
            const stats = await pool.query(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status = 'assigned') as assigned,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed,
                    COUNT(*) FILTER (WHERE status = 'cancelled_payment') as cancelled,
                    COUNT(*) FILTER (WHERE order_type = 'corte') as cortes,
                    COUNT(*) FILTER (WHERE order_type = 'suspension') as suspensiones,
                    COUNT(*) FILTER (WHERE order_type = 'reconexion') as reconexiones,
                    SUM(amount_due) as total_debt
                FROM scrc_orders
            `);

            const byBrigade = await pool.query(`
                SELECT brigade_type, COUNT(*) as count
                FROM scrc_orders
                GROUP BY brigade_type
            `);

            res.json({
                summary: stats.rows[0],
                by_brigade: byBrigade.rows
            });
        } catch (err) {
            console.error('Stats error:', err);
            res.status(500).json({ error: 'Failed to fetch stats' });
        }
    });

    // ============================================
    // 4.1 FINANCIALS (PxQ) - Real-time Billing
    // ============================================
    router.get('/financials', async (req, res) => {
        const { startDate, endDate, brigade_type } = req.query;

        try {
            let query = `
                SELECT 
                    product_code, 
                    order_type, 
                    brigade_type, 
                    COUNT(*) as count
                FROM scrc_orders
                WHERE status = 'completed'
            `;

            const params = [];
            let paramIdx = 1;

            if (startDate) {
                query += ` AND execution_date >= $${paramIdx++}`;
                params.push(startDate);
            }
            if (endDate) {
                query += ` AND execution_date <= $${paramIdx++}`;
                params.push(endDate);
            }
            if (brigade_type) {
                query += ` AND brigade_type = $${paramIdx++}`;
                params.push(brigade_type);
            }

            query += ` GROUP BY product_code, order_type, brigade_type`;

            const result = await pool.query(query, params);

            // Calculate Totals using TARIFFS
            let totalValue = 0;
            const details = result.rows.map(row => {
                const tariff = TARIFFS[row.product_code] || { price: 0, name: row.order_type };

                // Fallback for missing codes based on order_type
                let price = tariff.price;
                if (!price) {
                    if (row.order_type === 'corte') price = TARIFFS['GENERIC_CORTE'];
                    else if (row.order_type === 'reconexion') price = TARIFFS['GENERIC_RECON'];
                    else price = 0;
                }

                const subtotal = price * parseInt(row.count);
                totalValue += subtotal;

                return {
                    ...row,
                    price,
                    subtotal,
                    label: tariff.name || row.order_type
                };
            });

            // Projection (Simple Linear)
            // If viewing current month, project to end of month
            let projectedValue = totalValue;
            if (startDate && new Date(startDate).getDate() === 1) { // Basic check for "start of month"
                const now = new Date();
                const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                const currentDay = now.getDate();
                if (currentDay < daysInMonth) {
                    projectedValue = (totalValue / currentDay) * daysInMonth;
                }
            }

            res.json({
                totalValue,
                projectedValue: Math.round(projectedValue),
                details
            });

        } catch (err) {
            console.error('Financials error:', err);
            res.status(500).json({ error: 'Failed to calculate financials' });
        }
    });

    // ============================================
    // 5. ROUTING ENGINE - Auto-assign orders
    // ============================================
    // (RoutingEngine instantiated at module scope)

    // POST /api/scrc/routing/auto-assign
    // Automatically assign pending orders to brigades based on capacity and eligibility
    router.post('/routing/auto-assign', async (req, res) => {
        try {
            const { maxOrders = 500, dryRun = false } = req.body;
            const result = await routingEngine.autoAssign({ maxOrders, dryRun });
            console.log(`🚛 Auto-assigned ${result.assigned} of ${result.total_orders} orders`);
            res.json(result);
        } catch (err) {
            console.error('Auto-assign error:', err);
            res.status(500).json({ error: 'Failed to auto-assign', details: err.message });
        }
    });

    // GET /api/scrc/routing/zones
    // Get order clusters by zone for geographic optimization
    router.get('/routing/zones', async (req, res) => {
        try {
            const zones = await routingEngine.clusterOrdersByZone();
            res.json({ zones, count: zones.length });
        } catch (err) {
            console.error('Zones error:', err);
            res.status(500).json({ error: 'Failed to get zones' });
        }
    });

    // GET /api/scrc/routing/stats
    // Get routing statistics for dashboard
    router.get('/routing/stats', async (req, res) => {
        try {
            const stats = await routingEngine.getRoutingStats();
            res.json(stats);
        } catch (err) {
            console.error('Routing stats error:', err);
            res.status(500).json({ error: 'Failed to get routing stats' });
        }
    });

    // GET /api/scrc/routing/config
    // Get routing configuration (capacities, matrix)
    router.get('/routing/config', (req, res) => {
        res.json({
            brigade_capacities: BRIGADE_CAPACITIES,
            alcance_matrix: ALCANCE_BRIGADE_MATRIX
        });
    });

    // ============================================
    // 6. BRIGADE MANAGEMENT
    // ============================================

    // GET /api/scrc/brigades
    router.get('/brigades', async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT 
                    b.*,
                    COALESCE(
                        (SELECT COUNT(*) FROM scrc_orders 
                         WHERE assigned_brigade_id = b.id 
                         AND status IN ('assigned', 'in_progress')
                         AND DATE(assignment_date) = CURRENT_DATE
                        ), 0
                    ) as orders_today
                FROM brigades b
                ORDER BY b.type, b.name
            `);
            res.json({ brigades: result.rows });
        } catch (err) {
            console.error('Brigades error:', err);
            res.status(500).json({ error: 'Failed to fetch brigades' });
        }
    });

    // POST /api/scrc/brigades
    // Create a new brigade
    router.post('/brigades', async (req, res) => {
        const { name, type, members = [], capacity_per_day = 20, status = 'active' } = req.body;

        if (!name || !type) {
            return res.status(400).json({ error: 'name and type are required' });
        }

        try {
            const result = await pool.query(`
                INSERT INTO brigades (name, type, members, capacity_per_day, status)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [name, type, members, capacity_per_day, status]);

            res.json({ brigade: result.rows[0] });
        } catch (err) {
            console.error('Create brigade error:', err);
            res.status(500).json({ error: 'Failed to create brigade' });
        }
    });

    // POST /api/scrc/brigades/bulk
    // Bulk import brigades from Distribución Operativa
    router.post('/brigades/bulk', async (req, res) => {
        const { brigades } = req.body;

        if (!brigades || !Array.isArray(brigades)) {
            return res.status(400).json({ error: 'brigades array required' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            let count = 0;

            for (const brigade of brigades) {
                await client.query(`
                    INSERT INTO brigades (name, type, members, capacity_per_day, status)
                    VALUES ($1, $2, $3, $4, 'active')
                    ON CONFLICT ON CONSTRAINT brigades_name_key DO UPDATE
                    SET type = EXCLUDED.type,
                        members = EXCLUDED.members,
                        capacity_per_day = EXCLUDED.capacity_per_day,
                        updated_at = NOW()
                `, [
                    brigade.name,
                    brigade.type,
                    brigade.members || [],
                    brigade.capacity_per_day || 20
                ]);
                count++;
            }

            await client.query('COMMIT');
            res.json({ success: true, count });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Bulk brigade error:', err);
            res.status(500).json({ error: 'Failed to bulk import brigades' });
        } finally {
            client.release();
        }
    });

    // ============================================
    // EXCEL EXPORT - SIPREM FORMAT
    // ============================================
    router.get('/export/siprem', async (req, res) => {
        const XLSX = require('xlsx');
        const { date, status, brigade_id } = req.query;

        try {
            let whereClause = "WHERE status IN ('completed', 'failed')";
            const params = [];

            if (date) {
                params.push(date);
                whereClause += ` AND DATE(execution_date) = $${params.length}`;
            }
            if (status) {
                params.push(status);
                whereClause += ` AND status = $${params.length}`;
            }
            if (brigade_id) {
                params.push(brigade_id);
                whereClause += ` AND assigned_brigade_id = $${params.length}`;
            }

            const result = await pool.query(`
                SELECT 
                    o.order_number AS "ORDEN",
                    o.nic AS "NIC",
                    o.client_name AS "NOMBRE DEL CLIENTE",
                    o.address AS "DIRECCION",
                    o.municipality AS "MUNICIPIO",
                    o.neighborhood AS "BARRIO",
                    o.department AS "DEPARTAMENTO",
                    o.product_code AS "TIPO DE OS",
                    CASE 
                        WHEN o.status = 'completed' THEN 'EJECUTADO'
                        WHEN o.status = 'failed' THEN 'NO EJECUTADO'
                        ELSE UPPER(o.status)
                    END AS "ESTADO",
                    o.sub_status AS "MOTIVO_NOEJECUTADO",
                    o.technician_name AS "TECNICO",
                    b.name AS "BRIGADA",
                    o.brigade_type AS "TIPO DE BRIGADA",
                    o.meter_number AS "MEDIDOR",
                    o.meter_brand AS "MARCA MEDIDOR",
                    o.amount_due AS "DEUDA",
                    o.tariff AS "TARIFA",
                    TO_CHAR(o.execution_date, 'YYYY-MM-DD HH24:MI:SS') AS "FECHA_EJECUCION",
                    o.execution_duration AS "DURACION_MINUTOS",
                    o.notes AS "OBSERVACIONES",
                    o.latitude AS "LAT",
                    o.longitude AS "LNG"
                FROM scrc_orders o
                LEFT JOIN brigades b ON o.assigned_brigade_id = b.id
                ${whereClause}
                ORDER BY o.execution_date DESC
            `, params);

            // Create workbook and worksheet
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(result.rows);
            XLSX.utils.book_append_sheet(wb, ws, 'SIPREM');

            // Generate buffer
            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

            // Set response headers
            const filename = `SIPREM_${date || new Date().toISOString().split('T')[0]}.xlsx`;
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.send(buffer);

        } catch (error) {
            console.error('Error exporting SIPREM:', error);
            res.status(500).json({ error: 'Failed to export SIPREM file' });
        }
    });

    // ============================================
    // EXCEL EXPORT - CONSOLIDADO FORMAT
    // ============================================
    router.get('/export/consolidado', async (req, res) => {
        const XLSX = require('xlsx');
        const { date, date_from, date_to } = req.query;

        try {
            let whereClause = "WHERE 1=1";
            const params = [];

            if (date) {
                params.push(date);
                whereClause += ` AND DATE(execution_date) = $${params.length}`;
            } else if (date_from && date_to) {
                params.push(date_from, date_to);
                whereClause += ` AND DATE(execution_date) BETWEEN $${params.length - 1} AND $${params.length}`;
            }

            // Consolidado por brigada
            const brigadeStats = await pool.query(`
                SELECT 
                    b.name AS "BRIGADA",
                    b.type AS "TIPO_BRIGADA",
                    COUNT(*) AS "TOTAL_ORDENES",
                    COUNT(*) FILTER (WHERE o.status = 'completed') AS "EJECUTADAS",
                    COUNT(*) FILTER (WHERE o.status = 'failed') AS "NO_EJECUTADAS",
                    COUNT(*) FILTER (WHERE o.status = 'pending') AS "PENDIENTES",
                    ROUND(100.0 * COUNT(*) FILTER (WHERE o.status = 'completed') / NULLIF(COUNT(*), 0), 2) AS "EFECTIVIDAD_%",
                    COALESCE(SUM(o.amount_due) FILTER (WHERE o.status = 'completed'), 0) AS "DEUDA_RECUPERADA",
                    ROUND(AVG(o.execution_duration), 2) AS "TIEMPO_PROMEDIO_MIN"
                FROM brigades b
                LEFT JOIN scrc_orders o ON b.id = o.assigned_brigade_id
                ${whereClause}
                GROUP BY b.id, b.name, b.type
                ORDER BY "EJECUTADAS" DESC
            `, params);

            // Consolidado por técnico
            const techStats = await pool.query(`
                SELECT 
                    technician_name AS "TECNICO",
                    COUNT(*) AS "TOTAL_ORDENES",
                    COUNT(*) FILTER (WHERE status = 'completed') AS "EJECUTADAS",
                    COUNT(*) FILTER (WHERE status = 'failed') AS "FALLIDAS",
                    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / NULLIF(COUNT(*), 0), 2) AS "EFECTIVIDAD_%",
                    COALESCE(SUM(amount_due) FILTER (WHERE status = 'completed'), 0) AS "DEUDA_RECUPERADA"
                FROM scrc_orders
                ${whereClause} AND technician_name IS NOT NULL
                GROUP BY technician_name
                ORDER BY "EJECUTADAS" DESC
            `, params);

            // Consolidado por tipo de orden
            const typeStats = await pool.query(`
                SELECT 
                    order_type AS "TIPO_ORDEN",
                    product_code AS "CODIGO",
                    COUNT(*) AS "TOTAL",
                    COUNT(*) FILTER (WHERE status = 'completed') AS "EJECUTADAS",
                    COUNT(*) FILTER (WHERE status = 'failed') AS "FALLIDAS"
                FROM scrc_orders
                ${whereClause}
                GROUP BY order_type, product_code
                ORDER BY "TOTAL" DESC
            `, params);

            // Create workbook with multiple sheets
            const wb = XLSX.utils.book_new();

            const wsBrigade = XLSX.utils.json_to_sheet(brigadeStats.rows);
            XLSX.utils.book_append_sheet(wb, wsBrigade, 'Por Brigada');

            const wsTech = XLSX.utils.json_to_sheet(techStats.rows);
            XLSX.utils.book_append_sheet(wb, wsTech, 'Por Tecnico');

            const wsType = XLSX.utils.json_to_sheet(typeStats.rows);
            XLSX.utils.book_append_sheet(wb, wsType, 'Por Tipo');

            // Generate buffer
            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

            // Set response headers
            const filename = `CONSOLIDADO_${date || date_from || new Date().toISOString().split('T')[0]}.xlsx`;
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.send(buffer);

        } catch (error) {
            console.error('Error exporting Consolidado:', error);
            res.status(500).json({ error: 'Failed to export Consolidado file' });
        }
    });

    // ============================================
    // BRIGADE MANAGEMENT
    // ============================================

    // List all brigades with member details
    router.get('/brigades', async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT 
                    b.*,
                    (SELECT COUNT(*) FROM scrc_orders WHERE assigned_brigade_id = b.id AND status = 'pending') as pending_orders,
                    (SELECT COUNT(*) FROM scrc_orders WHERE assigned_brigade_id = b.id AND status = 'completed' AND DATE(execution_date) = CURRENT_DATE) as completed_today
                FROM brigades b
                ORDER BY b.name
            `);
            res.json({ success: true, brigades: result.rows });
        } catch (error) {
            console.error('Error fetching brigades:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Get single brigade
    router.get('/brigades/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query('SELECT * FROM brigades WHERE id = $1', [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Brigade not found' });
            }
            res.json({ success: true, brigade: result.rows[0] });
        } catch (error) {
            console.error('Error fetching brigade:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Create brigade
    router.post('/brigades', async (req, res) => {
        const { name, type, members, capacity_per_day, current_zone } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Brigade name is required' });
        }

        try {
            const result = await pool.query(`
                INSERT INTO brigades (name, type, members, capacity_per_day, current_zone)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [
                name,
                type || 'mixed',
                JSON.stringify(members || []),
                capacity_per_day || 30,
                current_zone || null
            ]);

            io.emit('brigade:created', result.rows[0]);
            res.status(201).json({ success: true, brigade: result.rows[0] });
        } catch (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Brigade name already exists' });
            }
            console.error('Error creating brigade:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Update brigade
    router.put('/brigades/:id', async (req, res) => {
        const { id } = req.params;
        const { name, type, capacity_per_day, current_zone, status } = req.body;

        try {
            const result = await pool.query(`
                UPDATE brigades SET
                    name = COALESCE($1, name),
                    type = COALESCE($2, type),
                    capacity_per_day = COALESCE($3, capacity_per_day),
                    current_zone = COALESCE($4, current_zone),
                    status = COALESCE($5, status),
                    updated_at = NOW()
                WHERE id = $6
                RETURNING *
            `, [name, type, capacity_per_day, current_zone, status, id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Brigade not found' });
            }

            io.emit('brigade:updated', result.rows[0]);
            res.json({ success: true, brigade: result.rows[0] });
        } catch (error) {
            console.error('Error updating brigade:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Add member to brigade (with role: titular or auxiliar)
    router.post('/brigades/:id/members', async (req, res) => {
        const { id } = req.params;
        const { technician_id, technician_name, role } = req.body;

        if (!technician_id || !role) {
            return res.status(400).json({ error: 'technician_id and role required' });
        }
        if (!['titular', 'auxiliar'].includes(role)) {
            return res.status(400).json({ error: 'role must be "titular" or "auxiliar"' });
        }

        try {
            // Get current members
            const brigade = await pool.query('SELECT members FROM brigades WHERE id = $1', [id]);
            if (brigade.rowCount === 0) {
                return res.status(404).json({ error: 'Brigade not found' });
            }

            let members = brigade.rows[0].members || [];

            // Check if setting titular when one already exists
            if (role === 'titular') {
                const existingTitular = members.find(m => m.role === 'titular');
                if (existingTitular) {
                    // Demote existing titular to auxiliar
                    existingTitular.role = 'auxiliar';
                }
            }

            // Remove if already member, then add with new role
            members = members.filter(m => m.id !== technician_id);
            members.push({
                id: technician_id,
                name: technician_name || `Tech ${technician_id}`,
                role: role,
                added_at: new Date().toISOString()
            });

            const result = await pool.query(`
                UPDATE brigades SET members = $1, updated_at = NOW()
                WHERE id = $2 RETURNING *
            `, [JSON.stringify(members), id]);

            io.emit('brigade:member_added', { brigade_id: id, member: members[members.length - 1] });
            res.json({ success: true, brigade: result.rows[0] });
        } catch (error) {
            console.error('Error adding member:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Remove member from brigade
    router.delete('/brigades/:id/members/:techId', async (req, res) => {
        const { id, techId } = req.params;

        try {
            const brigade = await pool.query('SELECT members FROM brigades WHERE id = $1', [id]);
            if (brigade.rowCount === 0) {
                return res.status(404).json({ error: 'Brigade not found' });
            }

            let members = brigade.rows[0].members || [];
            const removedMember = members.find(m => m.id === techId || m.id === parseInt(techId));
            members = members.filter(m => m.id !== techId && m.id !== parseInt(techId));

            const result = await pool.query(`
                UPDATE brigades SET members = $1, updated_at = NOW()
                WHERE id = $2 RETURNING *
            `, [JSON.stringify(members), id]);

            io.emit('brigade:member_removed', { brigade_id: id, technician_id: techId });
            res.json({ success: true, brigade: result.rows[0], removed: removedMember });
        } catch (error) {
            console.error('Error removing member:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Update member role in brigade
    router.patch('/brigades/:id/members/:techId', async (req, res) => {
        const { id, techId } = req.params;
        const { role } = req.body;

        if (!role || !['titular', 'auxiliar'].includes(role)) {
            return res.status(400).json({ error: 'role must be "titular" or "auxiliar"' });
        }

        try {
            const brigade = await pool.query('SELECT members FROM brigades WHERE id = $1', [id]);
            if (brigade.rowCount === 0) {
                return res.status(404).json({ error: 'Brigade not found' });
            }

            let members = brigade.rows[0].members || [];

            // If promoting to titular, demote existing titular
            if (role === 'titular') {
                members = members.map(m => m.role === 'titular' ? { ...m, role: 'auxiliar' } : m);
            }

            // Update target member's role
            const memberIdx = members.findIndex(m => m.id === techId || m.id === parseInt(techId));
            if (memberIdx === -1) {
                return res.status(404).json({ error: 'Member not found in brigade' });
            }
            members[memberIdx].role = role;

            const result = await pool.query(`
                UPDATE brigades SET members = $1, updated_at = NOW()
                WHERE id = $2 RETURNING *
            `, [JSON.stringify(members), id]);

            io.emit('brigade:member_updated', { brigade_id: id, technician_id: techId, role });
            res.json({ success: true, brigade: result.rows[0] });
        } catch (error) {
            console.error('Error updating member:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Get brigade members summary (for quick lookup)
    router.get('/brigades/:id/members', async (req, res) => {
        const { id } = req.params;

        try {
            const brigade = await pool.query('SELECT id, name, members FROM brigades WHERE id = $1', [id]);
            if (brigade.rowCount === 0) {
                return res.status(404).json({ error: 'Brigade not found' });
            }

            const members = brigade.rows[0].members || [];
            const titular = members.find(m => m.role === 'titular') || null;
            const auxiliares = members.filter(m => m.role === 'auxiliar');

            res.json({
                success: true,
                brigade_id: id,
                brigade_name: brigade.rows[0].name,
                titular,
                auxiliares,
                total_members: members.length
            });
        } catch (error) {
            console.error('Error fetching members:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ============================================
    // OPERATIVE PRE-ASSIGNMENTS
    // Pre-assign technicians to specific operations/zones
    // ============================================

    // List all pre-assignments (with filters)
    router.get('/preassignments', async (req, res) => {
        const { technician_id, operative_type, zone_code, is_active, include_expired } = req.query;

        try {
            let query = `
                SELECT 
                    p.*,
                    d.name as technician_name,
                    d.phone as technician_phone,
                    b.name as brigade_name,
                    v.plate as vehicle_plate
                FROM operative_preassignments p
                LEFT JOIN drivers d ON p.technician_id = d.id
                LEFT JOIN brigades b ON p.brigade_id = b.id
                LEFT JOIN vehicles v ON p.vehicle_id = v.id
                WHERE 1=1
            `;
            const params = [];

            if (technician_id) {
                params.push(technician_id);
                query += ` AND p.technician_id = $${params.length}`;
            }
            if (operative_type) {
                params.push(operative_type);
                query += ` AND p.operative_type = $${params.length}`;
            }
            if (zone_code) {
                params.push(zone_code);
                query += ` AND p.zone_code = $${params.length}`;
            }
            if (is_active !== undefined) {
                params.push(is_active === 'true');
                query += ` AND p.is_active = $${params.length}`;
            }
            if (include_expired !== 'true') {
                query += ` AND (p.effective_until IS NULL OR p.effective_until >= CURRENT_DATE)`;
            }

            query += ` ORDER BY p.priority ASC, p.created_at DESC`;

            const result = await pool.query(query, params);
            res.json({ success: true, preassignments: result.rows });
        } catch (error) {
            console.error('Error fetching preassignments:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Get pre-assignments for a specific day (for routing engine)
    router.get('/preassignments/today', async (req, res) => {
        const dayOfWeek = new Date().getDay(); // 0=Sunday, 1=Monday...

        try {
            const result = await pool.query(`
                SELECT 
                    p.*,
                    d.name as technician_name,
                    b.name as brigade_name,
                    v.plate as vehicle_plate
                FROM operative_preassignments p
                LEFT JOIN drivers d ON p.technician_id = d.id
                LEFT JOIN brigades b ON p.brigade_id = b.id
                LEFT JOIN vehicles v ON p.vehicle_id = v.id
                WHERE p.is_active = TRUE
                  AND $1 = ANY(p.days_of_week)
                  AND p.effective_from <= CURRENT_DATE
                  AND (p.effective_until IS NULL OR p.effective_until >= CURRENT_DATE)
                ORDER BY p.operative_type, p.zone_code, p.priority
            `, [dayOfWeek]);

            res.json({ success: true, preassignments: result.rows });
        } catch (error) {
            console.error('Error fetching today preassignments:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Create pre-assignment
    router.post('/preassignments', async (req, res) => {
        const {
            technician_id, brigade_id, vehicle_id, operative_type,
            zone_code, product_codes, priority, effective_from,
            effective_until, days_of_week, notes
        } = req.body;

        if (!technician_id || !operative_type) {
            return res.status(400).json({ error: 'technician_id and operative_type are required' });
        }

        const validOperatives = ['suspension', 'corte', 'reconexion', 'revision', 'cobro'];
        if (!validOperatives.includes(operative_type)) {
            return res.status(400).json({ error: `operative_type must be one of: ${validOperatives.join(', ')}` });
        }

        try {
            const result = await pool.query(`
                INSERT INTO operative_preassignments 
                (technician_id, brigade_id, vehicle_id, operative_type, zone_code, 
                 product_codes, priority, effective_from, effective_until, days_of_week, notes)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *
            `, [
                technician_id,
                brigade_id || null,
                vehicle_id || null,
                operative_type,
                zone_code || null,
                product_codes || null,
                priority || 1,
                effective_from || new Date().toISOString().split('T')[0],
                effective_until || null,
                days_of_week || [1, 2, 3, 4, 5],
                notes || null
            ]);

            io.emit('preassignment:created', result.rows[0]);
            res.status(201).json({ success: true, preassignment: result.rows[0] });
        } catch (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Pre-assignment already exists for this tech/operative/zone/date' });
            }
            console.error('Error creating preassignment:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Update pre-assignment
    router.put('/preassignments/:id', async (req, res) => {
        const { id } = req.params;
        const {
            brigade_id, vehicle_id, zone_code, product_codes,
            priority, effective_until, days_of_week, is_active, notes
        } = req.body;

        try {
            const result = await pool.query(`
                UPDATE operative_preassignments SET
                    brigade_id = COALESCE($1, brigade_id),
                    vehicle_id = COALESCE($2, vehicle_id),
                    zone_code = COALESCE($3, zone_code),
                    product_codes = COALESCE($4, product_codes),
                    priority = COALESCE($5, priority),
                    effective_until = COALESCE($6, effective_until),
                    days_of_week = COALESCE($7, days_of_week),
                    is_active = COALESCE($8, is_active),
                    notes = COALESCE($9, notes),
                    updated_at = NOW()
                WHERE id = $10
                RETURNING *
            `, [brigade_id, vehicle_id, zone_code, product_codes, priority,
                effective_until, days_of_week, is_active, notes, id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Pre-assignment not found' });
            }

            io.emit('preassignment:updated', result.rows[0]);
            res.json({ success: true, preassignment: result.rows[0] });
        } catch (error) {
            console.error('Error updating preassignment:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Delete pre-assignment
    router.delete('/preassignments/:id', async (req, res) => {
        const { id } = req.params;

        try {
            const result = await pool.query(
                'DELETE FROM operative_preassignments WHERE id = $1 RETURNING id', [id]
            );

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Pre-assignment not found' });
            }

            io.emit('preassignment:deleted', { id: parseInt(id) });
            res.json({ success: true, message: 'Pre-assignment deleted' });
        } catch (error) {
            console.error('Error deleting preassignment:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Toggle pre-assignment active status
    router.patch('/preassignments/:id/toggle', async (req, res) => {
        const { id } = req.params;

        try {
            const result = await pool.query(`
                UPDATE operative_preassignments 
                SET is_active = NOT is_active, updated_at = NOW()
                WHERE id = $1
                RETURNING *
            `, [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Pre-assignment not found' });
            }

            io.emit('preassignment:toggled', result.rows[0]);
            res.json({ success: true, preassignment: result.rows[0] });
        } catch (error) {
            console.error('Error toggling preassignment:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Get pre-assignment summary by operative type
    router.get('/preassignments/summary', async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT 
                    operative_type,
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE is_active) as active,
                    COUNT(DISTINCT technician_id) as technicians,
                    COUNT(DISTINCT zone_code) as zones
                FROM operative_preassignments
                WHERE effective_until IS NULL OR effective_until >= CURRENT_DATE
                GROUP BY operative_type
                ORDER BY operative_type
            `);

            res.json({ success: true, summary: result.rows });
        } catch (error) {
            console.error('Error fetching preassignment summary:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ============================================
    // ROUTE ANALYTICS & STATISTICS
    // Real-time route tracking, deviations, and fuel consumption
    // ============================================

    // Store route waypoints for a technician (called periodically from mobile)
    router.post('/route-tracking', async (req, res) => {
        const { technician_id, route_id, waypoints, vehicle_id } = req.body;

        if (!technician_id || !waypoints || !Array.isArray(waypoints)) {
            return res.status(400).json({ error: 'technician_id and waypoints[] required' });
        }

        try {
            // Insert or update tracking record
            const result = await pool.query(`
                INSERT INTO route_tracking (technician_id, route_id, vehicle_id, waypoints, started_at, updated_at)
                VALUES ($1, $2, $3, $4, NOW(), NOW())
                ON CONFLICT (technician_id, route_id) 
                DO UPDATE SET 
                    waypoints = route_tracking.waypoints || $4,
                    updated_at = NOW()
                RETURNING id
            `, [technician_id, route_id || null, vehicle_id || null, JSON.stringify(waypoints)]);

            io.emit('route:tracking', { technician_id, waypoints_count: waypoints.length });
            res.json({ success: true, tracking_id: result.rows[0].id });
        } catch (error) {
            // If table doesn't exist, create it on-the-fly
            if (error.code === '42P01') {
                await pool.query(`
                    CREATE TABLE IF NOT EXISTS route_tracking (
                        id SERIAL PRIMARY KEY,
                        technician_id INTEGER NOT NULL,
                        route_id TEXT,
                        vehicle_id INTEGER,
                        waypoints JSONB DEFAULT '[]',
                        planned_route JSONB, -- Original planned route for comparison
                        started_at TIMESTAMP DEFAULT NOW(),
                        ended_at TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT NOW(),
                        UNIQUE(technician_id, route_id)
                    )
                `);
                return res.status(201).json({ success: true, message: 'Table created, retry request' });
            }
            console.error('Error storing route tracking:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Get route statistics for a specific route/technician
    router.get('/route-stats/:routeId', async (req, res) => {
        const { routeId } = req.params;
        const { technician_id } = req.query;

        try {
            // Get completed orders for this route
            const ordersQuery = await pool.query(`
                SELECT 
                    id, order_number, address, municipality, 
                    latitude, longitude,
                    execution_time_minutes,
                    execution_date,
                    updated_at as completed_at
                FROM scrc_orders 
                WHERE route_sequence IS NOT NULL
                ${technician_id ? 'AND technician_name = (SELECT name FROM drivers WHERE id = $1)' : ''}
                ORDER BY route_sequence ASC
            `, technician_id ? [technician_id] : []);

            if (ordersQuery.rowCount === 0) {
                return res.status(404).json({ error: 'No orders found for this route' });
            }

            const orders = ordersQuery.rows;

            // Calculate statistics
            let totalDistanceKm = 0;
            let totalOperationTimeMin = 0;
            let completedCount = 0;

            // Calculate distances between consecutive points
            for (let i = 0; i < orders.length - 1; i++) {
                if (orders[i].latitude && orders[i + 1].latitude) {
                    const distance = haversineDistance(
                        orders[i].latitude, orders[i].longitude,
                        orders[i + 1].latitude, orders[i + 1].longitude
                    );
                    totalDistanceKm += distance;
                }
                if (orders[i].execution_time_minutes) {
                    totalOperationTimeMin += orders[i].execution_time_minutes;
                    completedCount++;
                }
            }

            // Get vehicle fuel consumption if available
            let fuelConsumptionLiters = null;
            if (technician_id) {
                const vehicleQuery = await pool.query(`
                    SELECT v.km_per_gallon 
                    FROM vehicles v 
                    WHERE v.assigned_technician_id = $1 AND v.status = 'active'
                    LIMIT 1
                `, [technician_id]);

                if (vehicleQuery.rowCount > 0) {
                    const kmPerGallon = vehicleQuery.rows[0].km_per_gallon || 12;
                    // 1 gallon = 3.785 liters
                    fuelConsumptionLiters = (totalDistanceKm / kmPerGallon) * 3.785;
                }
            }

            // Estimate travel time (assume average 30 km/h urban, 50 km/h highway)
            const avgSpeedKmh = 35; // Mixed urban/rural
            const travelTimeMinutes = (totalDistanceKm / avgSpeedKmh) * 60;

            // Traffic adjustment (rush hours: 7-9am, 5-7pm add 30%)
            const currentHour = new Date().getHours();
            const isRushHour = (currentHour >= 7 && currentHour <= 9) || (currentHour >= 17 && currentHour <= 19);
            const trafficMultiplier = isRushHour ? 1.3 : 1.0;
            const travelTimeWithTraffic = travelTimeMinutes * trafficMultiplier;

            const stats = {
                route_id: routeId,
                total_orders: orders.length,
                completed_orders: completedCount,
                completion_rate: Math.round((completedCount / orders.length) * 100),

                // Distance metrics
                total_distance_km: Math.round(totalDistanceKm * 10) / 10,
                avg_distance_per_stop_km: Math.round((totalDistanceKm / orders.length) * 10) / 10,

                // Time metrics
                estimated_travel_time_minutes: Math.round(travelTimeMinutes),
                traffic_adjusted_time_minutes: Math.round(travelTimeWithTraffic),
                total_operation_time_minutes: totalOperationTimeMin,
                avg_operation_time_minutes: completedCount > 0 ? Math.round(totalOperationTimeMin / completedCount) : null,
                total_route_time_minutes: Math.round(travelTimeWithTraffic + totalOperationTimeMin),

                // Traffic impact
                is_rush_hour: isRushHour,
                traffic_delay_minutes: Math.round(travelTimeWithTraffic - travelTimeMinutes),

                // Fuel consumption
                estimated_fuel_liters: fuelConsumptionLiters ? Math.round(fuelConsumptionLiters * 10) / 10 : null,
                estimated_fuel_gallons: fuelConsumptionLiters ? Math.round((fuelConsumptionLiters / 3.785) * 10) / 10 : null,

                // Breakdown by time type
                time_breakdown: {
                    travel: Math.round(travelTimeMinutes),
                    traffic_delay: Math.round(travelTimeWithTraffic - travelTimeMinutes),
                    operations: totalOperationTimeMin,
                    total: Math.round(travelTimeWithTraffic + totalOperationTimeMin)
                }
            };

            res.json({ success: true, stats });
        } catch (error) {
            console.error('Error calculating route stats:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Get live route analytics for all active technicians
    router.get('/route-analytics/live', async (req, res) => {
        try {
            const now = Date.now();
            const analytics = [];

            // Process each tracked technician
            techLocations.forEach((loc, techId) => {
                const locTime = new Date(loc.timestamp).getTime();
                const minutesAgo = Math.round((now - locTime) / 60000);

                analytics.push({
                    technician_id: techId,
                    brigade_id: loc.brigade_id,
                    current_position: { lat: loc.lat, lng: loc.lng },
                    last_update: loc.timestamp,
                    minutes_since_update: minutesAgo,
                    is_active: minutesAgo < 10,
                    battery_level: loc.battery,
                    gps_accuracy: loc.accuracy
                });
            });

            res.json({
                success: true,
                active_technicians: analytics.filter(a => a.is_active).length,
                inactive_technicians: analytics.filter(a => !a.is_active).length,
                technicians: analytics
            });
        } catch (error) {
            console.error('Error fetching live analytics:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Compare planned vs actual route (deviation analysis)
    router.get('/route-deviation/:technicianId', async (req, res) => {
        const { technicianId } = req.params;
        const { date } = req.query;
        const targetDate = date || new Date().toISOString().split('T')[0];

        try {
            // Get planned route (orders in sequence)
            const plannedQuery = await pool.query(`
                SELECT 
                    order_number, address, latitude, longitude, 
                    route_sequence, status, execution_date
                FROM scrc_orders 
                WHERE technician_name = (SELECT name FROM drivers WHERE id = $1)
                  AND DATE(created_at) = $2
                ORDER BY route_sequence ASC
            `, [technicianId, targetDate]);

            // Get actual tracking data
            const actualQuery = await pool.query(`
                SELECT waypoints, started_at, ended_at 
                FROM route_tracking 
                WHERE technician_id = $1 
                  AND DATE(started_at) = $2
                ORDER BY started_at DESC
                LIMIT 1
            `, [technicianId, targetDate]);

            const plannedStops = plannedQuery.rows;
            const actualPath = actualQuery.rows[0]?.waypoints || [];

            // Calculate deviation
            let totalDeviationKm = 0;
            let deviations = [];

            plannedStops.forEach((stop, idx) => {
                if (!stop.latitude || !actualPath.length) return;

                // Find closest actual waypoint to this planned stop
                let minDist = Infinity;
                actualPath.forEach(wp => {
                    const dist = haversineDistance(stop.latitude, stop.longitude, wp.lat, wp.lng);
                    if (dist < minDist) minDist = dist;
                });

                if (minDist > 0.1) { // More than 100m deviation
                    deviations.push({
                        stop_number: idx + 1,
                        order_number: stop.order_number,
                        address: stop.address,
                        deviation_km: Math.round(minDist * 100) / 100
                    });
                    totalDeviationKm += minDist;
                }
            });

            res.json({
                success: true,
                technician_id: technicianId,
                date: targetDate,
                planned_stops: plannedStops.length,
                actual_waypoints: actualPath.length,
                total_deviation_km: Math.round(totalDeviationKm * 10) / 10,
                deviation_count: deviations.length,
                deviations,
                efficiency_score: plannedStops.length > 0
                    ? Math.round((1 - (deviations.length / plannedStops.length)) * 100)
                    : 100
            });
        } catch (error) {
            console.error('Error calculating route deviation:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Get daily route summary for a technician
    router.get('/route-summary/:technicianId', async (req, res) => {
        const { technicianId } = req.params;
        const { date_from, date_to } = req.query;

        const startDate = date_from || new Date().toISOString().split('T')[0];
        const endDate = date_to || startDate;

        try {
            const summary = await pool.query(`
                SELECT 
                    DATE(execution_date) as date,
                    COUNT(*) as total_orders,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed,
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed,
                    SUM(execution_time_minutes) as total_operation_time,
                    AVG(execution_time_minutes) as avg_operation_time,
                    MIN(execution_date) as first_order_time,
                    MAX(updated_at) as last_order_time
                FROM scrc_orders
                WHERE technician_name = (SELECT name FROM drivers WHERE id = $1)
                  AND DATE(execution_date) BETWEEN $2 AND $3
                GROUP BY DATE(execution_date)
                ORDER BY date DESC
            `, [technicianId, startDate, endDate]);

            // Get vehicle info for fuel calculations
            const vehicleQuery = await pool.query(`
                SELECT v.plate, v.km_per_gallon, v.type
                FROM vehicles v 
                WHERE v.assigned_technician_id = $1 AND v.status = 'active'
                LIMIT 1
            `, [technicianId]);

            const vehicle = vehicleQuery.rows[0] || null;

            res.json({
                success: true,
                technician_id: technicianId,
                vehicle: vehicle ? { plate: vehicle.plate, type: vehicle.type } : null,
                date_range: { from: startDate, to: endDate },
                days: summary.rows.map(day => ({
                    ...day,
                    completion_rate: day.total_orders > 0
                        ? Math.round((day.completed / day.total_orders) * 100)
                        : 0,
                    total_operation_time_formatted: formatMinutes(day.total_operation_time)
                }))
            });
        } catch (error) {
            console.error('Error fetching route summary:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Helper: Haversine distance in km
    function haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // Helper: Format minutes to readable string
    function formatMinutes(minutes) {
        if (!minutes) return '0m';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    return router;
};
