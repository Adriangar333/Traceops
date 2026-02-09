const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');

// Multer storage for Excel uploads
const upload = multer({ storage: multer.memoryStorage() });

// SCRC Routes for ISES Field Service Management
// Accepts pool as dependency injection from index.js

module.exports = (pool) => {

    // ============================================
    // UPLOAD EXCEL FILE (Direct file upload)
    // ============================================
    router.post('/upload-excel', upload.single('file'), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        try {
            // Parse Excel file
            const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });

            console.log('📊 Available sheets:', workbook.SheetNames);

            // Function to check if a sheet has required columns
            const hasRequiredColumns = (sheetData) => {
                if (!sheetData || sheetData.length === 0) return false;
                const cols = Object.keys(sheetData[0]).map(c => c.toUpperCase());
                return cols.some(c => c.includes('NIC') || c.includes('ORDEN') || c === 'NUM ORDEN');
            };

            // Step 1: Try to find sheet by name (ASIGNACION variations)
            const targetSheetNames = ['ASIGNACION', 'asignacion', 'Asignacion', 'ASIGNACIÓN', 'Asignación', 'ASSIGNMENT'];
            let sheetName = workbook.SheetNames.find(name =>
                targetSheetNames.some(target => name.toLowerCase().includes(target.toLowerCase()))
            );

            let rawData = null;

            // Step 2: If found by name, check if it has required columns
            if (sheetName) {
                console.log(`📋 Found sheet by name: "${sheetName}"`);
                const sheet = workbook.Sheets[sheetName];
                rawData = XLSX.utils.sheet_to_json(sheet);

                if (!hasRequiredColumns(rawData)) {
                    console.log(`⚠️ Sheet "${sheetName}" doesn't have NIC/ORDEN columns, searching others...`);
                    sheetName = null; // Reset to trigger search
                }
            }

            // Step 3: If not found by name OR missing columns, search all sheets
            if (!sheetName) {
                console.log('🔍 Searching all sheets for NIC/ORDEN columns...');
                for (const name of workbook.SheetNames) {
                    const sheet = workbook.Sheets[name];
                    const data = XLSX.utils.sheet_to_json(sheet);

                    if (hasRequiredColumns(data)) {
                        console.log(`✅ Found required columns in sheet: "${name}"`);
                        sheetName = name;
                        rawData = data;
                        break;
                    }
                }
            }

            // Step 4: Final fallback - use first sheet
            if (!sheetName) {
                console.log('⚠️ No sheet with NIC/ORDEN found, using first sheet');
                sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                rawData = XLSX.utils.sheet_to_json(sheet);
            }

            console.log(`📊 Processing ${rawData.length} rows from sheet "${sheetName}"`);

            if (rawData.length === 0) {
                return res.status(400).json({ error: 'No data found in Excel file' });
            }

            // Log first row to debug column names
            console.log('📝 First row columns:', Object.keys(rawData[0]));

            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                let count = 0;
                let skipped = 0;
                const errors = [];

                for (const row of rawData) {
                    // Map columns flexibly (handle different column names)
                    const nic = row['NIC'] || row['nic'] || row['Nic'];
                    const ordenNum = row['ORDEN'] || row['orden'] || row['Orden'] || row['NUM ORDEN'];

                    if (!nic && !ordenNum) {
                        skipped++;
                        continue;
                    }

                    // Determine order type from TIPO DE OS
                    const tipoOS = row['TIPO DE OS'] || row['TIPO_DE_OS'] || row['tipo_os'] || '';
                    let orderType = 'suspension';
                    let priority = 2;

                    if (tipoOS.includes('502') || tipoOS.toLowerCase().includes('corte')) {
                        orderType = 'corte';
                        priority = 1;
                    } else if (tipoOS.includes('503') || tipoOS.toLowerCase().includes('recon')) {
                        orderType = 'reconexion';
                        priority = 3;
                    }

                    try {
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
                                status = 'pending',
                                amount_due = EXCLUDED.amount_due,
                                technician_name = EXCLUDED.technician_name,
                                updated_at = NOW()
                        `, [
                            nic,
                            ordenNum || `ORD-${Date.now()}-${count}`,
                            orderType,
                            tipoOS,
                            priority,
                            row['TECNICO'] || row['tecnico'] || row['NOMBRE TECNICO'] || null,
                            row['NOMBRE DEL CLIENTE'] || row['CLIENTE'] || row['cliente'] || null,
                            row['DIRECCION'] || row['direccion'] || row['DIRECCIÓN'] || null,
                            row['MUNICIPIO'] || row['municipio'] || null,
                            row['BARRIO'] || row['barrio'] || null,
                            row['DEPARTAMENTO'] || row['departamento'] || 'ATLANTICO',
                            row['BRIGADA'] || row['brigada'] || row['ZONA'] || null,
                            row['TIPO DE BRIGADA'] || row['tipo_brigada'] || null,
                            row['LINEA ESTRATEGICA'] || row['linea_estrategica'] || row['ALCANCE'] || null,
                            parseFloat(String(row['DEUDA'] || row['deuda'] || '0').replace(/[,$]/g, '')) || 0,
                            row['TARIFA'] || row['tarifa'] || null,
                            row['MEDIDOR'] || row['medidor'] || row['NUM MEDIDOR'] || null,
                            row['MARCA MEDIDOR'] || row['marca_medidor'] || null,
                            row['FECHA ASIGNACION'] || row['FECHA'] || new Date(),
                            row['OBSERVACIONES'] || row['observaciones'] || null
                        ]);
                        count++;
                    } catch (rowErr) {
                        errors.push({ row: count + skipped, error: rowErr.message });
                        skipped++;
                    }
                }

                await client.query('COMMIT');
                console.log(`📥 Excel upload: ${count} orders inserted, ${skipped} skipped`);

                const response = {
                    success: true,
                    count,
                    skipped,
                    sheetName,
                    totalRows: rawData.length,
                    errors: errors.slice(0, 5) // Return first 5 errors only
                };

                // Add helpful info if no orders were loaded
                if (count === 0 && skipped > 0) {
                    response.hint = 'Verifica que tu Excel tenga columnas NIC u ORDEN. Columnas detectadas: ' + Object.keys(rawData[0] || {}).join(', ');
                    response.requiredColumns = ['NIC', 'ORDEN'];
                }

                res.json(response);
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
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
                    order['FECHA ASIGNACION'] || new Date(),
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

    return router;
};
