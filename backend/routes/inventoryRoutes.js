const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');

module.exports = (pool) => {
    // ==========================================
    // PRODUCTS CRUD
    // ==========================================

    // GET /api/inventory/products
    router.get('/products', authRequired, async (req, res) => {
        try {
            // Get products with total stock
            const result = await pool.query(`
                SELECT p.*, COALESCE(SUM(s.quantity), 0) as total_stock
                FROM products p
                LEFT JOIN inventory_stock s ON p.id = s.product_id
                GROUP BY p.id
                ORDER BY p.name ASC
            `);
            res.json(result.rows);
        } catch (err) {
            console.error('Error fetching products:', err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // POST /api/inventory/products
    router.post('/products', authRequired, requireRole('admin'), async (req, res) => {
        const { sku, name, category, unit, min_stock, image_url } = req.body;
        try {
            const result = await pool.query(
                `INSERT INTO products (sku, name, category, unit, min_stock, image_url)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [sku, name, category, unit, min_stock || 5, image_url]
            );
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Error creating product:', err);
            if (err.code === '23505') {
                return res.status(409).json({ error: 'El SKU ya existe' });
            }
            res.status(500).json({ error: 'Database error' });
        }
    });

    // DELETE /api/inventory/products/:id
    router.delete('/products/:id', authRequired, requireRole('admin'), async (req, res) => {
        const { id } = req.params;
        try {
            // Check usage
            const usage = await pool.query('SELECT count(*) FROM inventory_movements WHERE product_id = $1', [id]);
            if (parseInt(usage.rows[0].count) > 0) {
                return res.status(400).json({ error: 'No se puede eliminar: tiene movimientos asociados' });
            }

            await pool.query('DELETE FROM inventory_stock WHERE product_id = $1', [id]);
            await pool.query('DELETE FROM products WHERE id = $1', [id]);
            res.json({ success: true });
        } catch (err) {
            console.error('Error deleting product:', err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // ==========================================
    // WAREHOUSES CRUD
    // ==========================================

    // GET /api/inventory/warehouses
    router.get('/warehouses', authRequired, async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM warehouses ORDER BY name ASC');
            res.json(result.rows);
        } catch (err) {
            console.error('Error fetching warehouses:', err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // POST /api/inventory/warehouses
    router.post('/warehouses', authRequired, requireRole('admin'), async (req, res) => {
        const { name, type, location } = req.body;
        try {
            const result = await pool.query(
                `INSERT INTO warehouses (name, type, location)
                 VALUES ($1, $2, $3) RETURNING *`,
                [name, type || 'main', location]
            );
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Error creating warehouse:', err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // ==========================================
    // STOCK & MOVEMENTS
    // ==========================================

    // GET /api/inventory/stock/:warehouseId
    router.get('/stock/:warehouseId', authRequired, async (req, res) => {
        const { warehouseId } = req.params;
        try {
            const result = await pool.query(`
                SELECT s.*, p.sku, p.name, p.unit, p.category, p.min_stock
                FROM inventory_stock s
                JOIN products p ON s.product_id = p.id
                WHERE s.warehouse_id = $1 AND s.quantity > 0
                ORDER BY p.name ASC
            `, [warehouseId]);
            res.json(result.rows);
        } catch (err) {
            console.error('Error fetching stock:', err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // GET /api/inventory/movements
    router.get('/movements', authRequired, async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT m.*, 
                       p.name as product_name, p.sku,
                       w_from.name as from_warehouse,
                       w_to.name as to_warehouse
                FROM inventory_movements m
                JOIN products p ON m.product_id = p.id
                LEFT JOIN warehouses w_from ON m.from_warehouse_id = w_from.id
                LEFT JOIN warehouses w_to ON m.to_warehouse_id = w_to.id
                ORDER BY m.created_at DESC
                LIMIT 100
            `);
            res.json(result.rows);
        } catch (err) {
            console.error('Error fetching movements:', err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    /**
     * POST /api/inventory/movements
     * Handles IN, OUT, and TRANSFER movements transactionally
     */
    router.post('/movements', authRequired, async (req, res) => {
        const { product_id, from_warehouse_id, to_warehouse_id, quantity, type, reference, notes } = req.body;
        const userId = req.user.id; // Log who did it

        if (quantity <= 0) return res.status(400).json({ error: 'Cantidad debe ser positiva' });

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // 1. Record Movement
            await client.query(
                `INSERT INTO inventory_movements (product_id, from_warehouse_id, to_warehouse_id, quantity, type, reference, notes, user_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [product_id, from_warehouse_id, to_warehouse_id, quantity, type, reference, notes, userId]
            );

            // 2. Update Stock
            if (type === 'in' && to_warehouse_id) {
                // Add to destination
                await updateStock(client, to_warehouse_id, product_id, quantity);
            } else if (type === 'out' && from_warehouse_id) {
                // Remove from source
                await updateStock(client, from_warehouse_id, product_id, -quantity);
            } else if (type === 'transfer' && from_warehouse_id && to_warehouse_id) {
                // Remove from source, Add to destination
                await updateStock(client, from_warehouse_id, product_id, -quantity);
                await updateStock(client, to_warehouse_id, product_id, quantity);
            }

            await client.query('COMMIT');
            res.status(201).json({ success: true, message: 'Movimiento registrado' });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error creating movement:', err);
            if (err.message === 'Insufficient stock') {
                return res.status(400).json({ error: 'Stock insuficiente en bodega origen' });
            }
            res.status(500).json({ error: 'Database error' });
        } finally {
            client.release();
        }
    });

    // Helper to update stock safely
    const updateStock = async (client, warehouseId, productId, delta) => {
        // Check current stock
        const res = await client.query(
            'SELECT quantity FROM inventory_stock WHERE warehouse_id = $1 AND product_id = $2',
            [warehouseId, productId]
        );

        let currentQty = res.rows.length > 0 ? res.rows[0].quantity : 0;
        let newQty = currentQty + delta;

        if (newQty < 0) {
            throw new Error('Insufficient stock');
        }

        if (res.rows.length > 0) {
            await client.query(
                'UPDATE inventory_stock SET quantity = $1, updated_at = NOW() WHERE warehouse_id = $2 AND product_id = $3',
                [newQty, warehouseId, productId]
            );
        } else {
            await client.query(
                'INSERT INTO inventory_stock (warehouse_id, product_id, quantity) VALUES ($1, $2, $3)',
                [warehouseId, productId, newQty]
            );
        }
    };

    return router;
};
