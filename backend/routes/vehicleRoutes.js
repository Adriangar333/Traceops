/**
 * Vehicle Management Routes
 * CRUD for vehicles + assignment to brigades/technicians
 */

const express = require('express');
const router = express.Router();

module.exports = (pool, io) => {

    // ========================
    // LIST ALL VEHICLES
    // ========================
    router.get('/', async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT 
                    v.*,
                    b.name as brigade_name,
                    d.name as technician_name
                FROM vehicles v
                LEFT JOIN brigades b ON v.assigned_brigade_id = b.id
                LEFT JOIN drivers d ON v.assigned_technician_id = d.id
                ORDER BY v.created_at DESC
            `);
            res.json({ success: true, vehicles: result.rows });
        } catch (error) {
            console.error('Error fetching vehicles:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ========================
    // GET SINGLE VEHICLE
    // ========================
    router.get('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query(`
                SELECT 
                    v.*,
                    b.name as brigade_name,
                    d.name as technician_name
                FROM vehicles v
                LEFT JOIN brigades b ON v.assigned_brigade_id = b.id
                LEFT JOIN drivers d ON v.assigned_technician_id = d.id
                WHERE v.id = $1
            `, [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Vehicle not found' });
            }
            res.json({ success: true, vehicle: result.rows[0] });
        } catch (error) {
            console.error('Error fetching vehicle:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ========================
    // CREATE VEHICLE
    // ========================
    router.post('/', async (req, res) => {
        const { plate, type, brand, model, status, fuel_type, km_per_gallon, notes } = req.body;

        if (!plate) {
            return res.status(400).json({ error: 'Plate is required' });
        }

        try {
            const result = await pool.query(`
                INSERT INTO vehicles (plate, type, brand, model, status, fuel_type, km_per_gallon, notes)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
            `, [
                plate.toUpperCase(),
                type || 'car',
                brand || null,
                model || null,
                status || 'active',
                fuel_type || 'gasoline',
                km_per_gallon || 12.0,
                notes || null
            ]);

            io.emit('vehicle:created', result.rows[0]);
            res.status(201).json({ success: true, vehicle: result.rows[0] });
        } catch (error) {
            if (error.code === '23505') { // Unique constraint violation
                return res.status(400).json({ error: 'Vehicle with this plate already exists' });
            }
            console.error('Error creating vehicle:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ========================
    // UPDATE VEHICLE
    // ========================
    router.put('/:id', async (req, res) => {
        const { id } = req.params;
        const { plate, type, brand, model, status, fuel_type, km_per_gallon, notes } = req.body;

        try {
            const result = await pool.query(`
                UPDATE vehicles SET
                    plate = COALESCE($1, plate),
                    type = COALESCE($2, type),
                    brand = COALESCE($3, brand),
                    model = COALESCE($4, model),
                    status = COALESCE($5, status),
                    fuel_type = COALESCE($6, fuel_type),
                    km_per_gallon = COALESCE($7, km_per_gallon),
                    notes = COALESCE($8, notes),
                    updated_at = NOW()
                WHERE id = $9
                RETURNING *
            `, [plate?.toUpperCase(), type, brand, model, status, fuel_type, km_per_gallon, notes, id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Vehicle not found' });
            }

            io.emit('vehicle:updated', result.rows[0]);
            res.json({ success: true, vehicle: result.rows[0] });
        } catch (error) {
            console.error('Error updating vehicle:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ========================
    // DELETE VEHICLE
    // ========================
    router.delete('/:id', async (req, res) => {
        const { id } = req.params;

        try {
            const result = await pool.query('DELETE FROM vehicles WHERE id = $1 RETURNING id, plate', [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Vehicle not found' });
            }

            io.emit('vehicle:deleted', { id: parseInt(id) });
            res.json({ success: true, message: `Vehicle ${result.rows[0].plate} deleted` });
        } catch (error) {
            console.error('Error deleting vehicle:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ========================
    // ASSIGN VEHICLE TO BRIGADE
    // ========================
    router.post('/:id/assign-brigade', async (req, res) => {
        const { id } = req.params;
        const { brigade_id } = req.body;

        try {
            const result = await pool.query(`
                UPDATE vehicles SET
                    assigned_brigade_id = $1,
                    updated_at = NOW()
                WHERE id = $2
                RETURNING *
            `, [brigade_id || null, id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Vehicle not found' });
            }

            io.emit('vehicle:assigned', result.rows[0]);
            res.json({ success: true, vehicle: result.rows[0] });
        } catch (error) {
            console.error('Error assigning vehicle to brigade:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ========================
    // ASSIGN VEHICLE TO TECHNICIAN
    // ========================
    router.post('/:id/assign-technician', async (req, res) => {
        const { id } = req.params;
        const { technician_id } = req.body;

        try {
            const result = await pool.query(`
                UPDATE vehicles SET
                    assigned_technician_id = $1,
                    updated_at = NOW()
                WHERE id = $2
                RETURNING *
            `, [technician_id || null, id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Vehicle not found' });
            }

            io.emit('vehicle:assigned', result.rows[0]);
            res.json({ success: true, vehicle: result.rows[0] });
        } catch (error) {
            console.error('Error assigning vehicle to technician:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ========================
    // TOGGLE VEHICLE STATUS (active/inactive/maintenance)
    // ========================
    router.patch('/:id/status', async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['active', 'inactive', 'maintenance'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
        }

        try {
            const result = await pool.query(`
                UPDATE vehicles SET status = $1, updated_at = NOW()
                WHERE id = $2
                RETURNING *
            `, [status, id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Vehicle not found' });
            }

            io.emit('vehicle:statusChanged', result.rows[0]);
            res.json({ success: true, vehicle: result.rows[0] });
        } catch (error) {
            console.error('Error updating vehicle status:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ========================
    // GET VEHICLE STATS
    // ========================
    router.get('/stats/summary', async (req, res) => {
        try {
            const stats = await pool.query(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'active') as active,
                    COUNT(*) FILTER (WHERE status = 'inactive') as inactive,
                    COUNT(*) FILTER (WHERE status = 'maintenance') as maintenance,
                    COUNT(*) FILTER (WHERE assigned_brigade_id IS NOT NULL) as assigned_to_brigade,
                    COUNT(*) FILTER (WHERE assigned_technician_id IS NOT NULL) as assigned_to_technician
                FROM vehicles
            `);
            res.json({ success: true, stats: stats.rows[0] });
        } catch (error) {
            console.error('Error fetching vehicle stats:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
};
