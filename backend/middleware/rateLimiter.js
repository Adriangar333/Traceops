const rateLimit = require('express-rate-limit');

/**
 * General API Rate Limiter
 * Max 100 requests per 15 minutes per IP
 */
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: {
        error: 'Too Many Requests',
        message: 'Demasiadas peticiones. Intenta de nuevo en 15 minutos.',
        retryAfter: 900
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Strict Rate Limiter for Auth endpoints
 * Max 5 login attempts per 15 minutes per IP
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
        error: 'Too Many Login Attempts',
        message: 'Demasiados intentos de login. Intenta de nuevo en 15 minutos.',
        retryAfter: 900
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Relaxed limiter for public endpoints
 * Max 500 requests per 15 minutes
 */
const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: {
        error: 'Rate Limit Exceeded',
        message: 'Límite de peticiones excedido.'
    }
});

module.exports = {
    apiLimiter,
    authLimiter,
    publicLimiter
};
