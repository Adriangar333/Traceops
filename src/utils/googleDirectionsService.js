// Google Directions Service - Routes with traffic data
// Uses Google Directions API for accurate ETAs with real-time traffic

import { loadGoogleMaps } from './loadGoogleMaps';

// Wait for Google Maps to be loaded
const waitForGoogle = async () => {
    await loadGoogleMaps();
};

// Format duration from seconds
const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}min`;
    return `${minutes} min`;
};

// Calculate distance between two points (Haversine formula)
const haversineDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// Nearest Neighbor Algorithm
// If fixedStart is true, starts from first point
// If fixedStart is false, tries all starting points and picks the best one
export const nearestNeighborSort = (waypoints, fixedEnd = false, fixedStart = true) => {
    if (waypoints.length <= 2) return waypoints;

    const haversine = (p1, p2) => haversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);

    const calculateTotalDist = (path) => {
        let d = 0;
        for (let i = 0; i < path.length - 1; i++) {
            d += haversine(path[i], path[i + 1]);
        }
        return d;
    };

    const runNearestNeighbor = (startIdx, endIdx = null) => {
        const start = waypoints[startIdx];
        let end = endIdx !== null ? waypoints[endIdx] : null;

        // Build pool of points to visit (excluding start and optionally end)
        let pool = waypoints.filter((_, i) => i !== startIdx && (endIdx === null || i !== endIdx));

        const sorted = [start];

        while (pool.length > 0) {
            const current = sorted[sorted.length - 1];
            let nearestIdx = 0;
            let nearestDist = Infinity;

            for (let i = 0; i < pool.length; i++) {
                const dist = haversine(current, pool[i]);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestIdx = i;
                }
            }

            sorted.push(pool[nearestIdx]);
            pool.splice(nearestIdx, 1);
        }

        if (end) {
            sorted.push(end);
        }

        return sorted;
    };

    // If start is fixed, just run from index 0
    if (fixedStart) {
        const endIdx = fixedEnd ? waypoints.length - 1 : null;
        return runNearestNeighbor(0, endIdx);
    }

    // Otherwise, try all starting points and find the best route
    let bestRoute = null;
    let bestDistance = Infinity;

    for (let startIdx = 0; startIdx < waypoints.length; startIdx++) {
        // If fixedEnd, we still need to end at the last point
        const endIdx = fixedEnd ? waypoints.length - 1 : null;

        // Skip if start would be same as end
        if (startIdx === endIdx) continue;

        const route = runNearestNeighbor(startIdx, endIdx);
        const distance = calculateTotalDist(route);

        if (distance < bestDistance) {
            bestDistance = distance;
            bestRoute = route;
        }
    }

    console.log(`Nearest Neighbor tried ${waypoints.length} starting points, best distance: ${bestDistance.toFixed(2)} km`);
    return bestRoute || waypoints;
};

// 2-Opt Optimization Algorithm - Iteratively swaps edges to uncross paths
const twoOptSort = (waypoints, fixedAtEnd = false, fixedStart = true) => {
    if (waypoints.length <= 3) return waypoints;

    // Start with Nearest Neighbor to get a good initial solution
    let route = nearestNeighborSort(waypoints, fixedAtEnd, fixedStart);

    const calculateTotalDist = (path) => {
        let d = 0;
        for (let i = 0; i < path.length - 1; i++) {
            d += haversineDistance(path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng);
        }
        return d;
    };

    // Determine which indices are fixed (cannot be moved)
    const startFixed = fixedStart ? 0 : -1;
    const endFixed = fixedAtEnd ? route.length - 1 : -1;

    // 2-Opt improvement loop
    let improved = true;
    let maxIterations = 100;
    let iteration = 0;

    while (improved && iteration < maxIterations) {
        improved = false;
        iteration++;
        let bestDistance = calculateTotalDist(route);

        // Try all possible 2-opt swaps
        // If start is fixed (0), we start swapping from index 1 (preserving index 0)
        // If start is not fixed (-1), we can start swapping from index 0
        const startSwapIdx = startFixed === 0 ? 1 : 0;

        for (let i = startSwapIdx; i < route.length - 1; i++) {
            // Skip if this is the fixed end point (though i < length-1 usually handles it, double check)
            if (i === endFixed) continue;

            for (let j = i + 1; j < route.length; j++) {
                // Skip if this is the fixed end point
                if (j === endFixed && fixedAtEnd) continue;
                // Skip adjacent (no swap needed)
                if (j === i + 1) continue;

                // Create new route by reversing segment between i and j
                const newRoute = [
                    ...route.slice(0, i),
                    ...route.slice(i, j + 1).reverse(),
                    ...route.slice(j + 1)
                ];

                const newDistance = calculateTotalDist(newRoute);

                if (newDistance < bestDistance - 0.001) { // Small tolerance for floating point
                    route = newRoute;
                    bestDistance = newDistance;
                    improved = true;
                }
            }
        }
    }

    console.log(`2-Opt completed in ${iteration} iterations`);
    return route;
};

// Get route using Google Directions API with traffic
export const getGoogleRoute = async (waypoints, options = {}) => {
    if (waypoints.length < 2) return { success: false, error: 'Need at least 2 waypoints' };

    try {
        await waitForGoogle();

        let orderedWaypoints = waypoints;
        let useGoogleOptimize = false;

        // Determine strategy
        const fixedStart = options.fixedStart !== false; // Default true for backward compatibility
        const fixedEnd = options.fixedEnd || false;

        if (options.strategy === 'greedy') {
            // Nearest Neighbor (Greedy)
            orderedWaypoints = nearestNeighborSort(waypoints, fixedEnd, fixedStart);
            useGoogleOptimize = false;
        } else if (options.strategy === 'two-opt') {
            // 2-Opt (Hybrid/Genetic)
            orderedWaypoints = twoOptSort(waypoints, fixedEnd, fixedStart);
            useGoogleOptimize = false;
        } else if (options.strategy === 'google') {
            // Google TSP - Let Google handle optimization
            // NOTE: Google TSP only works for <= 25 waypoints (23 intermediates).
            // If > 25, we MUST fallback to a local sort first, then just use Google for drawing.
            if (waypoints.length > 25) {
                console.warn('Google TSP limit (25) exceeded. Falling back to 2-Opt for optimization, using Google for drawing only.');
                orderedWaypoints = twoOptSort(waypoints, fixedEnd, fixedStart);
                useGoogleOptimize = false;
            } else {
                orderedWaypoints = waypoints;
                useGoogleOptimize = true;
            }
        } else if (options.optimize) {
            // Backward compatibility
            orderedWaypoints = nearestNeighborSort(waypoints, fixedEnd, fixedStart);
        }

        const MAX_WAYPOINTS_PER_REQUEST = 25; // Limit includes origin and destination

        // Helper to fetch a single leg/segment
        const fetchSegment = (segmentWaypoints) => {
            return new Promise((resolve) => {
                const directionsService = new window.google.maps.DirectionsService();
                const origin = segmentWaypoints[0];
                const destination = segmentWaypoints[segmentWaypoints.length - 1];
                const intermediateWaypoints = segmentWaypoints.slice(1, -1).map(wp => ({
                    location: new window.google.maps.LatLng(wp.lat, wp.lng),
                    stopover: true
                }));

                // Determine travel mode from options
                const travelModeMap = {
                    'walking': window.google.maps.TravelMode.WALKING,
                    'bicycle': window.google.maps.TravelMode.BICYCLING,
                    'transit': window.google.maps.TravelMode.TRANSIT,
                    'driving': window.google.maps.TravelMode.DRIVING,
                    'car': window.google.maps.TravelMode.DRIVING,
                    'motorcycle': window.google.maps.TravelMode.DRIVING,
                    'truck': window.google.maps.TravelMode.DRIVING
                };
                const selectedTravelMode = travelModeMap[options.travelMode] || window.google.maps.TravelMode.DRIVING;
                const isDriving = selectedTravelMode === window.google.maps.TravelMode.DRIVING;

                const request = {
                    origin: new window.google.maps.LatLng(origin.lat, origin.lng),
                    destination: new window.google.maps.LatLng(destination.lat, destination.lng),
                    waypoints: intermediateWaypoints,
                    optimizeWaypoints: useGoogleOptimize && segmentWaypoints.length <= 25, // Only optimize if small enough (or if logic above allowed it)
                    travelMode: selectedTravelMode,
                    ...(isDriving && {
                        drivingOptions: {
                            departureTime: new Date(),
                            trafficModel: window.google.maps.TrafficModel.BEST_GUESS
                        }
                    })
                };

                directionsService.route(request, (result, status) => {
                    if (status === 'OK' && result.routes && result.routes[0]) {
                        resolve({ success: true, result: result.routes[0] });
                    } else {
                        console.error('Directions segment failed:', status);
                        resolve({ success: false, status });
                    }
                });
            });
        };

        // If simple enough, just one request
        if (orderedWaypoints.length <= MAX_WAYPOINTS_PER_REQUEST) {
            const response = await fetchSegment(orderedWaypoints);
            if (!response.success) {
                return { success: false, error: response.status };
            }

            const route = response.result;
            // Process single route result (same as before)
            let totalDistance = 0;
            let totalDuration = 0;
            let totalDurationInTraffic = 0;
            route.legs.forEach(l => {
                totalDistance += l.distance.value;
                totalDuration += l.duration.value;
                totalDurationInTraffic += l.duration_in_traffic?.value || l.duration.value;
            });

            const coordinates = [];

            // Try to get detailed path from steps
            route.legs.forEach(l => {
                l.steps.forEach(step => {
                    const path = step.path || step.lat_lngs || [];
                    path.forEach(point => {
                        if (typeof point.lat === 'function') {
                            coordinates.push([point.lng(), point.lat()]);
                        }
                    });
                });
            });

            // Fallback to overview_path if detailed steps are empty
            if (coordinates.length === 0 && route.overview_path) {
                route.overview_path.forEach(point => {
                    if (typeof point.lat === 'function') {
                        coordinates.push([point.lng(), point.lat()]);
                    }
                });
            }

            let optimizedWaypoints = orderedWaypoints;
            if (useGoogleOptimize && route.waypoint_order) {
                const order = route.waypoint_order;
                const intermediates = orderedWaypoints.slice(1, -1);
                const reorderedIntermediates = order.map(idx => intermediates[idx]);
                optimizedWaypoints = [orderedWaypoints[0], ...reorderedIntermediates, orderedWaypoints[orderedWaypoints.length - 1]];
            }

            return {
                success: true,
                coordinates,
                distance: totalDistance,
                distanceKm: (totalDistance / 1000).toFixed(1),
                duration: totalDuration,
                durationFormatted: formatDuration(totalDuration),
                durationInTraffic: totalDurationInTraffic,
                durationInTrafficFormatted: formatDuration(totalDurationInTraffic),
                hasTrafficData: totalDurationInTraffic !== totalDuration,
                optimizedWaypoints,
                waypointOrder: route.waypoint_order
            };
        }

        // --- CHUNKING LOGIC FOR > 25 WAYPOINTS ---
        // We must split into chunks.
        // Chunk 1: 0 to 24 (25 pts)
        // Chunk 2: 24 to 48 (25 pts) -> overlaps at 24
        // etc.

        console.log(`Route has ${orderedWaypoints.length} waypoints, splitting into chunks...`);

        const chunks = [];
        const chunkSize = MAX_WAYPOINTS_PER_REQUEST - 1; // -1 because we share end/start point

        for (let i = 0; i < orderedWaypoints.length - 1; i += chunkSize) {
            const chunk = orderedWaypoints.slice(i, i + chunkSize + 1);
            if (chunk.length >= 2) {
                chunks.push(chunk);
            }
        }

        let totalDistance = 0;
        let totalDuration = 0;
        let totalDurationInTraffic = 0;
        let coordinates = [];
        let finalOptimizedWaypoints = [];

        // Since we are chunking, we CANNOT rely on Google's global optimization (TSP).
        // We relied on local sort (Greedy or 2-Opt) before entering this block if strategy was 'google' but points > 25.
        // So here we validly assume `orderedWaypoints` is the final order we want to draw.

        for (const chunk of chunks) {
            const response = await fetchSegment(chunk);
            if (!response.success) {
                return { success: false, error: `Segment failed: ${response.status}` };
            }

            const route = response.result;

            route.legs.forEach(l => {
                totalDistance += l.distance.value;
                totalDuration += l.duration.value;
                totalDurationInTraffic += l.duration_in_traffic?.value || l.duration.value;
            });

            // Extract coordinates
            route.legs.forEach(l => {
                l.steps.forEach(step => {
                    const path = step.path || step.lat_lngs || [];
                    path.forEach(point => {
                        if (typeof point.lat === 'function') {
                            coordinates.push([point.lng(), point.lat()]);
                        }
                    });
                });
            });

            // Allow overview_path fallback for chunks too if needed
            if (coordinates.length === 0 && route.overview_path) {
                route.overview_path.forEach(point => {
                    if (typeof point.lat === 'function') {
                        coordinates.push([point.lng(), point.lat()]);
                    }
                });
            }
        }

        // Remove duplicate coordinates at stitch points (optional but cleaner)
        // Simple filter might be expensive for huge arrays, leaving as is for now as exact duplicates don't hurt rendering much.

        return {
            success: true,
            coordinates,
            distance: totalDistance,
            distanceKm: (totalDistance / 1000).toFixed(1),
            duration: totalDuration,
            durationFormatted: formatDuration(totalDuration),
            durationInTraffic: totalDurationInTraffic,
            durationInTrafficFormatted: formatDuration(totalDurationInTraffic),
            hasTrafficData: totalDurationInTraffic !== totalDuration,
            optimizedWaypoints: orderedWaypoints, // We didn't allow Google to reorder chunks internally
            waypointOrder: [] // No meaningful single order to return
        };

    } catch (error) {
        console.error('Google Directions error:', error);
        return { success: false, error: error.message };
    }
};

// Generate multiple route options using Google Directions
export const generateGoogleRouteOptions = async (waypoints, routeOptions = {}) => {
    if (waypoints.length < 2) return { success: false, options: [] };

    const { fixedStart = false, fixedEnd = false, returnToStart = false, travelMode = 'driving' } = routeOptions;

    console.log('Generating route options with:', { fixedStart: !!fixedStart, fixedEnd: !!fixedEnd, returnToStart, travelMode });

    const options = [];

    // Option 1: Nearest Neighbor optimized (Fast/Greedy)
    const optimized = await getGoogleRoute(waypoints, {
        strategy: 'greedy',
        fixedStart: !!fixedStart,
        fixedEnd: !!fixedEnd,
        travelMode
    });
    if (optimized.success) {
        options.push({
            name: '🚀 Ruta Rápida',
            description: 'Velocidad pura. Elige siempre el punto más cercano.',
            longDescription: 'El algoritmo del "Vecino Más Cercano" es una estrategia voraz que siempre elige el siguiente punto disponible que esté a menor distancia. Es muy rápido de calcular y funciona bien para rutas sencillas, aunque no siempre garantiza la ruta matemáticamente más corta posible en escenarios complejos.',
            ...optimized,
            type: 'optimized_greedy'
        });
    }

    // Option 2: 2-Opt Genetic Hybrid
    const twoOpt = await getGoogleRoute(waypoints, {
        strategy: 'two-opt',
        fixedStart: !!fixedStart,
        fixedEnd: !!fixedEnd,
        travelMode
    });
    if (twoOpt.success) {
        options.push({
            name: '🧬 Algoritmo Genético',
            description: 'Equilibrio inteligente. Elimina cruces para ahorrar tiempo.',
            longDescription: 'Utiliza una optimización "2-Opt" mejorada. Analiza la ruta y busca cruces innecesarios (como formaciones en "X") para desenredarlos. Itera múltiples veces intercambiando segmentos de la ruta hasta que ya no puede encontrar mejoras, logrando un equilibrio excelente entre velocidad y eficiencia.',
            ...twoOpt,
            type: 'optimized_genetic'
        });
    }

    // Option 3: Google TSP (Best Optimization) - Has limit of 25 waypoints
    if (waypoints.length <= 25) {
        const googleOpt = await getGoogleRoute(waypoints, {
            strategy: 'google',
            fixedStart: true, // Google TSP always fixes start
            fixedEnd: !!fixedEnd,
            travelMode
        });
        if (googleOpt.success) {
            options.push({
                name: '🧠 Google Pro',
                description: 'La máxima inteligencia de Google con tráfico real.',
                longDescription: 'Aprovecha el potente motor "Traveling Salesman" de Google Maps. Considera no solo la distancia, sino el tráfico en tiempo real, giros a la izquierda y condiciones de la vía. Es la opción más precisa disponible, limitada a 25 paradas por restricciones de la API.',
                ...googleOpt,
                type: 'optimized_google'
            });
        }
    }

    // Option 4: Original order (as entered by user)
    const original = await getGoogleRoute(waypoints, { optimize: false, travelMode });
    if (original.success) {
        options.push({
            name: '📝 Orden Original',
            description: 'Tal cual como ingresaste las direcciones.',
            longDescription: 'Mantiene el orden exacto en el que agregaste las paradas. Útil si tienes una secuencia estricta de entrega que no debe alterarse (por ejemplo, recogidas y entregas secuenciales o prioridades específicas).',
            ...original,
            type: 'original'
        });
    }

    // Option 5: Round trip (returns to start)
    if (waypoints.length >= 2 && !returnToStart) {
        // For round trip, use 2-opt for best results, then add start at end
        const sortedWaypoints = twoOptSort(waypoints, false, !!fixedStart);
        const roundTripWaypoints = [...sortedWaypoints, sortedWaypoints[0]];
        const roundTrip = await getGoogleRoute(roundTripWaypoints, { optimize: false, travelMode });
        if (roundTrip.success) {
            options.push({
                name: '🔄 Ruta circular',
                description: 'Recorre todos los puntos y regresa al punto de inicio formando un circuito cerrado.',
                ...roundTrip,
                type: 'roundtrip'
            });
        }
    }

    return { success: options.length > 0, options };
};

// Get Distance Matrix for multiple origins/destinations
export const getDistanceMatrix = async (origins, destinations, options = {}) => {
    try {
        await waitForGoogle();

        const travelModeMap = {
            'walking': window.google.maps.TravelMode.WALKING,
            'bicycle': window.google.maps.TravelMode.BICYCLING,
            'transit': window.google.maps.TravelMode.TRANSIT,
            'driving': window.google.maps.TravelMode.DRIVING
        };
        const selectedTravelMode = travelModeMap[options.travelMode] || window.google.maps.TravelMode.DRIVING;

        return new Promise((resolve) => {
            const service = new window.google.maps.DistanceMatrixService();

            service.getDistanceMatrix({
                origins: origins.map(o => new window.google.maps.LatLng(o.lat, o.lng)),
                destinations: destinations.map(d => new window.google.maps.LatLng(d.lat, d.lng)),
                travelMode: selectedTravelMode,
                ...(selectedTravelMode === window.google.maps.TravelMode.DRIVING && {
                    drivingOptions: {
                        departureTime: new Date(),
                        trafficModel: window.google.maps.TrafficModel.BEST_GUESS
                    }
                })
            }, (response, status) => {
                if (status === 'OK') {
                    resolve({ success: true, data: response });
                } else {
                    resolve({ success: false, error: status });
                }
            });
        });
    } catch (error) {
        return { success: false, error: error.message };
    }
};
