const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Reuse the pool from index.js pattern (passed as dependency or separate module)
//Ideally we should have a db.js module, but for now we'll assume pool is available or passed.
// To keep it simple and consistent with current structure, we'll export a function that accepts 'pool'.

module.exports = (pool) => {
    // 1. Ingest Data (Webhook from n8n)
    // EXPECTS: Array of objects mapped from Excel
    router.post('/ingest', async (req, res) => {
        const { buffer } = req.body; // Expecting { buffer: [...] }

        if (!buffer || !Array.isArray(buffer)) {
            return res.status(400).json({ error: 'Invalid payload: buffer array required' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Prepare for batch insert
            // Using a simple loop for now, optimization for 10k+ records would require COPY or UNNEST
            let count = 0;

            for (const order of buffer) {
                // Determine order type priority
                // 70501 (Corte) -> 1
                // 70503 (Revision) -> 2
                // 70502 (Reconexión) -> 3
                let priority = 2;
                if (order.product_code === '70501') priority = 1;
                if (order.product_code === '70502') priority = 3;

                await client.query(`
                    INSERT INTO scrc_orders (
                        nic, order_type, product_code, priority, client_name, address, 
                        zone_code, amount_due, cycle, latitude, longitude, 
                        location, status
                    )
                    VALUES (
                        $1, $2, $3, $4, $5, $6, 
                        $7, $8, $9, $10, $11, 
                        ST_SetSRID(ST_MakePoint($11, $10), 4326), 'pending'
                    )
                    ON CONFLICT (id) DO NOTHING -- Should define better conflict strategy (e.g. update status)
                `, [
                    order.nic,
                    order.order_type,
                    order.product_code,
                    priority,
                    order.client_name,
                    order.address,
                    order.zone_code,
                    order.amount_due,
                    order.cycle,
                    parseFloat(order.latitude) || 0,
                    parseFloat(order.longitude) || 0
                ]);
                count++;
            }

            await client.query('COMMIT');
            console.log(`📥 Ingested ${count} SCRC orders`);
            res.json({ success: true, count });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Ingest error:', err);
            res.status(500).json({ error: 'Failed to ingest data' });
        } finally {
            client.release();
        }
    });

    // 2. Poll/Update Debt (For n8n 30min job)
    router.post('/update-debt', async (req, res) => {
        const { payments } = req.body; // Array of NICs that paid

        if (!payments || !Array.isArray(payments)) {
            return res.status(400).json({ error: 'Invalid payload: payments array required' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const placeholders = payments.map((_, i) => `$${i + 1}`).join(',');
            // Cancel pending cuts only
            const result = await client.query(`
                UPDATE scrc_orders 
                SET status = 'cancelled_payment', 
                    updated_at = NOW(),
                    notes = COALESCE(notes, '') || ' | Auto-cancelled by debt payment'
                WHERE nic IN (${placeholders}) 
                  AND status IN ('pending', 'assigned')
                  AND order_type IN ('corte', 'suspension')
                RETURNING nic
            `, payments);

            await client.query('COMMIT');
            console.log(`💸 Processed payments, cancelled ${result.rowCount} orders`);
            res.json({ success: true, cancelled_count: result.rowCount, cancelled_nics: result.rows.map(r => r.nic) });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Update debt error:', err);
            res.status(500).json({ error: 'Failed to update debt' });
        } finally {
            client.release();
        }
    });

    return router;
};
