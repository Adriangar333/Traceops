
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function seed() {
    const client = await pool.connect();
    try {
        console.log('--- Seeding SCRC Orders from Delivery Proofs ---');

        // 1. Get unique route_ids from proofs
        const res = await client.query(`
            SELECT DISTINCT route_id 
            FROM delivery_proofs 
            WHERE route_id NOT IN (SELECT order_number::text FROM scrc_orders)
        `);

        const routes = res.rows.map(r => r.route_id);
        console.log(`Found ${routes.length} orphan proofs to seed.`);

        if (routes.length === 0) {
            console.log('No orphans found, or all already exist.');
            return;
        }

        await client.query('BEGIN');

        for (const routeId of routes) {
            console.log(`Seeding order for route_id: ${routeId}`);

            await client.query(`
                INSERT INTO scrc_orders (
                    nic, order_number, client_name, address, municipality, 
                    technician_name, status, audit_status, created_at, execution_date,
                    order_type, priority
                ) VALUES (
                    $1, $2, $3, $4, $5, 
                    $6, $7, $8, NOW(), NOW(),
                    'corte', 1
                )
            `, [
                `NIC-${routeId.substring(0, 6)}`, // Fake NIC
                routeId,                         // Order Number matching route_id
                'Cliente De Prueba',             // Fake Client
                'Dirección de Prueba 123',       // Fake Address
                'Medellin',
                'Tecnico Pruebas',
                'completed',                     // Status required for default filter
                'pending'                        // Audit Status
            ]);
        }

        await client.query('COMMIT');
        console.log('✅ Successfully seeded orders.');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error seeding:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
