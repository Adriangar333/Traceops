const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { generateToken, authRequired } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

module.exports = (pool) => {

    /**
     * POST /api/auth/login
     * Login with email and password
     */
    router.post('/login',
        authLimiter,
        [
            body('email').isEmail().normalizeEmail(),
            body('password').isLength({ min: 1 }) // Allow shorter passwords for simple codes
        ],
        async (req, res) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation Error',
                    details: errors.array()
                });
            }

            const { email, password } = req.body;

            try {
                // Find user
                const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
                const user = result.rows[0];

                if (!user) {
                    return res.status(401).json({
                        error: 'Invalid Credentials',
                        message: 'Email o contraseña incorrectos'
                    });
                }

                // Check password
                const isValid = await bcrypt.compare(password, user.password);
                if (!isValid) {
                    return res.status(401).json({
                        error: 'Invalid Credentials',
                        message: 'Email o contraseña incorrectos'
                    });
                }

                // Generate token
                const token = generateToken(user);

                res.json({
                    success: true,
                    token,
                    user: {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        role: user.role
                    }
                });
            } catch (err) {
                console.error('Login error:', err);
                res.status(500).json({ error: 'Server validation error' });
            }
        }
    );

    /**
     * POST /api/auth/register
     * Register new user (admin only)
     */
    router.post('/register',
        authRequired,
        [
            body('email').isEmail().normalizeEmail(),
            body('password').isLength({ min: 6 }),
            body('name').trim().notEmpty(),
            body('role').isIn(['admin', 'supervisor', 'driver'])
        ],
        async (req, res) => {
            // Only admins can create users
            if (req.user.role !== 'admin') {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Solo administradores pueden crear usuarios'
                });
            }

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation Error',
                    details: errors.array()
                });
            }

            const { email, password, name, role } = req.body;

            try {
                // Check if exists
                const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
                if (existing.rowCount > 0) {
                    return res.status(409).json({
                        error: 'Conflict',
                        message: 'El email ya está registrado'
                    });
                }

                // Hash password
                const hashedPassword = await bcrypt.hash(password, 10);

                // Create user
                const result = await pool.query(`
                    INSERT INTO users (email, password, name, role)
                    VALUES ($1, $2, $3, $4)
                    RETURNING id, email, name, role, created_at
                `, [email, hashedPassword, name, role]);

                res.status(201).json({
                    success: true,
                    user: result.rows[0]
                });
            } catch (err) {
                console.error('Register error:', err);
                res.status(500).json({ error: 'Registration failed' });
            }
        }
    );

    /**
     * GET /api/auth/me
     * Get current user info
     */
    router.get('/me', authRequired, async (req, res) => {
        try {
            const result = await pool.query('SELECT id, email, name, role FROM users WHERE id = $1', [req.user.id]);
            const user = result.rows[0];

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json(user);
        } catch (err) {
            console.error('Me error:', err);
            res.status(500).json({ error: 'Fetch failed' });
        }
    });

    /**
     * POST /api/auth/change-password
     * Change password for current user
     */
    router.post('/change-password',
        authRequired,
        [
            body('currentPassword').notEmpty(),
            body('newPassword').isLength({ min: 6 })
        ],
        async (req, res) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ error: 'Validation Error', details: errors.array() });
            }

            const { currentPassword, newPassword } = req.body;

            try {
                const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
                const user = result.rows[0];

                if (!user) {
                    return res.status(404).json({ error: 'User not found' });
                }

                // Verify current password
                const isValid = await bcrypt.compare(currentPassword, user.password);
                if (!isValid) {
                    return res.status(401).json({
                        error: 'Invalid Password',
                        message: 'La contraseña actual es incorrecta'
                    });
                }

                // Update password
                const hashedPassword = await bcrypt.hash(newPassword, 10);
                await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, req.user.id]);

                res.json({ success: true, message: 'Contraseña actualizada' });
            } catch (err) {
                console.error('Change password error:', err);
                res.status(500).json({ error: 'Update failed' });
            }
        }
    );

    return router;
};
