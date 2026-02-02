/**
 * Work Schedule Routes
 * CRUD for technician work schedules (jornadas de trabajo)
 */

const express = require('express');
const router = express.Router();

module.exports = (pool, io) => {

    // ========================
    // LIST ALL SCHEDULES
    // ========================
    router.get('/', async (req, res) => {
        const { technician_id, brigade_id, day_of_week } = req.query;

        try {
            let whereClause = 'WHERE 1=1';
            const params = [];

            if (technician_id) {
                params.push(technician_id);
                whereClause += ` AND ws.technician_id = $${params.length}`;
            }
            if (brigade_id) {
                params.push(brigade_id);
                whereClause += ` AND ws.brigade_id = $${params.length}`;
            }
            if (day_of_week !== undefined) {
                params.push(day_of_week);
                whereClause += ` AND ws.day_of_week = $${params.length}`;
            }

            const result = await pool.query(`
                SELECT 
                    ws.*,
                    d.name as technician_name,
                    b.name as brigade_name,
                    CASE ws.day_of_week
                        WHEN 0 THEN 'Domingo'
                        WHEN 1 THEN 'Lunes'
                        WHEN 2 THEN 'Martes'
                        WHEN 3 THEN 'Miércoles'
                        WHEN 4 THEN 'Jueves'
                        WHEN 5 THEN 'Viernes'
                        WHEN 6 THEN 'Sábado'
                    END as day_name
                FROM work_schedules ws
                LEFT JOIN drivers d ON ws.technician_id = d.id
                LEFT JOIN brigades b ON ws.brigade_id = b.id
                ${whereClause}
                ORDER BY ws.day_of_week, ws.start_time
            `, params);

            res.json({ success: true, schedules: result.rows });
        } catch (error) {
            console.error('Error fetching schedules:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ========================
    // GET SCHEDULE BY ID
    // ========================
    router.get('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query(`
                SELECT 
                    ws.*,
                    d.name as technician_name,
                    b.name as brigade_name
                FROM work_schedules ws
                LEFT JOIN drivers d ON ws.technician_id = d.id
                LEFT JOIN brigades b ON ws.brigade_id = b.id
                WHERE ws.id = $1
            `, [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Schedule not found' });
            }
            res.json({ success: true, schedule: result.rows[0] });
        } catch (error) {
            console.error('Error fetching schedule:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ========================
    // CREATE SCHEDULE
    // ========================
    router.post('/', async (req, res) => {
        const { technician_id, brigade_id, day_of_week, start_time, end_time, is_active } = req.body;

        if (day_of_week === undefined || day_of_week < 0 || day_of_week > 6) {
            return res.status(400).json({ error: 'day_of_week is required (0-6)' });
        }
        if (!technician_id && !brigade_id) {
            return res.status(400).json({ error: 'Either technician_id or brigade_id is required' });
        }

        try {
            const result = await pool.query(`
                INSERT INTO work_schedules (technician_id, brigade_id, day_of_week, start_time, end_time, is_active)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `, [
                technician_id || null,
                brigade_id || null,
                day_of_week,
                start_time || '07:00',
                end_time || '17:00',
                is_active !== false
            ]);

            io.emit('schedule:created', result.rows[0]);
            res.status(201).json({ success: true, schedule: result.rows[0] });
        } catch (error) {
            console.error('Error creating schedule:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ========================
    // UPDATE SCHEDULE
    // ========================
    router.put('/:id', async (req, res) => {
        const { id } = req.params;
        const { technician_id, brigade_id, day_of_week, start_time, end_time, is_active } = req.body;

        try {
            const result = await pool.query(`
                UPDATE work_schedules SET
                    technician_id = COALESCE($1, technician_id),
                    brigade_id = COALESCE($2, brigade_id),
                    day_of_week = COALESCE($3, day_of_week),
                    start_time = COALESCE($4, start_time),
                    end_time = COALESCE($5, end_time),
                    is_active = COALESCE($6, is_active)
                WHERE id = $7
                RETURNING *
            `, [technician_id, brigade_id, day_of_week, start_time, end_time, is_active, id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Schedule not found' });
            }

            io.emit('schedule:updated', result.rows[0]);
            res.json({ success: true, schedule: result.rows[0] });
        } catch (error) {
            console.error('Error updating schedule:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ========================
    // DELETE SCHEDULE
    // ========================
    router.delete('/:id', async (req, res) => {
        const { id } = req.params;

        try {
            const result = await pool.query('DELETE FROM work_schedules WHERE id = $1 RETURNING id', [id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Schedule not found' });
            }

            io.emit('schedule:deleted', { id: parseInt(id) });
            res.json({ success: true, message: 'Schedule deleted' });
        } catch (error) {
            console.error('Error deleting schedule:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ========================
    // BULK CREATE SCHEDULES (for a full week)
    // ========================
    router.post('/bulk', async (req, res) => {
        const { schedules } = req.body;

        if (!schedules || !Array.isArray(schedules)) {
            return res.status(400).json({ error: 'schedules array required' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const created = [];

            for (const s of schedules) {
                const result = await client.query(`
                    INSERT INTO work_schedules (technician_id, brigade_id, day_of_week, start_time, end_time, is_active)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT DO NOTHING
                    RETURNING *
                `, [
                    s.technician_id || null,
                    s.brigade_id || null,
                    s.day_of_week,
                    s.start_time || '07:00',
                    s.end_time || '17:00',
                    s.is_active !== false
                ]);
                if (result.rows[0]) created.push(result.rows[0]);
            }

            await client.query('COMMIT');
            res.json({ success: true, count: created.length, schedules: created });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error bulk creating schedules:', error);
            res.status(500).json({ error: 'Internal server error' });
        } finally {
            client.release();
        }
    });

    // ========================
    // GET TODAY'S ACTIVE SCHEDULES
    // ========================
    router.get('/today/active', async (req, res) => {
        try {
            const today = new Date().getDay(); // 0-6
            const now = new Date().toTimeString().slice(0, 8); // HH:MM:SS

            const result = await pool.query(`
                SELECT 
                    ws.*,
                    d.name as technician_name,
                    b.name as brigade_name,
                    b.type as brigade_type
                FROM work_schedules ws
                LEFT JOIN drivers d ON ws.technician_id = d.id
                LEFT JOIN brigades b ON ws.brigade_id = b.id
                WHERE ws.day_of_week = $1
                  AND ws.is_active = true
                  AND ws.start_time <= $2
                  AND ws.end_time >= $2
                ORDER BY ws.start_time
            `, [today, now]);

            res.json({
                success: true,
                day: today,
                current_time: now,
                active_schedules: result.rows
            });
        } catch (error) {
            console.error('Error fetching today schedules:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
};
