/**
 * Work Schedule Routes
 * Manages technician work schedules (daily hours) with Excel bulk upload
 */

const express = require('express');
const XLSX = require('xlsx');
const multer = require('multer');
const router = express.Router();

// Multer config for Excel upload
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.mimetype === 'application/vnd.ms-excel' ||
            file.originalname.endsWith('.xlsx') ||
            file.originalname.endsWith('.xls')) {
            cb(null, true);
        } else {
            cb(new Error('Solo archivos Excel (.xlsx, .xls)'), false);
        }
    }
});

module.exports = (pool) => {

    // =============================================
    // Initialize Table (call on server startup)
    // =============================================
    const initSchedulesTable = async () => {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS work_schedules (
                    id SERIAL PRIMARY KEY,
                    driver_id INTEGER REFERENCES drivers(id) ON DELETE CASCADE,
                    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
                    start_time TIME NOT NULL DEFAULT '08:00',
                    end_time TIME NOT NULL DEFAULT '17:00',
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(driver_id, day_of_week)
                )
            `);
            console.log('✅ work_schedules table ready');
        } catch (err) {
            console.error('❌ Error creating work_schedules:', err);
        }
    };

    // Initialize on module load
    initSchedulesTable();

    // =============================================
    // GET /api/schedules - All schedules with driver info
    // =============================================
    router.get('/', async (req, res) => {
        try {
            const { driver_id, day_of_week, active_only } = req.query;

            let query = `
                SELECT 
                    ws.id,
                    ws.driver_id,
                    ws.day_of_week,
                    ws.start_time,
                    ws.end_time,
                    ws.is_active,
                    d.name AS driver_name,
                    d.cuadrilla,
                    d.phone
                FROM work_schedules ws
                JOIN drivers d ON ws.driver_id = d.id
                WHERE 1=1
            `;
            const params = [];
            let paramCount = 1;

            if (driver_id) {
                query += ` AND ws.driver_id = $${paramCount++}`;
                params.push(driver_id);
            }
            if (day_of_week !== undefined) {
                query += ` AND ws.day_of_week = $${paramCount++}`;
                params.push(parseInt(day_of_week));
            }
            if (active_only === 'true') {
                query += ` AND ws.is_active = TRUE`;
            }

            query += ` ORDER BY d.name, ws.day_of_week`;

            const result = await pool.query(query, params);

            // Group by driver for easier frontend consumption
            const grouped = {};
            result.rows.forEach(row => {
                if (!grouped[row.driver_id]) {
                    grouped[row.driver_id] = {
                        driver_id: row.driver_id,
                        driver_name: row.driver_name,
                        cuadrilla: row.cuadrilla,
                        phone: row.phone,
                        schedules: []
                    };
                }
                grouped[row.driver_id].schedules.push({
                    id: row.id,
                    day_of_week: row.day_of_week,
                    start_time: row.start_time,
                    end_time: row.end_time,
                    is_active: row.is_active
                });
            });

            res.json({
                schedules: Object.values(grouped),
                total: Object.keys(grouped).length
            });
        } catch (err) {
            console.error('Error fetching schedules:', err);
            res.status(500).json({ error: 'Failed to fetch schedules', details: err.message });
        }
    });

    // =============================================
    // GET /api/schedules/drivers - Drivers with their schedules
    // =============================================
    router.get('/drivers', async (req, res) => {
        try {
            const driversResult = await pool.query(`
                SELECT id, name, cuadrilla, phone, email, status, brigade_role
                FROM drivers 
                ORDER BY name
            `);

            const schedulesResult = await pool.query(`
                SELECT driver_id, day_of_week, start_time, end_time, is_active
                FROM work_schedules
                ORDER BY driver_id, day_of_week
            `);

            // Map schedules to drivers
            const scheduleMap = {};
            schedulesResult.rows.forEach(s => {
                if (!scheduleMap[s.driver_id]) scheduleMap[s.driver_id] = [];
                scheduleMap[s.driver_id].push(s);
            });

            const drivers = driversResult.rows.map(d => ({
                ...d,
                schedules: scheduleMap[d.id] || []
            }));

            res.json({ drivers, total: drivers.length });
        } catch (err) {
            console.error('Error fetching drivers with schedules:', err);
            res.status(500).json({ error: 'Failed to fetch drivers' });
        }
    });

    // =============================================
    // PUT /api/schedules/:driverId - Update driver schedule
    // =============================================
    router.put('/:driverId', async (req, res) => {
        const { driverId } = req.params;
        const { schedules } = req.body; // Array of { day_of_week, start_time, end_time, is_active }

        if (!schedules || !Array.isArray(schedules)) {
            return res.status(400).json({ error: 'schedules array required' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Delete existing schedules for this driver
            await client.query('DELETE FROM work_schedules WHERE driver_id = $1', [driverId]);

            // Insert new schedules
            for (const s of schedules) {
                if (s.day_of_week !== undefined && s.start_time && s.end_time) {
                    await client.query(`
                        INSERT INTO work_schedules (driver_id, day_of_week, start_time, end_time, is_active)
                        VALUES ($1, $2, $3, $4, $5)
                    `, [driverId, s.day_of_week, s.start_time, s.end_time, s.is_active !== false]);
                }
            }

            await client.query('COMMIT');
            res.json({ success: true, updated: schedules.length });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error updating schedule:', err);
            res.status(500).json({ error: 'Failed to update schedule', details: err.message });
        } finally {
            client.release();
        }
    });

    // =============================================
    // POST /api/schedules/bulk - Bulk Excel upload
    // =============================================
    router.post('/bulk', upload.single('file'), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        try {
            const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet);

            if (rows.length === 0) {
                return res.status(400).json({ error: 'Empty spreadsheet' });
            }

            // Expected columns: driver_name OR driver_id, day_0 through day_6 (format: "08:00-17:00")
            const dayColumns = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
            const altDayColumns = ['day_0', 'day_1', 'day_2', 'day_3', 'day_4', 'day_5', 'day_6'];

            const results = { processed: 0, errors: [], success: [] };
            const client = await pool.connect();

            try {
                await client.query('BEGIN');

                for (const row of rows) {
                    try {
                        // Find driver
                        let driverId = row.driver_id;
                        if (!driverId && row.driver_name) {
                            const driverResult = await client.query(
                                'SELECT id FROM drivers WHERE LOWER(name) = LOWER($1)',
                                [row.driver_name.trim()]
                            );
                            if (driverResult.rows.length > 0) {
                                driverId = driverResult.rows[0].id;
                            }
                        }

                        if (!driverId) {
                            results.errors.push({ row: row.driver_name || 'unknown', error: 'Driver not found' });
                            continue;
                        }

                        // Delete existing schedules
                        await client.query('DELETE FROM work_schedules WHERE driver_id = $1', [driverId]);

                        // Parse schedule for each day
                        for (let day = 0; day < 7; day++) {
                            const colName = dayColumns[day];
                            const altColName = altDayColumns[day];
                            const value = row[colName] || row[altColName] || row[colName.toUpperCase()] || row[altColName.toUpperCase()];

                            if (value && typeof value === 'string' && value.includes('-')) {
                                const [start, end] = value.split('-').map(t => t.trim());
                                if (start && end) {
                                    await client.query(`
                                        INSERT INTO work_schedules (driver_id, day_of_week, start_time, end_time, is_active)
                                        VALUES ($1, $2, $3, $4, TRUE)
                                    `, [driverId, day, start, end]);
                                }
                            }
                        }

                        results.processed++;
                        results.success.push(row.driver_name || driverId);
                    } catch (rowErr) {
                        results.errors.push({ row: row.driver_name || 'unknown', error: rowErr.message });
                    }
                }

                await client.query('COMMIT');
            } catch (txErr) {
                await client.query('ROLLBACK');
                throw txErr;
            } finally {
                client.release();
            }

            res.json({
                success: true,
                ...results,
                message: `Processed ${results.processed} drivers with ${results.errors.length} errors`
            });

        } catch (err) {
            console.error('Bulk upload error:', err);
            res.status(500).json({ error: 'Bulk upload failed', details: err.message });
        }
    });

    // =============================================
    // GET /api/schedules/template - Download Excel template
    // =============================================
    router.get('/template', async (req, res) => {
        try {
            // Get all drivers
            const driversResult = await pool.query('SELECT name FROM drivers ORDER BY name');

            const templateData = driversResult.rows.map(d => ({
                driver_name: d.name,
                lun: '08:00-17:00',
                mar: '08:00-17:00',
                mie: '08:00-17:00',
                jue: '08:00-17:00',
                vie: '08:00-17:00',
                sab: '',
                dom: ''
            }));

            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(templateData);
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Jornadas');

            const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

            res.setHeader('Content-Disposition', 'attachment; filename=plantilla_jornadas.xlsx');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.send(buffer);
        } catch (err) {
            console.error('Template generation error:', err);
            res.status(500).json({ error: 'Failed to generate template' });
        }
    });

    return router;
};
