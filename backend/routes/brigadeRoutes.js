/**
 * Brigade Management Routes
 * CRUD for brigades and member assignment (Titular/Auxiliar)
 */

const express = require('express');
const router = express.Router();

module.exports = (pool, io) => {

    // ========================
    // LIST ALL BRIGADES
    // ========================
    router.get('/', async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT * FROM brigades 
                ORDER BY created_at DESC
            `);
            // Parse members JSON if needed, though pg usually handles it
            res.json({ success: true, brigades: result.rows });
        } catch (error) {
            console.error('Error fetching brigades:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ========================
    // CREATE BRIGADE
    // ========================
    router.post('/', async (req, res) => {
        const { name, type, members, capacity_per_day, current_zone } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        try {
            const result = await pool.query(`
                INSERT INTO brigades (name, type, members, capacity_per_day, current_zone)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [
                name,
                type || 'mixed',
                JSON.stringify(members || []), // Ensure JSON
                capacity_per_day || 30,
                current_zone || null
            ]);

            io.emit('brigade:created', result.rows[0]);
            res.status(201).json({ success: true, brigade: result.rows[0] });
        } catch (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'Brigade name already exists' });
            }
            console.error('Error creating brigade:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ========================
    // UPDATE BRIGADE
    // ========================
    router.put('/:id', async (req, res) => {
        const { id } = req.params;
        const { name, type, members, status, capacity_per_day, current_zone } = req.body;

        try {
            const result = await pool.query(`
                UPDATE brigades
                SET 
                    name = COALESCE($1, name),
                    type = COALESCE($2, type),
                    members = COALESCE($3, members),
                    status = COALESCE($4, status),
                    capacity_per_day = COALESCE($5, capacity_per_day),
                    current_zone = COALESCE($6, current_zone),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $7
                RETURNING *
            `, [
                name,
                type,
                members ? JSON.stringify(members) : null,
                status,
                capacity_per_day,
                current_zone,
                id
            ]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Brigade not found' });
            }

            io.emit('brigade:updated', result.rows[0]);
            res.json({ success: true, brigade: result.rows[0] });
        } catch (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'Brigade name already exists' });
            }
            console.error('Error updating brigade:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ========================
    // DELETE BRIGADE
    // ========================
    router.delete('/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const result = await pool.query('DELETE FROM brigades WHERE id = $1 RETURNING id', [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Brigade not found' });
            }

            io.emit('brigade:deleted', id);
            res.json({ success: true, message: 'Brigade deleted' });
        } catch (error) {
            console.error('Error deleting brigade:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
};
