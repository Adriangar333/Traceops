const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'traceops-super-secret-key-change-in-prod';
const JWT_EXPIRES = '24h';

/**
 * Generate JWT token for a user
 */
function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
    );
}

/**
 * Verify JWT token - returns decoded payload or null
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}

/**
 * Auth Middleware - Requires valid JWT
 */
function authRequired(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Token de autenticación requerido'
        });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Token inválido o expirado'
        });
    }

    req.user = decoded;
    next();
}

/**
 * Role Middleware - Requires specific roles
 * Usage: requireRole('admin', 'supervisor')
 */
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: `Acceso denegado. Rol requerido: ${allowedRoles.join(' o ')}`
            });
        }

        next();
    };
}

/**
 * Optional Auth - Sets req.user if token present, but doesn't require it
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);
        if (decoded) {
            req.user = decoded;
        }
    }

    next();
}

/**
 * Driver Token Auth - For driver mobile app (simpler auth via route/driver ID)
 */
function driverAuth(req, res, next) {
    // First try JWT
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);
        if (decoded) {
            req.user = decoded;
            return next();
        }
    }

    // Fallback: Driver ID from query/body (for backwards compatibility)
    const driverId = req.query.driverId || req.body.driverId;
    if (driverId) {
        req.user = { id: driverId, role: 'driver' };
        return next();
    }

    return res.status(401).json({ error: 'Driver authentication required' });
}

module.exports = {
    generateToken,
    verifyToken,
    authRequired,
    requireRole,
    optionalAuth,
    driverAuth,
    JWT_SECRET
};
