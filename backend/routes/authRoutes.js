const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { generateToken, authRequired } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// In-memory users store (replace with DB in production)
// TODO: Move to PostgreSQL
let users = [
    {
        id: 1,
        email: 'admin@traceops.com',
        password: '$2a$10$Xh6kLzb3pLy7D8hLQs.7m.d1tP6UBBX3k0q.ZwAe9q5d5g6h7i8j9', // "admin123"
        name: 'Administrador',
        role: 'admin',
        createdAt: new Date().toISOString()
    }
];

// Initialize with hashed password
(async () => {
    users[0].password = await bcrypt.hash('admin123', 10);
})();

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login',
    authLimiter,
    [
        body('email').isEmail().normalizeEmail(),
        body('password').isLength({ min: 6 })
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

        // Find user
        const user = users.find(u => u.email === email);
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

        // Check if exists
        if (users.find(u => u.email === email)) {
            return res.status(409).json({
                error: 'Conflict',
                message: 'El email ya está registrado'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const newUser = {
            id: users.length + 1,
            email,
            password: hashedPassword,
            name,
            role,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);

        res.status(201).json({
            success: true,
            user: {
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                role: newUser.role
            }
        });
    }
);

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authRequired, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
    });
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
        const user = users.find(u => u.id === req.user.id);

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
        user.password = await bcrypt.hash(newPassword, 10);

        res.json({ success: true, message: 'Contraseña actualizada' });
    }
);

// Export router and users array for potential DB migration
module.exports = router;
module.exports.users = users;
