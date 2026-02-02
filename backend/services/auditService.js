const { TARIFFS } = require('../utils/tariffs');

// Distancia en metros (Haversine formula simplification or PostGIS usage if available)
// We will use a JS helper here to avoid complex SQL queries for now, but PostGIS ST_Distance is better.
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in metres
};

const validateOrderClosure = (order, closingData) => {
    const flags = {};
    let isFlagged = false;

    // 1. GPS Validation
    if (order.latitude && order.longitude && closingData.latitude && closingData.longitude) {
        const distance = calculateDistance(
            order.latitude, order.longitude,
            closingData.latitude, closingData.longitude
        );

        // Threshold: 200m (configurable)
        if (distance > 200) {
            flags.gps_mismatch = true;
            flags.distance_off = Math.round(distance);
            isFlagged = true;
        }
    } else {
        flags.gps_missing = true; // Flag if GPS data is missing? Optional.
    }

    // 2. Time Validation (Suspicious Duration)
    // Needs 'arrival_time' or similar metadata to calculate 'execution_duration'
    // If not available, we skip.
    if (closingData.durationMinutes) {
        if (closingData.durationMinutes < 5) {
            flags.too_fast = true;
            isFlagged = true;
        } else if (closingData.durationMinutes > 120) {
            flags.too_slow = true;
            isFlagged = true;
        }
    }

    return { isFlagged, flags };
};

module.exports = {
    validateOrderClosure
};
