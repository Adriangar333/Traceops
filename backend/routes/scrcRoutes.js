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

    return router;
};
