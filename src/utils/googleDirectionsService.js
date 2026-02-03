// Google Directions Service - Route calculation with traffic data
// Uses Google Maps Directions API for accurate route optimization

import { loadGoogleMaps } from './loadGoogleMaps';

// Cache for DirectionsService instance
let directionsServiceInstance = null;

/**
 * Get or create DirectionsService instance
 */
const getDirectionsService = async () => {
    if (directionsServiceInstance) return directionsServiceInstance;

    const google = await loadGoogleMaps();
    if (!google?.maps?.DirectionsService) {
        throw new Error('Google Maps API not loaded');
    }

    directionsServiceInstance = new google.maps.DirectionsService();
    return directionsServiceInstance;
};

/**
 * Transform Google polyline to coordinate array [lng, lat]
 * @param {object} route - Google Directions route object
 * @returns {Array} Array of [lng, lat] coordinates
 */
const extractCoordinates = (route) => {
    if (!route?.overview_path) return [];
    return route.overview_path.map(point => [point.lng(), point.lat()]);
};

/**
 * Format duration to readable string
 */
const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
};

/**
 * Get route from Google Directions API
 * @param {Array} waypoints - Array of {lat, lng, address} objects
 * @param {Object} options - { optimize: boolean }
 * @returns {Object} Route result with coordinates, distance, duration
 */
export const getGoogleRoute = async (waypoints, options = {}) => {
    if (!waypoints || waypoints.length < 2) {
        return { success: false, error: 'Need at least 2 waypoints' };
    }

    try {
        const directionsService = await getDirectionsService();

        const origin = waypoints[0];
        const destination = waypoints[waypoints.length - 1];
        const intermediates = waypoints.slice(1, -1);

        const request = {
            origin: { lat: origin.lat, lng: origin.lng },
            destination: { lat: destination.lat, lng: destination.lng },
            waypoints: intermediates.map(wp => ({
                location: { lat: wp.lat, lng: wp.lng },
                stopover: true
            })),
            optimizeWaypoints: options.optimize || false,
            travelMode: 'DRIVING',
            drivingOptions: {
                departureTime: new Date(),
                trafficModel: 'bestguess'
            }
        };

        return new Promise((resolve) => {
            directionsService.route(request, (result, status) => {
                if (status === 'OK' && result.routes?.[0]) {
                    const route = result.routes[0];
                    const leg = route.legs[0];

                    // Sum up all legs for total distance/duration
                    let totalDistance = 0;
                    let totalDuration = 0;
                    let totalDurationInTraffic = 0;

                    route.legs.forEach(l => {
                        totalDistance += l.distance?.value || 0;
                        totalDuration += l.duration?.value || 0;
                        totalDurationInTraffic += l.duration_in_traffic?.value || l.duration?.value || 0;
                    });

                    resolve({
                        success: true,
                        coordinates: extractCoordinates(route),
                        distance: totalDistance,
                        distanceKm: (totalDistance / 1000).toFixed(1),
                        duration: totalDuration,
                        durationFormatted: formatDuration(totalDuration),
                        durationInTraffic: totalDurationInTraffic,
                        durationInTrafficFormatted: formatDuration(totalDurationInTraffic),
                        hasTrafficData: totalDurationInTraffic !== totalDuration,
                        optimizedWaypointOrder: route.waypoint_order,
                        rawRoute: route
                    });
                } else {
                    console.warn('Google Directions failed:', status);
                    resolve({ success: false, error: status });
                }
            });
        });
    } catch (error) {
        console.error('Google Directions error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Generate multiple route options with different optimization strategies
 * @param {Array} waypoints - Array of {lat, lng, address} objects
 * @param {Object} config - { fixedStart, fixedEnd, returnToStart }
 * @returns {Object} { success, options: [] }
 */
export const generateGoogleRouteOptions = async (waypoints, config = {}) => {
    if (!waypoints || waypoints.length < 2) {
        return { success: false, error: 'Need at least 2 waypoints' };
    }

    const options = [];

    try {
        // Option 1: Original order (no optimization)
        const directRoute = await getGoogleRoute(waypoints, { optimize: false });
        if (directRoute.success) {
            options.push({
                ...directRoute,
                name: '📍 Orden original',
                strategy: 'direct'
            });
        }

        // Option 2: Google-optimized order
        if (waypoints.length >= 3) {
            const optimizedRoute = await getGoogleRoute(waypoints, { optimize: true });
            if (optimizedRoute.success) {
                // Reconstruct optimized waypoints
                const optimizedWaypoints = [waypoints[0]];
                if (optimizedRoute.optimizedWaypointOrder) {
                    optimizedRoute.optimizedWaypointOrder.forEach(idx => {
                        optimizedWaypoints.push(waypoints[idx + 1]); // +1 because origin is index 0
                    });
                }
                optimizedWaypoints.push(waypoints[waypoints.length - 1]);

                options.push({
                    ...optimizedRoute,
                    name: '🚀 Más rápida (Google)',
                    strategy: 'google_optimized',
                    optimizedWaypoints
                });
            }
        }

        // Option 3: Round trip (if configured)
        if (config.returnToStart && waypoints.length >= 2) {
            const roundTripWaypoints = [...waypoints, waypoints[0]];
            const roundTripRoute = await getGoogleRoute(roundTripWaypoints, { optimize: true });
            if (roundTripRoute.success) {
                options.push({
                    ...roundTripRoute,
                    name: '🔄 Circular (regresar al inicio)',
                    strategy: 'round_trip',
                    optimizedWaypoints: roundTripWaypoints
                });
            }
        }

        if (options.length === 0) {
            return { success: false, error: 'No se pudieron generar opciones de ruta' };
        }

        // Sort by duration (fastest first)
        options.sort((a, b) => (a.durationInTraffic || a.duration || Infinity) - (b.durationInTraffic || b.duration || Infinity));

        return { success: true, options };
    } catch (error) {
        console.error('Route options error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Transform coordinates helper (for n8n/backend compatibility)
 */
export const transformCoordinates = (point) => ({
    lat: Number(point.lat),
    lng: Number(point.lng),
    address: point.address || ''
});

export default {
    getGoogleRoute,
    generateGoogleRouteOptions,
    transformCoordinates
};
