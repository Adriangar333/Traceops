const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
// Import users from authRoutes (in-memory store for now)
const { users } = require('./authRoutes');

module.exports = (pool) => {
    // ==========================================
    // VEHICLES CRUD
    // ==========================================

    // GET /api/fleet/vehicles
    router.get('/vehicles', authRequired, async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM vehicles ORDER BY created_at DESC');
            res.json(result.rows);
        } catch (err) {
            console.error('Error fetching vehicles:', err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // POST /api/fleet/vehicles
    router.post('/vehicles', authRequired, requireRole('admin'), async (req, res) => {
        const { plate, brand, model, type, status, km_current, soat_expiry, tecno_expiry, ownership_type, year } = req.body;
        try {
            const result = await pool.query(
                `INSERT INTO vehicles (plate, brand, model, type, status, km_current, soat_expiry, tecno_expiry, ownership_type, year)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [plate, brand, model, type, status || 'active', km_current || 0, soat_expiry || null, tecno_expiry || null, ownership_type || 'propio', year || null]
            );
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Error creating vehicle:', err);
            if (err.code === '23505') { // Unique violation
                return res.status(409).json({ error: 'La placa ya existe' });
            }
            res.status(500).json({ error: 'Database error' });
        }
    });

    // PUT /api/fleet/vehicles/:id
    router.put('/vehicles/:id', authRequired, requireRole('admin'), async (req, res) => {
        const { id } = req.params;
        const { brand, model, type, status, km_current, soat_expiry, tecno_expiry, ownership_type, year } = req.body;
        try {
            const result = await pool.query(
                `UPDATE vehicles 
                 SET brand = $1, model = $2, type = $3, status = $4, km_current = $5, soat_expiry = $6, tecno_expiry = $7, ownership_type = $8, year = $9
                 WHERE id = $10 RETURNING *`,
                [brand, model, type, status, km_current, soat_expiry, tecno_expiry, ownership_type, year, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Vehicle not found' });
            }
            res.json(result.rows[0]);
        } catch (err) {
            console.error('Error updating vehicle:', err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // DELETE /api/fleet/vehicles/:id
    router.delete('/vehicles/:id', authRequired, requireRole('admin'), async (req, res) => {
        const { id } = req.params;
        try {
            await pool.query('DELETE FROM vehicles WHERE id = $1', [id]);
            res.json({ success: true });
        } catch (err) {
            console.error('Error deleting vehicle:', err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // ==========================================
    // DRIVERS (From Auth Store - drivers = technicians)
    // ==========================================

    // GET /api/fleet/drivers - Returns users with role 'driver'
    router.get('/drivers', authRequired, (req, res) => {
        // Filter users with role 'driver' from auth store
        const drivers = users.filter(u => u.role === 'driver').map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            phone: u.phone || null,
            status: 'active'
        }));
        res.json(drivers);
    });

    // Note: To add new drivers, create users with role 'driver' in the auth system
    // Drivers are the same as technicians in this system

    // ==========================================
    // ASSIGNMENTS
    // ==========================================

    // GET /api/fleet/assignments
    router.get('/assignments', authRequired, async (req, res) => {
        try {
            // Join with vehicles. For drivers, we only have IDs in SQL, so we'll fetch them and map names manually
            const result = await pool.query(`
                SELECT a.*, v.plate, v.brand, v.model
                FROM vehicle_assignments a
                JOIN vehicles v ON a.vehicle_id = v.id
                ORDER BY a.assigned_at DESC
            `);

            // Map driver names from in-memory store
            const assignments = result.rows.map(assignment => {
                const driver = users.find(u => u.id === assignment.driver_id);
                return {
                    ...assignment,
                    driver_name: driver ? driver.name : 'Unknown Driver'
                };
            });

            res.json(assignments);
        } catch (err) {
            console.error('Error fetching assignments:', err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // POST /api/fleet/assignments
    router.post('/assignments', authRequired, requireRole('admin'), async (req, res) => {
        const { vehicle_id, driver_id, initial_km, notes } = req.body;

        try {
            // Check if vehicle is already assigned
            const existing = await pool.query(
                'SELECT * FROM vehicle_assignments WHERE vehicle_id = $1 AND status = \'active\'',
                [vehicle_id]
            );

            if (existing.rows.length > 0) {
                return res.status(400).json({ error: 'El vehículo ya está asignado' });
            }

            // Create assignment
            const result = await pool.query(
                `INSERT INTO vehicle_assignments (vehicle_id, driver_id, initial_km, notes)
                 VALUES ($1, $2, $3, $4) RETURNING *`,
                [vehicle_id, driver_id, initial_km, notes]
            );

            // Update vehicle status to 'active' if it wasn't
            await pool.query('UPDATE vehicles SET status = \'active\' WHERE id = $1', [vehicle_id]);

            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Error creating assignment:', err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // PUT /api/fleet/assignments/:id/end
    router.put('/assignments/:id/end', authRequired, requireRole('admin'), async (req, res) => {
        const { id } = req.params;
        const { final_km } = req.body;

        try {
            const result = await pool.query(
                `UPDATE vehicle_assignments 
                 SET status = 'ended', unassigned_at = NOW(), final_km = $1
                 WHERE id = $2 RETURNING *`,
                [final_km, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Assignment not found' });
            }

            // Update vehicle current km
            if (final_km) {
                const vehicleId = result.rows[0].vehicle_id;
                await pool.query('UPDATE vehicles SET km_current = $1 WHERE id = $2', [final_km, vehicleId]);
            }

            res.json(result.rows[0]);
        } catch (err) {
            console.error('Error ending assignment:', err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // ==========================================
    // MAINTENANCE
    // ==========================================

    // GET /api/fleet/maintenance
    router.get('/maintenance', authRequired, async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT m.*, v.plate, v.brand 
                FROM maintenance_logs m
                JOIN vehicles v ON m.vehicle_id = v.id
                ORDER BY m.date DESC
            `);
            res.json(result.rows);
        } catch (err) {
            console.error('Error fetching maintenance logs:', err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // POST /api/fleet/maintenance
    router.post('/maintenance', authRequired, requireRole('admin'), async (req, res) => {
        const { vehicle_id, type, description, cost, date, workshop, limit_km } = req.body;

        try {
            const result = await pool.query(
                `INSERT INTO maintenance_logs (vehicle_id, type, description, cost, date, workshop, limit_km)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [vehicle_id, type, description, cost, date, workshop, limit_km]
            );

            // If corrective, maybe set vehicle status to 'repair'
            if (type === 'corrective') {
                await pool.query('UPDATE vehicles SET status = \'repair\' WHERE id = $1', [vehicle_id]);
            }

            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Error creating maintenance log:', err);
            res.status(500).json({ error: 'Database error' });
        }
    });

    return router;
};
