const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const axios = require('axios');

// Multer storage for Excel uploads
const upload = multer({ storage: multer.memoryStorage() });

// SCRC Routes for ISES Field Service Management
// Accepts pool as dependency injection from index.js

module.exports = (pool) => {

    // Helper: Convert Excel serial number to JS Date
    // Excel serial 1 = Jan 1, 1900. JS epoch = Jan 1, 1970.
    const parseExcelDate = (value) => {
        if (!value) return new Date();
        // If it's already a valid date string, return as-is
        if (typeof value === 'string' && isNaN(Number(value))) {
            const parsed = new Date(value);
            if (!isNaN(parsed.getTime())) return parsed;
            return new Date(); // fallback
        }
        // If it's a number (Excel serial), convert
        const num = Number(value);
        if (!isNaN(num) && num > 10000 && num < 100000) {
            // Excel serial number: days since Jan 1, 1900 (with the famous leap year bug)
            const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
            return new Date(excelEpoch.getTime() + num * 86400000);
        }
        // If it's a small number or something else, fallback
        return new Date();
    };

    // ============================================
    // UPLOAD EXCEL FILE (OPTIMIZED with batch inserts)
    // ============================================
    router.post('/upload-excel', upload.single('file'), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const startTime = Date.now();

        try {
            const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
            console.log('📊 Available sheets:', workbook.SheetNames);

            // Find the right sheet
            const targetSheetNames = ['ASIGNACION', 'asignacion', 'Asignacion', 'ASIGNACIÓN'];
            let sheetName = workbook.SheetNames.find(name =>
                targetSheetNames.some(target => name.toLowerCase().includes(target.toLowerCase()))
            ) || workbook.SheetNames[0];

            const sheet = workbook.Sheets[sheetName];
            let rawData = XLSX.utils.sheet_to_json(sheet);

            // Try row 2 as headers if needed
            if (rawData.length > 0 && !Object.keys(rawData[0]).some(k => k.toUpperCase().includes('NIC') || k.toUpperCase().includes('ORDEN'))) {
                rawData = XLSX.utils.sheet_to_json(sheet, { range: 1 });
            }

            console.log(`📊 Processing ${rawData.length} rows from sheet "${sheetName}"`);

            if (rawData.length === 0) {
                return res.status(400).json({ error: 'No data found in Excel file' });
            }

            // Helpers
            const normalizeKey = (key) => key?.toString().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "") || '';
            const toVal = (val) => (val === undefined || val === null) ? null : (typeof val === 'number' ? String(val) : String(val).trim() || null);

            const getCol = (row, ...names) => {
                const keys = Object.keys(row);
                const normMap = keys.reduce((a, k) => { a[normalizeKey(k)] = k; return a; }, {});
                for (const n of names) {
                    const t = normalizeKey(n);
                    if (normMap[t]) { const v = toVal(row[normMap[t]]); if (v) return v; }
                    const partial = Object.keys(normMap).find(k => k.includes(t));
                    if (partial) { const v = toVal(row[normMap[partial]]); if (v) return v; }
                }
                return null;
            };

            // Prepare all rows for batch insert
            const BATCH_SIZE = 500;
            const validRows = [];
            let skipped = 0;

            for (const row of rawData) {
                const nic = getCol(row, 'NIC', 'NIC CLIENTE');
                const orden = getCol(row, 'ORDEN', 'NUM ORDEN', 'NUMERO ORDEN');
                const direccion = getCol(row, 'DIRECCION', 'DIRECCIÓN');

                if (!nic && !orden) { skipped++; continue; }

                const tipoOS = row['TIPO DE OS'] || '';
                let orderType = 'suspension', priority = 2;
                if (tipoOS.includes('502') || tipoOS.toLowerCase().includes('corte')) { orderType = 'corte'; priority = 1; }
                else if (tipoOS.includes('503') || tipoOS.toLowerCase().includes('recon')) { orderType = 'reconexion'; priority = 3; }

                validRows.push([
                    nic,
                    orden || nic,
                    orderType,
                    tipoOS,
                    priority,
                    getCol(row, 'TECNICO', 'NOMBRE TECNICO'),
                    getCol(row, 'NOMBRE DEL CLIENTE', 'CLIENTE'),
                    direccion,
                    getCol(row, 'MUNICIPIO'),
                    getCol(row, 'BARRIO'),
                    getCol(row, 'DEPARTAMENTO') || 'ATLANTICO',
                    getCol(row, 'BRIGADA', 'ZONA'),
                    getCol(row, 'TIPO DE BRIGADA'),
                    getCol(row, 'LINEA ESTRATEGICA'),
                    parseFloat(String(getCol(row, 'DEUDA', ' DEUDA ') || '0').replace(/[,$]/g, '')) || 0,
                    getCol(row, 'TARIFA'),
                    getCol(row, 'MEDIDOR', 'NUM MEDIDOR'),
                    getCol(row, 'MARCA MEDIDOR'),
                    row['OBSERVACIONES'] || row['observacion'] || null
                ]);
            }

            console.log(`✅ ${validRows.length} valid rows, ${skipped} skipped`);

            // Batch insert
            const client = await pool.connect();
            let count = 0;

            try {
                await client.query('BEGIN');

                for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
                    const batch = validRows.slice(i, i + BATCH_SIZE);
                    const values = [];
                    const placeholders = batch.map((row, idx) => {
                        const offset = idx * 19;
                        values.push(...row);
                        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}, $${offset + 17}, $${offset + 18}, 'pending', $${offset + 19})`;
                    }).join(',\n');

                    await client.query(`
                        INSERT INTO scrc_orders (
                            nic, order_number, order_type, product_code, priority,
                            technician_name, client_name, address, municipality, neighborhood,
                            department, zone_code, brigade_type, strategic_line,
                            amount_due, tariff, meter_number, meter_brand, status, notes
                        ) VALUES ${placeholders}
                        ON CONFLICT (order_number) DO UPDATE SET
                            neighborhood = EXCLUDED.neighborhood,
                            meter_number = EXCLUDED.meter_number,
                            meter_brand = EXCLUDED.meter_brand,
                            client_name = EXCLUDED.client_name,
                            address = EXCLUDED.address,
                            technician_name = EXCLUDED.technician_name,
                            amount_due = EXCLUDED.amount_due,
                            updated_at = NOW()
                    `, values);

                    count += batch.length;
                    console.log(`  ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${count} rows`);
                }

                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`📥 Excel upload: ${count} orders in ${elapsed}s`);

            res.json({
                success: true,
                count,
                skipped,
                sheetName,
                totalRows: rawData.length,
                elapsedSeconds: parseFloat(elapsed),
                detectedColumns: Object.keys(rawData[0] || {})
            });

        } catch (err) {
            console.error('Excel upload error:', err);
            res.status(500).json({ error: 'Failed to process Excel file', details: err.message });
        }
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
                    parseExcelDate(order['FECHA ASIGNACION']),
                    order['OBSERVACIONES'] || order.observaciones || null
                ]);
                count++;
            }

            await client.query('COMMIT');
            console.log(`📥 Ingested ${count} SCRC orders (${skipped} skipped)`);
            res.json({ success: true, count, skipped });
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
        const { status, brigade_type, technician, municipality, audit_status, limit = 100, offset = 0 } = req.query;

        try {
            // Optimized query - don't fetch evidence here, let GraphQL handle it
            // Also don't use 'type' column which doesn't exist
            let query = `
                SELECT
                    id, order_number, nic, order_type, product_code, priority,
                    technician_name, client_name, address, municipality, neighborhood,
                    department, zone_code, brigade_type, strategic_line,
                    amount_due, tariff, meter_number, meter_brand,
                    status, audit_status, notes, latitude, longitude,
                    assigned_brigade_id, assigned_at, assignment_date, execution_date,
                    created_at, updated_at,
                    (SELECT COUNT(*) FROM delivery_proofs WHERE route_id = scrc_orders.order_number::text AND photo IS NOT NULL) as photo_count,
                    (SELECT COUNT(*) FROM delivery_proofs WHERE route_id = scrc_orders.order_number::text AND signature IS NOT NULL) as signature_count
                FROM scrc_orders
                WHERE 1=1
            `;
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
            if (audit_status) {
                query += ` AND (audit_status = $${paramIndex++} OR ($${paramIndex}::text = 'pending' AND audit_status IS NULL))`;
                params.push(audit_status, audit_status);
                paramIndex++;
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
    // CLEANUP ORDERS (Delete by mode)
    // ============================================
    router.delete('/orders/cleanup', async (req, res) => {
        const { mode, status, order_type, before_date } = req.body;

        if (!mode || !['all', 'by_status', 'by_type', 'by_date'].includes(mode)) {
            return res.status(400).json({ error: 'Invalid mode. Use: all, by_status, by_type, by_date' });
        }

        try {
            let query, params = [];

            switch (mode) {
                case 'all':
                    query = 'DELETE FROM scrc_orders';
                    break;
                case 'by_status':
                    if (!status) return res.status(400).json({ error: 'Status is required for by_status mode' });
                    query = 'DELETE FROM scrc_orders WHERE status = $1';
                    params = [status];
                    break;
                case 'by_type':
                    if (!order_type) return res.status(400).json({ error: 'order_type is required for by_type mode' });
                    query = 'DELETE FROM scrc_orders WHERE order_type = $1';
                    params = [order_type];
                    break;
                case 'by_date':
                    if (!before_date) return res.status(400).json({ error: 'before_date is required for by_date mode' });
                    query = 'DELETE FROM scrc_orders WHERE created_at < $1';
                    params = [before_date];
                    break;
            }

            const result = await pool.query(query, params);
            console.log(`🗑️ Cleanup (${mode}): deleted ${result.rowCount} orders`);
            res.json({ success: true, deleted: result.rowCount, mode });
        } catch (err) {
            console.error('Cleanup orders error:', err);
            res.status(500).json({ error: 'Failed to cleanup orders', details: err.message });
        }
    });

    // ============================================
    // UPLOAD EVIDENCE (Photo, Signature, etc.)
    // ============================================
    router.post('/orders/:id/evidence', async (req, res) => {
        const { id } = req.params; // This is the order_number
        const { type, reading, action, notes, lat, lng, capturedAt, photo, signature, technician_name } = req.body;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            console.log(`📸 Received evidence for order #${id} (${type})`);

            // 1. Check if order exists in scrc_orders
            let orderCheck = await client.query('SELECT id FROM scrc_orders WHERE order_number = $1', [id]);

            // 2. If not found, try to find in 'routes' table and AUTO-CREATE
            if (orderCheck.rowCount === 0) {
                console.log(`⚠️ Order ${id} not found in SCRC. Checking manual routes...`);

                const routeCheck = await client.query('SELECT * FROM routes WHERE order_number = $1', [id]);

                if (routeCheck.rowCount > 0) {
                    const r = routeCheck.rows[0];
                    console.log(`✅ Found in routes table. Auto-creating SCRC order...`);

                    const insertResult = await client.query(`
                        INSERT INTO scrc_orders (
                            order_number, nic, client_name, address, municipality, neighborhood,
                            order_type, brigade_type, amount_due, priority, status,
                            lat, lng, assigned_at, created_at, technician_name
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6,
                            $7, $8, $9, $10, 'in_progress',
                            $11, $12, NOW(), NOW(), $13
                        ) RETURNING id
                    `, [
                        r.order_number, r.nic, r.client_name, r.address, r.municipality, r.neighborhood,
                        r.order_type || 'manual', 'moto', r.amount_due || 0, 1,
                        r.lat, r.lng, technician_name || null
                    ]);

                    orderCheck = insertResult; // Use the new ID
                } else {
                    throw new Error(`Order ${id} not found in SCRC or Routes`);
                }
            }

            // 3. Insert Evidence into delivery_proofs
            // Check if we need to add a signature column to delivery_proofs or store it in photo/metadata
            // For now, we'll store specific types. 
            // If type is 'signature', we save it. If type is 'photo', we save it.
            // But usually this comes as a single "execution" pack. 
            // We will save row by row.

            // If payload has 'photo', save it
            if (photo) {
                await client.query(`
                    INSERT INTO delivery_proofs (
                        route_id, type, photo, reading, action_taken, 
                        notes, lat, lng, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    id, 'photo', photo, reading, action,
                    notes, lat, lng, capturedAt || new Date()
                ]);
            }

            // If payload has 'signature', save it 
            if (signature) {
                await client.query(`
                    INSERT INTO delivery_proofs (
                        route_id, type, photo, reading, action_taken, 
                        notes, lat, lng, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    id, 'signature', signature, reading, action,
                    notes, lat, lng, capturedAt || new Date()
                ]);
            }

            // 4. Update SCRC Order Status
            let newStatus = 'completed';
            if (action === 'failed' || action === 'postponed') newStatus = 'failed';

            await client.query(`
                UPDATE scrc_orders 
                SET status = $1, 
                    technician_name = COALESCE($2, technician_name),
                    updated_at = NOW(),
                    notes = COALESCE(notes, '') || E'\n' || $3
                WHERE order_number = $4
            `, [newStatus, technician_name, notes, id]);

            await client.query('COMMIT');
            res.json({ success: true, message: 'Evidence saved' });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Evidence upload error:', err);
            res.status(500).json({ error: 'Failed to save evidence', details: err.message });
        } finally {
            client.release();
        }
    });

    // ============================================
    // AUDIT ENDPOINT
    // ============================================
    router.post('/orders/:id/audit', async (req, res) => {
        const { id } = req.params;
        const { status, reason, auditor } = req.body; // status: 'approved' | 'rejected'

        if (!['approved', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({ error: 'Invalid audit status' });
        }

        try {
            const result = await pool.query(`
                UPDATE scrc_orders 
                SET audit_status = $1, 
                    rejection_reason = $2,
                    audited_at = NOW(),
                    audited_by = $3
                WHERE id = $4
                RETURNING *
            `, [status, reason, auditor || 'System', id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Order not found' });
            }

            // Sync audit_status and rejection_reason to delivery_proofs
            const order = result.rows[0];
            await pool.query(
                `UPDATE delivery_proofs 
                 SET audit_status = $1, rejection_reason = $2,
                     reviewed_by = $3, reviewed_at = NOW()
                 WHERE route_id = $4`,
                [status, reason || null, auditor || 'System', order.order_number]
            );

            res.json({ success: true, order });
        } catch (err) {
            console.error('Audit update error:', err);
            res.status(500).json({ error: 'Failed to update audit status' });
        }
    });

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
    // 5. ROUTING ENGINE - Auto-assign orders
    // ============================================
    const { RoutingEngine, BRIGADE_CAPACITIES, ALCANCE_BRIGADE_MATRIX } = require('../services/routingEngine');
    const routingEngine = new RoutingEngine(pool);

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

    // POST /api/scrc/brigades/generate-from-orders
    // Automatically generate brigades from unique technicians in orders
    router.post('/brigades/generate-from-orders', async (req, res) => {
        const { type = 'corte', capacity_per_day = 25 } = req.body;

        const client = await pool.connect();
        try {
            // Get unique technicians from orders
            const techResult = await client.query(`
                SELECT DISTINCT technician_name
                FROM scrc_orders
                WHERE technician_name IS NOT NULL
                AND technician_name != ''
                ORDER BY technician_name
            `);

            if (techResult.rows.length === 0) {
                return res.json({ success: true, count: 0, message: 'No technicians found in orders' });
            }

            await client.query('BEGIN');
            let created = 0;
            let updated = 0;

            for (const row of techResult.rows) {
                const name = row.technician_name.trim();
                if (!name) continue;

                const result = await client.query(`
                    INSERT INTO brigades (name, type, members, capacity_per_day, status)
                    VALUES ($1, $2, $3, $4, 'active')
                    ON CONFLICT ON CONSTRAINT brigades_name_key DO UPDATE
                    SET updated_at = NOW()
                    RETURNING (xmax = 0) as inserted
                `, [name, type, JSON.stringify([{ name: name, role: 'titular' }]), capacity_per_day]);

                if (result.rows[0]?.inserted) {
                    created++;
                } else {
                    updated++;
                }
            }

            await client.query('COMMIT');

            console.log(`✅ Generated brigades: ${created} created, ${updated} updated`);
            res.json({
                success: true,
                created,
                updated,
                total: created + updated,
                message: `${created} brigadas creadas, ${updated} actualizadas`
            });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Generate brigades error:', err);
            res.status(500).json({ error: 'Failed to generate brigades', details: err.message, stack: err.stack });
        } finally {
            client.release();
        }
    });

    // DELETE /api/scrc/brigades/:id
    // Delete a brigade
    router.delete('/brigades/:id', async (req, res) => {
        const { id } = req.params;
        try {
            // First unassign any orders from this brigade
            await pool.query(`
                UPDATE scrc_orders
                SET assigned_brigade_id = NULL, status = 'pending'
                WHERE assigned_brigade_id = $1
            `, [id]);

            const result = await pool.query('DELETE FROM brigades WHERE id = $1 RETURNING *', [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Brigade not found' });
            }

            res.json({ success: true, deleted: result.rows[0] });
        } catch (err) {
            console.error('Delete brigade error:', err);
            res.status(500).json({ error: 'Failed to delete brigade' });
        }
    });

    // PUT /api/scrc/brigades/:id
    // Update a brigade
    router.put('/brigades/:id', async (req, res) => {
        const { id } = req.params;
        const { name, type, members, capacity_per_day, status } = req.body;

        try {
            const result = await pool.query(`
                UPDATE brigades
                SET name = COALESCE($1, name),
                    type = COALESCE($2, type),
                    members = COALESCE($3, members),
                    capacity_per_day = COALESCE($4, capacity_per_day),
                    status = COALESCE($5, status),
                    updated_at = NOW()
                WHERE id = $6
                RETURNING *
            `, [name, type, members, capacity_per_day, status, id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Brigade not found' });
            }

            res.json({ brigade: result.rows[0] });
        } catch (err) {
            console.error('Update brigade error:', err);
            res.status(500).json({ error: 'Failed to update brigade' });
        }
    });

    // ============================================
    // GEOCODING ENDPOINTS
    // ============================================

    // GET /api/scrc/geocoding/stats
    // Get statistics about geocoded orders
    router.get('/geocoding/stats', async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT
                    COUNT(*) as total,
                    COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as geocoded,
                    COUNT(CASE WHEN latitude IS NULL OR longitude IS NULL THEN 1 END) as pending
                FROM scrc_orders
            `);
            res.json(result.rows[0]);
        } catch (err) {
            console.error('Geocoding stats error:', err);
            res.status(500).json({ error: 'Failed to get stats' });
        }
    });

    // POST /api/scrc/geocoding/batch
    // Batch geocode orders without coordinates
    router.post('/geocoding/batch', async (req, res) => {
        const { limit = 100, city = 'Barranquilla, Colombia' } = req.body;
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;

        if (!apiKey) {
            return res.status(400).json({
                error: 'GOOGLE_MAPS_API_KEY not configured',
                hint: 'Set GOOGLE_MAPS_API_KEY environment variable'
            });
        }

        try {
            // Get orders without coordinates
            const ordersResult = await pool.query(`
                SELECT id, order_number, address, neighborhood
                FROM scrc_orders
                WHERE (latitude IS NULL OR longitude IS NULL)
                AND address IS NOT NULL AND address != ''
                LIMIT $1
            `, [limit]);

            if (ordersResult.rows.length === 0) {
                return res.json({ success: true, geocoded: 0, message: 'No orders to geocode' });
            }

            console.log(`🌍 Geocoding ${ordersResult.rows.length} orders...`);

            let geocoded = 0;
            let failed = 0;
            const errors = [];

            for (const order of ordersResult.rows) {
                try {
                    // Build full address
                    const fullAddress = `${order.address}, ${order.neighborhood || ''}, ${city}`.replace(/,\s*,/g, ',');

                    // Call Google Geocoding API
                    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
                        params: {
                            address: fullAddress,
                            key: apiKey,
                            components: 'country:CO'
                        },
                        timeout: 5000
                    });

                    if (response.data.status === 'OK' && response.data.results?.length > 0) {
                        const location = response.data.results[0].geometry.location;

                        // Update order with coordinates
                        await pool.query(`
                            UPDATE scrc_orders
                            SET latitude = $1, longitude = $2,
                                location = ST_SetSRID(ST_MakePoint($2, $1), 4326)
                            WHERE id = $3
                        `, [location.lat, location.lng, order.id]);

                        geocoded++;
                    } else {
                        failed++;
                        errors.push({ order_number: order.order_number, reason: response.data.status });
                    }

                    // Rate limiting - Google allows 50 req/sec, we do 10/sec to be safe
                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (err) {
                    failed++;
                    errors.push({ order_number: order.order_number, reason: err.message });
                }
            }

            console.log(`✅ Geocoding complete: ${geocoded} success, ${failed} failed`);

            res.json({
                success: true,
                processed: ordersResult.rows.length,
                geocoded,
                failed,
                errors: errors.slice(0, 10) // Only first 10 errors
            });

        } catch (err) {
            console.error('Batch geocoding error:', err);
            res.status(500).json({ error: 'Failed to geocode', details: err.message });
        }
    });

    // POST /api/scrc/geocoding/simulate
    // Simulate coordinates for orders (for testing without Google API)
    // Uses neighborhood centroids for Barranquilla
    router.post('/geocoding/simulate', async (req, res) => {
        const { limit = 500 } = req.body;

        // Approximate centroids for Barranquilla neighborhoods
        const BARRANQUILLA_CENTROIDS = {
            'DEFAULT': { lat: 10.9685, lng: -74.7813 }, // Centro Barranquilla
            'NORTE': { lat: 11.0050, lng: -74.8100 },
            'SUR': { lat: 10.9300, lng: -74.8000 },
            'CENTRO': { lat: 10.9685, lng: -74.7813 },
            'RIOMAR': { lat: 11.0110, lng: -74.8050 },
            'PRADO': { lat: 10.9950, lng: -74.8000 },
            'CIUDADELA': { lat: 10.9300, lng: -74.8100 },
            'SOLEDAD': { lat: 10.9100, lng: -74.7700 },
            'MALAMBO': { lat: 10.8600, lng: -74.7700 },
            'GALAPA': { lat: 10.9000, lng: -74.8800 }
        };

        try {
            // Get orders without coordinates
            const ordersResult = await pool.query(`
                SELECT id, neighborhood, address
                FROM scrc_orders
                WHERE (latitude IS NULL OR longitude IS NULL)
                LIMIT $1
            `, [limit]);

            if (ordersResult.rows.length === 0) {
                return res.json({ success: true, simulated: 0, message: 'No orders to simulate' });
            }

            console.log(`🎯 Simulating coordinates for ${ordersResult.rows.length} orders...`);

            let simulated = 0;

            for (const order of ordersResult.rows) {
                // Try to match neighborhood
                let centroid = BARRANQUILLA_CENTROIDS.DEFAULT;
                const nb = (order.neighborhood || '').toUpperCase();

                for (const [key, coords] of Object.entries(BARRANQUILLA_CENTROIDS)) {
                    if (nb.includes(key)) {
                        centroid = coords;
                        break;
                    }
                }

                // Add random offset (up to ~500m) to spread markers
                const latOffset = (Math.random() - 0.5) * 0.01;
                const lngOffset = (Math.random() - 0.5) * 0.01;

                const lat = centroid.lat + latOffset;
                const lng = centroid.lng + lngOffset;

                await pool.query(`
                    UPDATE scrc_orders
                    SET latitude = $1, longitude = $2,
                        location = ST_SetSRID(ST_MakePoint($2, $1), 4326)
                    WHERE id = $3
                `, [lat, lng, order.id]);

                simulated++;
            }

            console.log(`✅ Simulated ${simulated} coordinates`);

            res.json({
                success: true,
                simulated,
                message: `${simulated} órdenes con coordenadas simuladas`
            });

        } catch (err) {
            console.error('Simulate geocoding error:', err);
            res.status(500).json({ error: 'Failed to simulate', details: err.message });
        }
    });

    return router;
};
