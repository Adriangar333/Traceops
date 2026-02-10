
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function debug() {
    try {
        console.log('--- Debugging SCRC Data Distribution ---');

        // 1. Status Counts
        const res1 = await pool.query("SELECT status, count(*) FROM scrc_orders GROUP BY status");
        console.log('Order Status Distribution:');
        console.table(res1.rows);

        // 2. Audit Status Counts
        const res2 = await pool.query("SELECT audit_status, count(*) FROM scrc_orders GROUP BY audit_status");
        console.log('Audit Status Distribution:');
        console.table(res2.rows);

        // 3. Check if Proofs have matching Orders
        const res3 = await pool.query(`
            SELECT 
                dp.route_id, 
                so.status as order_status, 
                so.audit_status
            FROM delivery_proofs dp
            LEFT JOIN scrc_orders so ON so.order_number::text = dp.route_id
            LIMIT 5
        `);
        console.log('Sample Proof Links:');
        console.table(res3.rows);

        // 4. Check if any order has `route_id` matching `delivery_proofs`
        const res4 = await pool.query(`
            SELECT count(*) 
            FROM scrc_orders so
            JOIN delivery_proofs dp ON so.order_number::text = dp.route_id
        `);
        console.log(`Matching Orders with Proofs: ${res4.rows[0].count}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

debug();
