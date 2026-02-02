const express = require('express');
const router = express.Router();

// Workforce Management Routes
// Handles: Technicians, Daily Roster, Novelties, Zone Configs

module.exports = (pool, io) => {

    // ============================================
    // ZONE CONFIGURATIONS
    // ============================================

    // Get all zones
    router.get('/zones', async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT * FROM zone_configs 
                WHERE is_active = TRUE
                ORDER BY zone_code
            `);
            res.json({ success: true, zones: result.rows });
        } catch (error) {
            console.error('Error fetching zones:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Update zone config
    router.put('/zones/:code', async (req, res) => {
        const { code } = req.params;
        const { vehicle_assignment_mode, description } = req.body;
        try {
            const result = await pool.query(`
                UPDATE zone_configs 
                SET vehicle_assignment_mode = COALESCE($1, vehicle_assignment_mode),
                    description = COALESCE($2, description)
                WHERE zone_code = $3
                RETURNING *
            `, [vehicle_assignment_mode, description, code]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Zone not found' });
            }
            res.json({ success: true, zone: result.rows[0] });
        } catch (error) {
            console.error('Error updating zone:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ============================================
    // TECHNICIANS
    // ============================================

    // List all technicians
    router.get('/technicians', async (req, res) => {
        const { zone, brigade_id, status, search } = req.query;
        try {
            let query = `
                SELECT t.*, 
                       b.name as brigade_name, 
                       b.type as brigade_type,
                       v.plate as vehicle_plate,
                       v.type as vehicle_type,
                       zc.zone_name,
                       zc.vehicle_assignment_mode as zone_vehicle_mode
                FROM technicians t
                LEFT JOIN brigades b ON t.brigade_id = b.id
                LEFT JOIN vehicles v ON t.assigned_vehicle_id = v.id
                LEFT JOIN zone_configs zc ON t.zone = zc.zone_code
                WHERE 1=1
            `;
            const params = [];
            let paramIdx = 1;

            if (zone) {
                query += ` AND t.zone = $${paramIdx++}`;
                params.push(zone);
            }
            if (brigade_id) {
                query += ` AND t.brigade_id = $${paramIdx++}`;
                params.push(brigade_id);
            }
            if (status) {
                query += ` AND t.employment_status = $${paramIdx++}`;
                params.push(status);
            }
            if (search) {
                query += ` AND (t.full_name ILIKE $${paramIdx} OR t.employee_code ILIKE $${paramIdx} OR t.document_id ILIKE $${paramIdx})`;
                params.push(`%${search}%`);
                paramIdx++;
            }

            query += ` ORDER BY t.full_name`;

            const result = await pool.query(query, params);
            res.json({ success: true, technicians: result.rows, total: result.rowCount });
        } catch (error) {
            console.error('Error fetching technicians:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Get single technician
    router.get('/technicians/:id', async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT t.*, 
                       b.name as brigade_name,
                       v.plate as vehicle_plate
                FROM technicians t
                LEFT JOIN brigades b ON t.brigade_id = b.id
                LEFT JOIN vehicles v ON t.assigned_vehicle_id = v.id
                WHERE t.id = $1
            `, [req.params.id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Technician not found' });
            }
            res.json({ success: true, technician: result.rows[0] });
        } catch (error) {
            console.error('Error fetching technician:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Create technician
    router.post('/technicians', async (req, res) => {
        const {
            employee_code, full_name, document_id, phone, email,
            brigade_id, brigade_role, zone,
            employment_status, contract_type, hire_date,
            assigned_vehicle_id, vehicle_assignment_mode
        } = req.body;

        if (!full_name) {
            return res.status(400).json({ error: 'full_name is required' });
        }

        try {
            const result = await pool.query(`
                INSERT INTO technicians (
                    employee_code, full_name, document_id, phone, email,
                    brigade_id, brigade_role, zone,
                    employment_status, contract_type, hire_date,
                    assigned_vehicle_id, vehicle_assignment_mode
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING *
            `, [
                employee_code, full_name, document_id, phone, email,
                brigade_id, brigade_role || 'auxiliar', zone || 'SUR',
                employment_status || 'active', contract_type || 'indefinido', hire_date,
                assigned_vehicle_id, vehicle_assignment_mode || 'permanent'
            ]);

            io.emit('technician:created', result.rows[0]);
            res.status(201).json({ success: true, technician: result.rows[0] });
        } catch (error) {
            console.error('Error creating technician:', error);
            if (error.code === '23505') {
                return res.status(400).json({ error: 'Employee code already exists' });
            }
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Update technician
    router.put('/technicians/:id', async (req, res) => {
        const { id } = req.params;
        const {
            employee_code, full_name, document_id, phone, email,
            brigade_id, brigade_role, zone,
            employment_status, contract_type, hire_date,
            assigned_vehicle_id, vehicle_assignment_mode
        } = req.body;

        try {
            const result = await pool.query(`
                UPDATE technicians SET
                    employee_code = COALESCE($1, employee_code),
                    full_name = COALESCE($2, full_name),
                    document_id = COALESCE($3, document_id),
                    phone = COALESCE($4, phone),
                    email = COALESCE($5, email),
                    brigade_id = $6,
                    brigade_role = COALESCE($7, brigade_role),
                    zone = COALESCE($8, zone),
                    employment_status = COALESCE($9, employment_status),
                    contract_type = COALESCE($10, contract_type),
                    hire_date = $11,
                    assigned_vehicle_id = $12,
                    vehicle_assignment_mode = COALESCE($13, vehicle_assignment_mode),
                    updated_at = NOW()
                WHERE id = $14
                RETURNING *
            `, [
                employee_code, full_name, document_id, phone, email,
                brigade_id, brigade_role, zone,
                employment_status, contract_type, hire_date,
                assigned_vehicle_id, vehicle_assignment_mode, id
            ]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Technician not found' });
            }
            res.json({ success: true, technician: result.rows[0] });
        } catch (error) {
            console.error('Error updating technician:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Change technician status
    router.patch('/technicians/:id/status', async (req, res) => {
        const { id } = req.params;
        const { employment_status } = req.body;

        if (!employment_status) {
            return res.status(400).json({ error: 'employment_status required' });
        }

        try {
            const result = await pool.query(`
                UPDATE technicians 
                SET employment_status = $1, updated_at = NOW()
                WHERE id = $2
                RETURNING *
            `, [employment_status, id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Technician not found' });
            }
            res.json({ success: true, technician: result.rows[0] });
        } catch (error) {
            console.error('Error updating status:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Import technicians from brigades (auto-populate from existing data)
    router.post('/technicians/import-from-brigades', async (req, res) => {
        try {
            // Get unique technician names from brigades members JSON
            const brigades = await pool.query(`SELECT id, name, members, type FROM brigades WHERE members IS NOT NULL`);

            let imported = 0;
            for (const brigade of brigades.rows) {
                const members = brigade.members || [];
                for (const member of members) {
                    if (!member.name) continue;

                    // Check if already exists
                    const exists = await pool.query(
                        `SELECT id FROM technicians WHERE full_name = $1`,
                        [member.name]
                    );

                    if (exists.rowCount === 0) {
                        await pool.query(`
                            INSERT INTO technicians (full_name, brigade_id, brigade_role, zone)
                            VALUES ($1, $2, $3, 'SUR')
                        `, [member.name, brigade.id, member.role || 'auxiliar']);
                        imported++;
                    }
                }
            }

            // Also import from scrc_orders technician_name
            const techs = await pool.query(`
                SELECT DISTINCT technician_name FROM scrc_orders 
                WHERE technician_name IS NOT NULL AND technician_name != ''
            `);

            for (const row of techs.rows) {
                const exists = await pool.query(
                    `SELECT id FROM technicians WHERE full_name = $1`,
                    [row.technician_name]
                );

                if (exists.rowCount === 0) {
                    await pool.query(`
                        INSERT INTO technicians (full_name, zone)
                        VALUES ($1, 'SUR')
                    `, [row.technician_name]);
                    imported++;
                }
            }

            res.json({ success: true, imported, message: `Imported ${imported} technicians` });
        } catch (error) {
            console.error('Error importing technicians:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ============================================
    // DAILY ROSTER
    // ============================================

    // Get roster for a date
    router.get('/roster', async (req, res) => {
        const { date, zone, brigade_id } = req.query;
        const targetDate = date || new Date().toISOString().split('T')[0];

        try {
            let query = `
                SELECT r.*, 
                       t.full_name as technician_name,
                       t.employee_code,
                       t.phone as technician_phone,
                       t.zone as technician_zone,
                       b.name as brigade_name,
                       b.type as brigade_type,
                       v.plate as vehicle_plate,
                       v.type as vehicle_type,
                       v.ownership_type as vehicle_ownership
                FROM daily_roster r
                JOIN technicians t ON r.technician_id = t.id
                LEFT JOIN brigades b ON r.brigade_id = b.id
                LEFT JOIN vehicles v ON r.assigned_vehicle_id = v.id
                WHERE r.date = $1
            `;
            const params = [targetDate];
            let paramIdx = 2;

            if (zone) {
                query += ` AND t.zone = $${paramIdx++}`;
                params.push(zone);
            }
            if (brigade_id) {
                query += ` AND r.brigade_id = $${paramIdx++}`;
                params.push(brigade_id);
            }

            query += ` ORDER BY b.name, t.full_name`;

            const result = await pool.query(query, params);

            // Get summary stats
            const stats = await pool.query(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'active') as active,
                    COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
                    COUNT(*) FILTER (WHERE status = 'absent') as absent,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed
                FROM daily_roster
                WHERE date = $1
            `, [targetDate]);

            res.json({
                success: true,
                date: targetDate,
                roster: result.rows,
                total: result.rowCount,
                stats: stats.rows[0]
            });
        } catch (error) {
            console.error('Error fetching roster:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Generate roster for a date (auto-populate from active technicians)
    router.post('/roster/generate', async (req, res) => {
        const { date, zone } = req.body;
        const targetDate = date || new Date().toISOString().split('T')[0];

        try {
            // Get the day of week (0=Sunday, 1=Monday, etc.)
            const dayOfWeek = new Date(targetDate).getDay();

            // Get active technicians without novelties for the date
            let query = `
                SELECT t.id as technician_id, 
                       t.brigade_id,
                       t.assigned_vehicle_id,
                       t.zone,
                       zc.vehicle_assignment_mode,
                       b.permanent_vehicle_id
                FROM technicians t
                LEFT JOIN zone_configs zc ON t.zone = zc.zone_code
                LEFT JOIN brigades b ON t.brigade_id = b.id
                WHERE t.employment_status = 'active'
                AND NOT EXISTS (
                    SELECT 1 FROM novelties n
                    WHERE n.technician_id = t.id
                    AND n.status = 'approved'
                    AND $1 BETWEEN n.start_date AND COALESCE(n.end_date, n.start_date)
                )
                AND NOT EXISTS (
                    SELECT 1 FROM daily_roster dr
                    WHERE dr.technician_id = t.id AND dr.date = $1
                )
            `;
            const params = [targetDate];

            if (zone) {
                query += ` AND t.zone = $2`;
                params.push(zone);
            }

            const technicians = await pool.query(query, params);

            let created = 0;
            for (const tech of technicians.rows) {
                // Determine vehicle based on zone mode
                let vehicleId = null;
                let mobilityType = 'sin_vehiculo';

                if (tech.vehicle_assignment_mode === 'permanent') {
                    // Use permanent vehicle (from technician or brigade)
                    vehicleId = tech.assigned_vehicle_id || tech.permanent_vehicle_id;
                    mobilityType = vehicleId ? 'vehiculo_permanente' : 'sin_vehiculo';
                } else {
                    // Rotation mode - will be assigned later
                    mobilityType = 'vehiculo_rotacion';
                }

                await pool.query(`
                    INSERT INTO daily_roster (date, technician_id, brigade_id, assigned_vehicle_id, mobility_type, status)
                    VALUES ($1, $2, $3, $4, $5, 'scheduled')
                `, [targetDate, tech.technician_id, tech.brigade_id, vehicleId, mobilityType]);
                created++;
            }

            res.json({
                success: true,
                date: targetDate,
                created,
                message: `Generated ${created} roster entries for ${targetDate}`
            });
        } catch (error) {
            console.error('Error generating roster:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Update roster entry
    router.put('/roster/:id', async (req, res) => {
        const { id } = req.params;
        const {
            is_available, status, assigned_vehicle_id, mobility_type,
            scheduled_start, scheduled_end, notes
        } = req.body;

        try {
            const result = await pool.query(`
                UPDATE daily_roster SET
                    is_available = COALESCE($1, is_available),
                    status = COALESCE($2, status),
                    assigned_vehicle_id = $3,
                    mobility_type = COALESCE($4, mobility_type),
                    scheduled_start = COALESCE($5, scheduled_start),
                    scheduled_end = COALESCE($6, scheduled_end),
                    notes = COALESCE($7, notes)
                WHERE id = $8
                RETURNING *
            `, [is_available, status, assigned_vehicle_id, mobility_type, scheduled_start, scheduled_end, notes, id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Roster entry not found' });
            }

            io.emit('roster:updated', result.rows[0]);
            res.json({ success: true, entry: result.rows[0] });
        } catch (error) {
            console.error('Error updating roster:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Check-in (mark arrival)
    router.post('/roster/:id/check-in', async (req, res) => {
        const { id } = req.params;
        try {
            const result = await pool.query(`
                UPDATE daily_roster 
                SET status = 'active', actual_start = NOW()
                WHERE id = $1
                RETURNING *
            `, [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Roster entry not found' });
            }

            io.emit('roster:check-in', result.rows[0]);
            res.json({ success: true, entry: result.rows[0] });
        } catch (error) {
            console.error('Error checking in:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Check-out (mark departure)
    router.post('/roster/:id/check-out', async (req, res) => {
        const { id } = req.params;
        try {
            const result = await pool.query(`
                UPDATE daily_roster 
                SET status = 'completed', actual_end = NOW()
                WHERE id = $1
                RETURNING *
            `, [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Roster entry not found' });
            }

            io.emit('roster:check-out', result.rows[0]);
            res.json({ success: true, entry: result.rows[0] });
        } catch (error) {
            console.error('Error checking out:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Assign vehicle to roster entry (for rotation mode)
    router.post('/roster/:id/assign-vehicle', async (req, res) => {
        const { id } = req.params;
        const { vehicle_id } = req.body;

        if (!vehicle_id) {
            return res.status(400).json({ error: 'vehicle_id required' });
        }

        try {
            // Check vehicle availability
            const vehicle = await pool.query(`SELECT * FROM vehicles WHERE id = $1`, [vehicle_id]);
            if (vehicle.rowCount === 0) {
                return res.status(404).json({ error: 'Vehicle not found' });
            }

            const result = await pool.query(`
                UPDATE daily_roster 
                SET assigned_vehicle_id = $1, mobility_type = 'vehiculo_rotacion'
                WHERE id = $2
                RETURNING *
            `, [vehicle_id, id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Roster entry not found' });
            }

            res.json({ success: true, entry: result.rows[0] });
        } catch (error) {
            console.error('Error assigning vehicle:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ============================================
    // NOVELTIES (Novedades)
    // ============================================

    // List novelties
    router.get('/novelties', async (req, res) => {
        const { technician_id, status, date_from, date_to, type } = req.query;

        try {
            let query = `
                SELECT n.*, 
                       t.full_name as technician_name,
                       t.employee_code,
                       u.name as approved_by_name
                FROM novelties n
                JOIN technicians t ON n.technician_id = t.id
                LEFT JOIN users u ON n.approved_by = u.id
                WHERE 1=1
            `;
            const params = [];
            let paramIdx = 1;

            if (technician_id) {
                query += ` AND n.technician_id = $${paramIdx++}`;
                params.push(technician_id);
            }
            if (status) {
                query += ` AND n.status = $${paramIdx++}`;
                params.push(status);
            }
            if (type) {
                query += ` AND n.novelty_type = $${paramIdx++}`;
                params.push(type);
            }
            if (date_from) {
                query += ` AND n.start_date >= $${paramIdx++}`;
                params.push(date_from);
            }
            if (date_to) {
                query += ` AND n.start_date <= $${paramIdx++}`;
                params.push(date_to);
            }

            query += ` ORDER BY n.created_at DESC`;

            const result = await pool.query(query, params);
            res.json({ success: true, novelties: result.rows, total: result.rowCount });
        } catch (error) {
            console.error('Error fetching novelties:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Create novelty
    router.post('/novelties', async (req, res) => {
        const {
            technician_id, novelty_type, reason,
            start_date, end_date, document_url
        } = req.body;

        if (!technician_id || !novelty_type || !start_date) {
            return res.status(400).json({ error: 'technician_id, novelty_type, start_date required' });
        }

        try {
            const result = await pool.query(`
                INSERT INTO novelties (technician_id, novelty_type, reason, start_date, end_date, document_url, status)
                VALUES ($1, $2, $3, $4, $5, $6, 'pending')
                RETURNING *
            `, [technician_id, novelty_type, reason, start_date, end_date, document_url]);

            // Auto-update roster if novelty is for today or future
            const today = new Date().toISOString().split('T')[0];
            if (start_date >= today) {
                await pool.query(`
                    UPDATE daily_roster 
                    SET status = 'absent', is_available = FALSE, notes = $1
                    WHERE technician_id = $2 AND date BETWEEN $3 AND COALESCE($4, $3)
                `, [`Novedad: ${novelty_type}`, technician_id, start_date, end_date]);
            }

            io.emit('novelty:created', result.rows[0]);
            res.status(201).json({ success: true, novelty: result.rows[0] });
        } catch (error) {
            console.error('Error creating novelty:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Approve/Reject novelty
    router.patch('/novelties/:id/approve', async (req, res) => {
        const { id } = req.params;
        const { status, approved_by } = req.body;

        if (!status || !['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'status must be "approved" or "rejected"' });
        }

        try {
            const result = await pool.query(`
                UPDATE novelties 
                SET status = $1, approved_by = $2
                WHERE id = $3
                RETURNING *
            `, [status, approved_by, id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Novelty not found' });
            }

            res.json({ success: true, novelty: result.rows[0] });
        } catch (error) {
            console.error('Error approving novelty:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Delete novelty
    router.delete('/novelties/:id', async (req, res) => {
        try {
            const result = await pool.query(`DELETE FROM novelties WHERE id = $1 RETURNING *`, [req.params.id]);
            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Novelty not found' });
            }
            res.json({ success: true, deleted: result.rows[0] });
        } catch (error) {
            console.error('Error deleting novelty:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ============================================
    // AVAILABLE VEHICLES (for rotation assignment)
    // ============================================

    router.get('/vehicles/available', async (req, res) => {
        const { date, zone } = req.query;
        const targetDate = date || new Date().toISOString().split('T')[0];

        try {
            // Get vehicles not assigned to any roster entry for the given date
            let query = `
                SELECT v.* 
                FROM vehicles v
                WHERE v.status = 'active'
                AND v.is_available = TRUE
                AND v.id NOT IN (
                    SELECT DISTINCT assigned_vehicle_id 
                    FROM daily_roster 
                    WHERE date = $1 AND assigned_vehicle_id IS NOT NULL
                )
            `;
            const params = [targetDate];

            if (zone) {
                query += ` AND v.zone = $2`;
                params.push(zone);
            }

            query += ` ORDER BY v.plate`;

            const result = await pool.query(query, params);
            res.json({ success: true, vehicles: result.rows, total: result.rowCount });
        } catch (error) {
            console.error('Error fetching available vehicles:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
};
