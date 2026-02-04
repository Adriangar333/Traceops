/**
 * ============================================================================
 * ZONE CLASSIFIER SERVICE
 * ============================================================================
 * 
 * Sistema híbrido de clasificación geográfica para optimización de rutas.
 * Combina: Google Geocoding + OpenStreetMap + Machine Learning
 * 
 * Author: Adrian Garzón
 * Version: 1.0
 * Date: February 2026
 * ============================================================================
 */

const axios = require('axios');

// Zone type definitions with route parameters
const ZONE_TYPES = {
    URBAN_CORE: {
        name: 'Centro Urbano',
        emoji: '🏙️',
        etaMultiplier: 0.95,    // 5% faster (traffic lights but short distances)
        speedEstimate: 20,      // km/h average
        color: '#ef4444'        // Red
    },
    URBAN_RES: {
        name: 'Urbano Residencial',
        emoji: '🏘️',
        etaMultiplier: 1.0,     // Base
        speedEstimate: 30,
        color: '#f97316'        // Orange
    },
    SUBURBAN: {
        name: 'Suburbano',
        emoji: '🏡',
        etaMultiplier: 1.10,    // 10% slower
        speedEstimate: 40,
        color: '#eab308'        // Yellow
    },
    RURAL_NEAR: {
        name: 'Rural Cercano',
        emoji: '🌾',
        etaMultiplier: 1.25,    // 25% slower
        speedEstimate: 50,
        color: '#22c55e'        // Green
    },
    RURAL_FAR: {
        name: 'Rural Lejano',
        emoji: '🏔️',
        etaMultiplier: 1.50,    // 50% slower
        speedEstimate: 35,
        color: '#14b8a6'        // Teal
    },
    INDUSTRIAL: {
        name: 'Industrial',
        emoji: '🏭',
        etaMultiplier: 1.05,    // 5% slower (truck traffic)
        speedEstimate: 40,
        color: '#8b5cf6'        // Purple
    }
};

// Cache for classified zones (in-memory, will be replaced by Redis/PostgreSQL)
const zoneCache = new Map();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

/**
 * Main classification function - combines all signals
 */
async function classifyZone(lat, lng, options = {}) {
    const { forceRefresh = false, useGoogle = true, useOSM = true } = options;

    // Round coordinates to 4 decimals (~11m precision) for caching
    const latRounded = Math.round(lat * 10000) / 10000;
    const lngRounded = Math.round(lng * 10000) / 10000;
    const cacheKey = `${latRounded},${lngRounded}`;

    // Check cache first
    if (!forceRefresh && zoneCache.has(cacheKey)) {
        const cached = zoneCache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            return { ...cached.data, fromCache: true };
        }
    }

    // Gather signals in parallel
    const signals = await Promise.allSettled([
        useGoogle ? getGoogleSignal(lat, lng) : Promise.resolve(null),
        useOSM ? getOSMSignal(lat, lng) : Promise.resolve(null),
        getMLSignal(lat, lng)
    ]);

    const googleSignal = signals[0].status === 'fulfilled' ? signals[0].value : null;
    const osmSignal = signals[1].status === 'fulfilled' ? signals[1].value : null;
    const mlSignal = signals[2].status === 'fulfilled' ? signals[2].value : null;

    // Calculate urbanization score
    const urbanizationScore = calculateUrbanizationScore(googleSignal, osmSignal, mlSignal);

    // Determine zone type
    const zoneType = determineZoneType(urbanizationScore, osmSignal);
    const zoneParams = ZONE_TYPES[zoneType];

    const result = {
        coordinates: { lat: latRounded, lng: lngRounded },
        zoneType,
        zoneName: zoneParams.name,
        emoji: zoneParams.emoji,
        color: zoneParams.color,
        etaMultiplier: zoneParams.etaMultiplier,
        speedEstimate: zoneParams.speedEstimate,
        urbanizationScore,
        confidence: calculateConfidence(googleSignal, osmSignal, mlSignal),
        signals: {
            google: googleSignal,
            osm: osmSignal,
            ml: mlSignal
        },
        classifiedAt: new Date().toISOString()
    };

    // Cache result
    zoneCache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
}

/**
 * Google Geocoding API - Primary classification signal
 */
async function getGoogleSignal(lat, lng) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        console.warn('⚠️ GOOGLE_MAPS_API_KEY not configured');
        return null;
    }

    try {
        const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: {
                latlng: `${lat},${lng}`,
                key: apiKey,
                result_type: 'street_address|route|locality|administrative_area_level_2'
            },
            timeout: 5000
        });

        if (response.data.status !== 'OK' || !response.data.results?.length) {
            return null;
        }

        const result = response.data.results[0];

        // Extract useful components
        const types = result.types || [];
        const addressComponents = result.address_components || [];

        const locality = addressComponents.find(c => c.types.includes('locality'))?.long_name;
        const adminLevel2 = addressComponents.find(c => c.types.includes('administrative_area_level_2'))?.long_name;
        const adminLevel3 = addressComponents.find(c => c.types.includes('administrative_area_level_3'))?.long_name;

        return {
            types,
            formattedAddress: result.formatted_address,
            locality,
            adminLevel2,
            adminLevel3,
            placeId: result.place_id,
            // Calculate score based on types
            urbanScore: calculateGoogleUrbanScore(types)
        };
    } catch (error) {
        console.error('Google Geocoding error:', error.message);
        return null;
    }
}

/**
 * Calculate urban score from Google types
 */
function calculateGoogleUrbanScore(types) {
    if (types.includes('street_address')) return 1.0;
    if (types.includes('premise')) return 0.95;
    if (types.includes('route')) return 0.85;
    if (types.includes('neighborhood')) return 0.75;
    if (types.includes('sublocality')) return 0.70;
    if (types.includes('locality')) return 0.60;
    if (types.includes('administrative_area_level_3')) return 0.40;
    if (types.includes('administrative_area_level_2')) return 0.20;
    return 0.10;
}

/**
 * OpenStreetMap Overpass API - Infrastructure data
 */
async function getOSMSignal(lat, lng) {
    try {
        // Overpass query to get nearby infrastructure
        const query = `
            [out:json][timeout:10];
            (
                way["building"](around:300, ${lat}, ${lng});
                way["landuse"](around:500, ${lat}, ${lng});
                way["highway"](around:500, ${lat}, ${lng});
                node["amenity"](around:300, ${lat}, ${lng});
            );
            out count;
        `;

        const response = await axios.post(
            'https://overpass-api.de/api/interpreter',
            `data=${encodeURIComponent(query)}`,
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10000
            }
        );

        // Parse counts from response
        const elements = response.data.elements || [];

        // Get landuse type with a separate query (simpler)
        const landuseQuery = `
            [out:json][timeout:5];
            way["landuse"](around:100, ${lat}, ${lng});
            out tags 1;
        `;

        let landuse = 'unknown';
        try {
            const landuseResp = await axios.post(
                'https://overpass-api.de/api/interpreter',
                `data=${encodeURIComponent(landuseQuery)}`,
                { timeout: 5000 }
            );
            if (landuseResp.data.elements?.length) {
                landuse = landuseResp.data.elements[0].tags?.landuse || 'unknown';
            }
        } catch (e) { /* ignore */ }

        // Estimate counts (Overpass count response)
        const buildingCount = elements.filter(e => e.tags?.building).length;
        const amenityCount = elements.filter(e => e.tags?.amenity).length;
        const highwayElements = elements.filter(e => e.tags?.highway);

        // Calculate building density (rough estimate)
        const buildingDensity = Math.min(buildingCount / 50, 1.0); // Max 50 buildings = 1.0

        // Calculate road quality score
        const hasMainRoad = highwayElements.some(e =>
            ['primary', 'secondary', 'trunk'].includes(e.tags?.highway)
        );
        const hasResidentialRoad = highwayElements.some(e =>
            ['residential', 'tertiary'].includes(e.tags?.highway)
        );

        let roadQuality = 0.3; // Default
        if (hasMainRoad) roadQuality = 1.0;
        else if (hasResidentialRoad) roadQuality = 0.7;

        return {
            buildingCount,
            buildingDensity,
            amenityCount,
            landuse,
            roadQuality,
            poiScore: Math.min(amenityCount / 30, 1.0), // Max 30 POIs = 1.0
            // Combined score
            urbanScore: (buildingDensity * 0.4 + roadQuality * 0.3 + Math.min(amenityCount / 30, 1.0) * 0.3)
        };
    } catch (error) {
        console.error('OSM Overpass error:', error.message);
        return null;
    }
}

/**
 * ML Signal - Pre-calculated centroids for Barranquilla
 * (Acts as a fallback until actual K-Means model is trained with user history)
 */
async function getMLSignal(lat, lng) {
    // Defined centroids for Barranquilla zones (Manual "Pre-training")
    // Based on key landmarks and neighborhoods
    const BARRANQUILLA_ZONES = [
        { id: 'Norte_Riomar', lat: 11.0110, lng: -74.8050, score: 0.90, type: 'URBAN_RES' }, // Buenavista/Riomar - Residencial Alta
        { id: 'Prado_Alto', lat: 10.9950, lng: -74.8000, score: 0.95, type: 'URBAN_RES' },   // El Prado - Histórico/Residencial
        { id: 'Centro', lat: 10.9800, lng: -74.7800, score: 0.95, type: 'URBAN_CORE' },      // Centro Histórico - Tráfico denso
        { id: 'Sur_Ciudadela', lat: 10.9300, lng: -74.8100, score: 0.70, type: 'SUBURBAN' }, // Ciudadela 20 Julio - Media densidad
        { id: 'Via40_Industry', lat: 11.0200, lng: -74.7900, score: 0.50, type: 'INDUSTRIAL' }, // Vía 40 - Zona Industrial
        { id: 'Soledad_Centro', lat: 10.9100, lng: -74.7700, score: 0.65, type: 'SUBURBAN' }, // Soledad - Tráfico medio/alto
        { id: 'Juan_Mina', lat: 10.9500, lng: -74.8500, score: 0.20, type: 'RURAL_NEAR' },    // Zona Franca / Juan Mina - Rural cercano
        { id: 'Galapa', lat: 10.9000, lng: -74.8800, score: 0.15, type: 'RURAL_NEAR' }         // Galapa - Periferia
    ];

    let bestMatch = null;
    let minDistance = Infinity;

    // Find closest centroid
    for (const zone of BARRANQUILLA_ZONES) {
        const dist = haversineDistance(lat, lng, zone.lat, zone.lng);
        if (dist < minDistance) {
            minDistance = dist;
            bestMatch = zone;
        }
    }

    // Heuristics based on distance to centroid
    // If it's very close (< 1.5km) to a known centroid, rely heavily on it
    let confidence = 0.5;
    if (minDistance < 1.0) confidence = 0.95;
    else if (minDistance < 2.5) confidence = 0.8;
    else if (minDistance < 5.0) confidence = 0.5;
    else confidence = 0.3; // Too far from known points

    return {
        city: 'Barranquilla',
        clusterId: bestMatch ? bestMatch.id : 'Unknown',
        distanceToCluster: minDistance,
        densityScore: bestMatch ? bestMatch.score : 0.4, // Default falloff
        suggestedType: bestMatch ? bestMatch.type : null,
        confidence
    };
}

/**
 * Calculate overall urbanization score from all signals
 */
function calculateUrbanizationScore(google, osm, ml) {
    const weights = { google: 0.35, osm: 0.35, ml: 0.30 };

    let totalWeight = 0;
    let weightedSum = 0;

    if (google?.urbanScore != null) {
        weightedSum += google.urbanScore * weights.google;
        totalWeight += weights.google;
    }

    if (osm?.urbanScore != null) {
        weightedSum += osm.urbanScore * weights.osm;
        totalWeight += weights.osm;
    }

    if (ml?.densityScore != null) {
        weightedSum += ml.densityScore * weights.ml;
        totalWeight += weights.ml;
    }

    if (totalWeight === 0) return 0.5; // Default to suburban

    return weightedSum / totalWeight;
}

/**
 * Determine zone type from urbanization score
 */
function determineZoneType(score, osmSignal) {
    // Check for industrial zones
    if (osmSignal?.landuse === 'industrial' || osmSignal?.landuse === 'commercial') {
        if (score >= 0.5) return 'INDUSTRIAL';
    }

    if (score >= 0.85) return 'URBAN_CORE';
    if (score >= 0.65) return 'URBAN_RES';
    if (score >= 0.45) return 'SUBURBAN';
    if (score >= 0.25) return 'RURAL_NEAR';
    return 'RURAL_FAR';
}

/**
 * Calculate confidence score
 */
function calculateConfidence(google, osm, ml) {
    let signals = 0;
    if (google) signals++;
    if (osm) signals++;
    if (ml) signals++;

    // Confidence based on number of available signals
    if (signals === 3) return 0.95;
    if (signals === 2) return 0.80;
    if (signals === 1) return 0.60;
    return 0.40;
}

/**
 * Haversine distance calculation
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg) {
    return deg * (Math.PI / 180);
}

/**
 * Batch classify multiple coordinates
 */
async function classifyZonesBatch(coordinates, options = {}) {
    const results = await Promise.all(
        coordinates.map(({ lat, lng }) => classifyZone(lat, lng, options))
    );
    return results;
}

/**
 * Get zone statistics for a route
 */
function getRouteZoneStats(classifications) {
    const stats = {
        totalPoints: classifications.length,
        byZone: {},
        avgUrbanization: 0,
        avgEtaMultiplier: 1.0,
        dominantZone: null
    };

    let urbanSum = 0;
    let etaSum = 0;

    for (const c of classifications) {
        const zone = c.zoneType;
        if (!stats.byZone[zone]) {
            stats.byZone[zone] = { count: 0, zoneName: c.zoneName, emoji: c.emoji };
        }
        stats.byZone[zone].count++;
        urbanSum += c.urbanizationScore;
        etaSum += c.etaMultiplier;
    }

    stats.avgUrbanization = urbanSum / classifications.length;
    stats.avgEtaMultiplier = etaSum / classifications.length;

    // Find dominant zone
    let maxCount = 0;
    for (const [zone, data] of Object.entries(stats.byZone)) {
        if (data.count > maxCount) {
            maxCount = data.count;
            stats.dominantZone = zone;
        }
    }

    return stats;
}

// Export functions
module.exports = {
    classifyZone,
    classifyZonesBatch,
    getRouteZoneStats,
    ZONE_TYPES,
    // For testing
    getGoogleSignal,
    getOSMSignal,
    getMLSignal
};
