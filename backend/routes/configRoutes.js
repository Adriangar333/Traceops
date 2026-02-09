/**
 * configRoutes.js
 * API for managing system configuration
 * Persists settings to PostgreSQL using a single JSON column
 */
const express = require('express');
const router = express.Router();

module.exports = function (pool) {

    // Ensure config table exists
    const initConfigTable = async () => {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS system_config (
                    id SERIAL PRIMARY KEY,
                    key VARCHAR(50) UNIQUE NOT NULL DEFAULT 'main',
                    config JSONB NOT NULL DEFAULT '{}',
                    updated_at TIMESTAMP DEFAULT NOW(),
                    updated_by VARCHAR(100)
                )
            `);

            // Insert default row if not exists
            await pool.query(`
                INSERT INTO system_config (key, config)
                VALUES ('main', '{}')
                ON CONFLICT (key) DO NOTHING
            `);

            console.log('✅ system_config table ready');
        } catch (err) {
            console.error('❌ Error initializing config table:', err.message);
        }
    };

    initConfigTable();

    // ============================================
    // GET /api/config - Get all configuration
    // ============================================
    router.get('/', async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT config, updated_at 
                FROM system_config 
                WHERE key = 'main'
            `);

            if (result.rows.length === 0) {
                return res.json({ config: {}, updated_at: null });
            }

            res.json({
                config: result.rows[0].config,
                updated_at: result.rows[0].updated_at
            });
        } catch (err) {
            console.error('Error fetching config:', err);
            res.status(500).json({ error: 'Failed to fetch configuration' });
        }
    });

    // ============================================
    // PUT /api/config - Update configuration
    // ============================================
    router.put('/', async (req, res) => {
        const { config } = req.body;

        if (!config || typeof config !== 'object') {
            return res.status(400).json({ error: 'config object is required' });
        }

        try {
            const result = await pool.query(`
                UPDATE system_config 
                SET config = $1, updated_at = NOW()
                WHERE key = 'main'
                RETURNING config, updated_at
            `, [JSON.stringify(config)]);

            if (result.rows.length === 0) {
                // Insert if doesn't exist
                const insertResult = await pool.query(`
                    INSERT INTO system_config (key, config)
                    VALUES ('main', $1)
                    RETURNING config, updated_at
                `, [JSON.stringify(config)]);

                return res.json({
                    success: true,
                    config: insertResult.rows[0].config,
                    updated_at: insertResult.rows[0].updated_at
                });
            }

            res.json({
                success: true,
                config: result.rows[0].config,
                updated_at: result.rows[0].updated_at
            });
        } catch (err) {
            console.error('Error saving config:', err);
            res.status(500).json({ error: 'Failed to save configuration' });
        }
    });

    // ============================================
    // POST /api/config/reset - Reset to defaults
    // ============================================
    router.post('/reset', async (req, res) => {
        try {
            const result = await pool.query(`
                UPDATE system_config 
                SET config = '{}', updated_at = NOW()
                WHERE key = 'main'
                RETURNING config, updated_at
            `);

            res.json({
                success: true,
                message: 'Configuration reset to defaults',
                updated_at: result.rows[0]?.updated_at
            });
        } catch (err) {
            console.error('Error resetting config:', err);
            res.status(500).json({ error: 'Failed to reset configuration' });
        }
    });

    // ============================================
    // GET /api/config/export - Export config as JSON file
    // ============================================
    router.get('/export', async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT config 
                FROM system_config 
                WHERE key = 'main'
            `);

            const config = result.rows[0]?.config || {};

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename=scr-config.json');
            res.send(JSON.stringify(config, null, 2));
        } catch (err) {
            console.error('Error exporting config:', err);
            res.status(500).json({ error: 'Failed to export configuration' });
        }
    });

    // ============================================
    // POST /api/config/import - Import config from JSON
    // ============================================
    router.post('/import', async (req, res) => {
        const { config } = req.body;

        if (!config || typeof config !== 'object') {
            return res.status(400).json({ error: 'config object is required' });
        }

        try {
            // Merge with existing config
            const existingResult = await pool.query(`
                SELECT config FROM system_config WHERE key = 'main'
            `);

            const existingConfig = existingResult.rows[0]?.config || {};
            const mergedConfig = { ...existingConfig, ...config };

            const result = await pool.query(`
                UPDATE system_config 
                SET config = $1, updated_at = NOW()
                WHERE key = 'main'
                RETURNING config, updated_at
            `, [JSON.stringify(mergedConfig)]);

            res.json({
                success: true,
                message: 'Configuration imported successfully',
                config: result.rows[0].config,
                updated_at: result.rows[0].updated_at
            });
        } catch (err) {
            console.error('Error importing config:', err);
            res.status(500).json({ error: 'Failed to import configuration' });
        }
    });

    return router;
};
