const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false
});

const createTables = async () => {
    try {
        console.log('🏗️ Creating Fleet Management tables...');

        // 1. Vehicles Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS vehicles (
                id SERIAL PRIMARY KEY,
                plate VARCHAR(20) UNIQUE NOT NULL,
                brand VARCHAR(50),
                model VARCHAR(50),
                type VARCHAR(20), -- 'moto', 'carro', 'camion'
                status VARCHAR(20) DEFAULT 'active', -- 'active', 'repair', 'inactive'
                km_current INTEGER DEFAULT 0,
                soat_expiry DATE,
                tecno_expiry DATE,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('✅ Vehicles table created');

        // 2. Vehicle Assignments Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS vehicle_assignments (
                id SERIAL PRIMARY KEY,
                vehicle_id INTEGER REFERENCES vehicles(id),
                driver_id INTEGER NOT NULL, -- Logical reference to users table (id is integer there)
                assigned_at TIMESTAMP DEFAULT NOW(),
                unassigned_at TIMESTAMP,
                status VARCHAR(20) DEFAULT 'active',
                initial_km INTEGER,
                final_km INTEGER,
                notes TEXT
            );
        `);
        console.log('✅ Vehicle Assignments table created');

        // 3. Maintenance Logs Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS maintenance_logs (
                id SERIAL PRIMARY KEY,
                vehicle_id INTEGER REFERENCES vehicles(id),
                type VARCHAR(20), -- 'preventive', 'corrective'
                description TEXT,
                cost DECIMAL(10, 2),
                date DATE,
                status VARCHAR(20) DEFAULT 'completed',
                workshop VARCHAR(100),
                limit_km INTEGER, -- For next maintenance reminder
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('✅ Maintenance Logs table created');

        console.log('🎉 All tables created successfully!');
    } catch (err) {
        console.error('❌ Error creating tables:', err);
    } finally {
        await pool.end();
    }
};

createTables();
