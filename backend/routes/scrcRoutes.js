const express = require('express');
const router = express.Router();

// SCRC Routes for ISES Field Service Management
// Accepts pool as dependency injection from index.js

module.exports = (pool) => {

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

    return router;
};
