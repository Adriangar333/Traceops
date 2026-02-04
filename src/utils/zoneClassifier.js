/**
 * ============================================================================
 * ZONE CLASSIFICATION SERVICE - FRONTEND
 * ============================================================================
 * 
 * Client-side service for classifying geographic zones.
 * Communicates with backend /api/zones endpoints.
 * 
 * Author: Adrian Garzón
 * Version: 1.0
 * ============================================================================
 */

const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : 'https://dashboard-backend.zvkdyr.easypanel.host';

/**
 * Zone type definitions with colors and parameters
 */
export const ZONE_TYPES = {
    URBAN_CORE: {
        name: 'Centro Urbano',
        emoji: '🏙️',
        color: '#ef4444',
        bgColor: 'rgba(239, 68, 68, 0.1)',
        etaMultiplier: 0.95
    },
    URBAN_RES: {
        name: 'Urbano Residencial',
        emoji: '🏘️',
        color: '#f97316',
        bgColor: 'rgba(249, 115, 22, 0.1)',
        etaMultiplier: 1.0
    },
    SUBURBAN: {
        name: 'Suburbano',
        emoji: '🏡',
        color: '#eab308',
        bgColor: 'rgba(234, 179, 8, 0.1)',
        etaMultiplier: 1.10
    },
    RURAL_NEAR: {
        name: 'Rural Cercano',
        emoji: '🌾',
        color: '#22c55e',
        bgColor: 'rgba(34, 197, 94, 0.1)',
        etaMultiplier: 1.25
    },
    RURAL_FAR: {
        name: 'Rural Lejano',
        emoji: '🏔️',
        color: '#14b8a6',
        bgColor: 'rgba(20, 184, 166, 0.1)',
        etaMultiplier: 1.50
    },
    INDUSTRIAL: {
        name: 'Industrial',
        emoji: '🏭',
        color: '#8b5cf6',
        bgColor: 'rgba(139, 92, 246, 0.1)',
        etaMultiplier: 1.05
    }
};

/**
 * Classify a single coordinate
 */
export async function classifyZone(lat, lng, forceRefresh = false) {
    try {
        const params = new URLSearchParams({ lat, lng });
        if (forceRefresh) params.append('refresh', 'true');

        const response = await fetch(`${API_BASE}/api/zones/classify?${params}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Zone classification error:', error);
        // Return fallback classification
        return {
            zoneType: 'SUBURBAN',
            zoneName: 'Suburbano',
            emoji: '🏡',
            etaMultiplier: 1.0,
            error: error.message
        };
    }
}

/**
 * Classify multiple coordinates in batch
 */
export async function classifyZonesBatch(coordinates) {
    try {
        const response = await fetch(`${API_BASE}/api/zones/classify-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coordinates })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Batch zone classification error:', error);
        // Return fallback classifications
        return {
            count: coordinates.length,
            classifications: coordinates.map(() => ({
                zoneType: 'SUBURBAN',
                zoneName: 'Suburbano',
                emoji: '🏡',
                etaMultiplier: 1.0,
                error: 'Classification failed'
            }))
        };
    }
}

/**
 * Get zone statistics for a route
 */
export async function getRouteZoneStats(waypoints) {
    try {
        const response = await fetch(`${API_BASE}/api/zones/route-stats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ waypoints })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Route zone stats error:', error);
        return null;
    }
}

/**
 * Enrich waypoints with zone information
 * Call this after creating/optimizing a route
 */
export async function enrichWaypointsWithZones(waypoints) {
    if (!waypoints || waypoints.length === 0) return waypoints;

    const coordinates = waypoints.map(wp => ({
        lat: wp.lat,
        lng: wp.lng
    }));

    const result = await classifyZonesBatch(coordinates);

    return waypoints.map((wp, index) => ({
        ...wp,
        zone: result.classifications?.[index] || null
    }));
}

/**
 * Calculate adjusted ETA based on zone types
 */
export function calculateAdjustedETA(originalEtaMinutes, zoneClassifications) {
    if (!zoneClassifications || zoneClassifications.length === 0) {
        return originalEtaMinutes;
    }

    // Calculate average ETA multiplier
    const avgMultiplier = zoneClassifications.reduce((sum, z) =>
        sum + (z.etaMultiplier || 1.0), 0) / zoneClassifications.length;

    return Math.round(originalEtaMinutes * avgMultiplier);
}

/**
 * Get zone type info (for display purposes)
 */
export function getZoneTypeInfo(zoneType) {
    return ZONE_TYPES[zoneType] || ZONE_TYPES.SUBURBAN;
}

/**
 * Format zone badge HTML
 */
export function getZoneBadgeStyle(zoneType) {
    const info = getZoneTypeInfo(zoneType);
    return {
        background: info.bgColor,
        color: info.color,
        border: `1px solid ${info.color}20`,
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: '500',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px'
    };
}
