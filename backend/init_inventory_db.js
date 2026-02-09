const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false
});

const createTables = async () => {
    try {
        console.log('📦 Creating Inventory Control tables...');

        // 1. Warehouses Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS warehouses (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                type VARCHAR(20) DEFAULT 'main', -- 'main', 'mobile' (vehicle)
                location VARCHAR(200),
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('✅ Warehouses table created');

        // 2. Products Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                sku VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                category VARCHAR(50),
                unit VARCHAR(20), -- 'unidad', 'metro', 'kit'
                min_stock INTEGER DEFAULT 5,
                image_url TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('✅ Products table created');

        // 3. Inventory Stock Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS inventory_stock (
                id SERIAL PRIMARY KEY,
                warehouse_id INTEGER REFERENCES warehouses(id),
                product_id INTEGER REFERENCES products(id),
                quantity INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(warehouse_id, product_id)
            );
        `);
        console.log('✅ Inventory Stock table created');

        // 4. Inventory Movements Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS inventory_movements (
                id SERIAL PRIMARY KEY,
                product_id INTEGER REFERENCES products(id),
                from_warehouse_id INTEGER REFERENCES warehouses(id),
                to_warehouse_id INTEGER REFERENCES warehouses(id),
                quantity INTEGER NOT NULL,
                type VARCHAR(20), -- 'in', 'out', 'transfer'
                reference VARCHAR(100), -- Order ID, etc.
                notes TEXT,
                user_id INTEGER, -- Who made the movement
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('✅ Inventory Movements table created');

        // Seed some initial data if empty
        const whCount = await pool.query('SELECT count(*) FROM warehouses');
        if (parseInt(whCount.rows[0].count) === 0) {
            await pool.query(`
                INSERT INTO warehouses (name, type, location) VALUES 
                ('Bodega Principal', 'main', 'Sede Central'),
                ('Bodega Norte', 'main', 'Sede Norte')
            `);
            console.log('🌱 Seeded initial warehouses');
        }

        console.log('🎉 All Inventory tables created successfully!');
    } catch (err) {
        console.error('❌ Error creating tables:', err);
    } finally {
        await pool.end();
    }
};

createTables();
