// OSRM Service - Route calculation and optimization
const OSRM_BASE_URL = 'https://router.project-osrm.org';

// Format duration to readable string
const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
};

// Fetch route with stats (distance, duration)
export const fetchRouteWithStats = async (waypoints) => {
    if (waypoints.length < 2) return null;

    const coordinatesString = waypoints
        .map(wp => `${wp.lng},${wp.lat}`)
        .join(';');

    try {
        const response = await fetch(
            `${OSRM_BASE_URL}/route/v1/driving/${coordinatesString}?overview=full&geometries=geojson&steps=false`
        );
        const data = await response.json();

        if (data.code === 'Ok' && data.routes && data.routes[0]) {
            const route = data.routes[0];
            return {
                success: true,
                coordinates: route.geometry.coordinates,
                distance: route.distance,
                duration: route.duration,
                distanceKm: (route.distance / 1000).toFixed(1),
                durationFormatted: formatDuration(route.duration)
            };
        }
        return { success: false, error: 'Route not found' };
    } catch (error) {
        console.error('OSRM Route Error:', error);
        return { success: false, error: error.message };
    }
};

// Generate multiple route options with different optimization strategies
export const generateRouteOptions = async (waypoints) => {
    if (waypoints.length < 3) {
        // Not enough points for meaningful optimization
        const basicRoute = await fetchRouteWithStats(waypoints);
        return { success: true, options: [{ ...basicRoute, name: 'Ruta directa', strategy: 'direct' }] };
    }

    const options = [];

    try {
        // Option 1: Keep first point as start, optimize rest (most common use case)
        const opt1 = await optimizeFromStart(waypoints);
        if (opt1.success) {
            options.push({ ...opt1, name: '🚀 Más rápida (desde inicio)', strategy: 'from_start' });
        }

        // Option 2: Round trip (return to start)
        const opt2 = await optimizeRoundTrip(waypoints);
        if (opt2.success) {
            options.push({ ...opt2, name: '🔄 Circular (regresar al inicio)', strategy: 'round_trip' });
        }

        // Option 3: Nearest neighbor starting from first point
        const opt3 = await optimizeNearestNeighbor(waypoints);
        if (opt3.success) {
            options.push({ ...opt3, name: '📍 Punto más cercano', strategy: 'nearest' });
        }

        if (options.length === 0) {
            return { success: false, error: 'No se pudieron generar opciones' };
        }

        // Sort by distance
        options.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));

        return { success: true, options };
    } catch (error) {
        console.error('Route options error:', error);
        return { success: false, error: error.message };
    }
};

// Optimize keeping first point as start
const optimizeFromStart = async (waypoints) => {
    const coordinatesString = waypoints
        .map(wp => `${wp.lng},${wp.lat}`)
        .join(';');

    try {
        const response = await fetch(
            `${OSRM_BASE_URL}/trip/v1/driving/${coordinatesString}?roundtrip=false&source=first&destination=last&geometries=geojson&overview=full`
        );
        const data = await response.json();

        if (data.code === 'Ok' && data.trips && data.trips[0]) {
            const trip = data.trips[0];
            const optimizedWaypoints = data.waypoints.map(wp => waypoints[wp.waypoint_index]);

            return {
                success: true,
                coordinates: trip.geometry.coordinates,
                distance: trip.distance,
                duration: trip.duration,
                distanceKm: (trip.distance / 1000).toFixed(1),
                durationFormatted: formatDuration(trip.duration),
                optimizedWaypoints
            };
        }
        return { success: false };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

// Optimize as round trip
const optimizeRoundTrip = async (waypoints) => {
    const coordinatesString = waypoints
        .map(wp => `${wp.lng},${wp.lat}`)
        .join(';');

    try {
        const response = await fetch(
            `${OSRM_BASE_URL}/trip/v1/driving/${coordinatesString}?roundtrip=true&source=first&geometries=geojson&overview=full`
        );
        const data = await response.json();

        if (data.code === 'Ok' && data.trips && data.trips[0]) {
            const trip = data.trips[0];
            const optimizedWaypoints = data.waypoints.map(wp => waypoints[wp.waypoint_index]);

            return {
                success: true,
                coordinates: trip.geometry.coordinates,
                distance: trip.distance,
                duration: trip.duration,
                distanceKm: (trip.distance / 1000).toFixed(1),
                durationFormatted: formatDuration(trip.duration),
                optimizedWaypoints
            };
        }
        return { success: false };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

// Nearest neighbor algorithm
const optimizeNearestNeighbor = async (waypoints) => {
    // Start from first point and always go to nearest unvisited
    const visited = [0];
    const unvisited = waypoints.slice(1).map((_, i) => i + 1);

    while (unvisited.length > 0) {
        const current = waypoints[visited[visited.length - 1]];
        let nearestIdx = 0;
        let minDist = Infinity;

        for (let i = 0; i < unvisited.length; i++) {
            const target = waypoints[unvisited[i]];
            const dist = haversineDistance(current.lat, current.lng, target.lat, target.lng);
            if (dist < minDist) {
                minDist = dist;
                nearestIdx = i;
            }
        }

        visited.push(unvisited[nearestIdx]);
        unvisited.splice(nearestIdx, 1);
    }

    const optimizedWaypoints = visited.map(i => waypoints[i]);

    // Now get the actual route for this order
    const route = await fetchRouteWithStats(optimizedWaypoints);

    if (route?.success) {
        return {
            ...route,
            success: true,
            optimizedWaypoints
        };
    }
    return { success: false };
};

// Haversine distance calculation
const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// Legacy function for compatibility
export const optimizeRoute = async (waypoints, roundTrip = false) => {
    if (roundTrip) {
        return await optimizeRoundTrip(waypoints);
    }
    return await optimizeFromStart(waypoints);
};
