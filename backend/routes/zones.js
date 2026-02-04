/**
 * ============================================================================
 * ZONE CLASSIFICATION API ROUTES
 * ============================================================================
 * 
 * Endpoints for geographic zone classification.
 * 
 * GET  /api/zones/classify?lat=X&lng=Y     - Classify single coordinate
 * POST /api/zones/classify-batch           - Classify multiple coordinates
 * GET  /api/zones/types                    - Get available zone types
 * POST /api/zones/route-stats              - Get zone stats for a route
 * 
 * Author: Adrian Garzón
 * Version: 1.0
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const {
    classifyZone,
    classifyZonesBatch,
    getRouteZoneStats,
    ZONE_TYPES
} = require('../services/zoneClassifier');

/**
 * GET /api/zones/types
 * Returns available zone types with their parameters
 */
router.get('/types', (req, res) => {
    const types = Object.entries(ZONE_TYPES).map(([key, value]) => ({
        code: key,
        ...value
    }));
    res.json(types);
});

/**
 * GET /api/zones/classify
 * Classify a single coordinate
 * 
 * Query params:
 * - lat: Latitude (required)
 * - lng: Longitude (required)
 * - refresh: Force refresh cache (optional, default false)
 */
router.get('/classify', async (req, res) => {
    try {
        const { lat, lng, refresh } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({
                error: 'Missing required parameters: lat, lng'
            });
        }

        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);

        if (isNaN(latNum) || isNaN(lngNum)) {
            return res.status(400).json({
                error: 'Invalid coordinates: lat and lng must be numbers'
            });
        }

        // Validate coordinate ranges
        if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
            return res.status(400).json({
                error: 'Coordinates out of range'
            });
        }

        const result = await classifyZone(latNum, lngNum, {
            forceRefresh: refresh === 'true'
        });

        res.json(result);
    } catch (error) {
        console.error('Zone classification error:', error);
        res.status(500).json({
            error: 'Classification failed',
            message: error.message
        });
    }
});

/**
 * POST /api/zones/classify-batch
 * Classify multiple coordinates in batch
 * 
 * Body:
 * {
 *   "coordinates": [
 *     { "lat": 10.9878, "lng": -74.7889 },
 *     { "lat": 10.9900, "lng": -74.8000 }
 *   ],
 *   "refresh": false
 * }
 */
router.post('/classify-batch', async (req, res) => {
    try {
        const { coordinates, refresh } = req.body;

        if (!coordinates || !Array.isArray(coordinates)) {
            return res.status(400).json({
                error: 'Missing or invalid coordinates array'
            });
        }

        if (coordinates.length > 100) {
            return res.status(400).json({
                error: 'Maximum 100 coordinates per batch'
            });
        }

        // Validate all coordinates
        for (let i = 0; i < coordinates.length; i++) {
            const { lat, lng } = coordinates[i];
            if (typeof lat !== 'number' || typeof lng !== 'number') {
                return res.status(400).json({
                    error: `Invalid coordinate at index ${i}`
                });
            }
        }

        const results = await classifyZonesBatch(coordinates, {
            forceRefresh: refresh === true
        });

        res.json({
            count: results.length,
            classifications: results
        });
    } catch (error) {
        console.error('Batch classification error:', error);
        res.status(500).json({
            error: 'Batch classification failed',
            message: error.message
        });
    }
});

/**
 * POST /api/zones/route-stats
 * Get zone statistics for a route
 * 
 * Body:
 * {
 *   "waypoints": [
 *     { "lat": 10.9878, "lng": -74.7889, "address": "..." },
 *     ...
 *   ]
 * }
 */
router.post('/route-stats', async (req, res) => {
    try {
        const { waypoints } = req.body;

        if (!waypoints || !Array.isArray(waypoints) || waypoints.length === 0) {
            return res.status(400).json({
                error: 'Missing or invalid waypoints array'
            });
        }

        // Extract coordinates
        const coordinates = waypoints.map(wp => ({
            lat: wp.lat,
            lng: wp.lng
        }));

        // Classify all waypoints
        const classifications = await classifyZonesBatch(coordinates);

        // Calculate stats
        const stats = getRouteZoneStats(classifications);

        // Add waypoint details
        const waypointsWithZones = waypoints.map((wp, i) => ({
            ...wp,
            zone: {
                type: classifications[i].zoneType,
                name: classifications[i].zoneName,
                emoji: classifications[i].emoji,
                etaMultiplier: classifications[i].etaMultiplier
            }
        }));

        res.json({
            stats,
            waypoints: waypointsWithZones,
            recommendations: generateRouteRecommendations(stats, classifications)
        });
    } catch (error) {
        console.error('Route stats error:', error);
        res.status(500).json({
            error: 'Route stats calculation failed',
            message: error.message
        });
    }
});

/**
 * Generate recommendations based on route zones
 */
function generateRouteRecommendations(stats, classifications) {
    const recommendations = [];

    // Check for rural areas
    const ruralCount = (stats.byZone.RURAL_NEAR?.count || 0) +
        (stats.byZone.RURAL_FAR?.count || 0);
    const ruralPercent = (ruralCount / stats.totalPoints) * 100;

    if (ruralPercent > 30) {
        recommendations.push({
            type: 'warning',
            icon: '🌾',
            message: `${ruralPercent.toFixed(0)}% de las paradas están en zonas rurales. Considere asignar más tiempo.`,
            action: 'Aumentar buffer de tiempo en 15-20 minutos'
        });
    }

    // Check for mixed urban/rural routes
    const zoneCount = Object.keys(stats.byZone).length;
    if (zoneCount >= 3) {
        recommendations.push({
            type: 'info',
            icon: '🔀',
            message: 'Esta ruta cruza múltiples tipos de zona. Los tiempos de tránsito variarán.',
            action: 'Optimizar ordenando por zona para reducir cambios'
        });
    }

    // Check for high ETA multiplier
    if (stats.avgEtaMultiplier > 1.2) {
        recommendations.push({
            type: 'warning',
            icon: '⏱️',
            message: `El ETA promedio debe ajustarse +${((stats.avgEtaMultiplier - 1) * 100).toFixed(0)}% por zonas difíciles.`,
            action: 'Considere dividir la ruta o asignar vehículo adecuado'
        });
    }

    // Check for industrial zones
    if (stats.byZone.INDUSTRIAL?.count > 0) {
        recommendations.push({
            type: 'info',
            icon: '🏭',
            message: `${stats.byZone.INDUSTRIAL.count} paradas en zonas industriales.`,
            action: 'Verificar horarios de acceso y documentación requerida'
        });
    }

    return recommendations;
}

module.exports = router;
