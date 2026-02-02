import { loadGoogleMaps } from './loadGoogleMaps';

export const getGoogleRoute = async (origin, destination, waypoints = []) => {
    try {
        const googleMaps = await loadGoogleMaps();
        const directionsService = new googleMaps.DirectionsService();

        const result = await directionsService.route({
            origin,
            destination,
            waypoints: waypoints.map(wp => ({
                location: wp,
                stopover: true
            })),
            optimizeWaypoints: true,
            travelMode: googleMaps.TravelMode.DRIVING,
            drivingOptions: {
                departureTime: new Date(), // Important for traffic info
                trafficModel: 'best_guess'
            }
        });

        return result;
    } catch (error) {
        console.error('Google Maps Route Error:', error);
        throw error;
    }
};

export const generateGoogleRouteOptions = async (waypoints, config = {}) => {
    if (!waypoints || waypoints.length < 2) return { success: false };

    try {
        const googleMaps = await loadGoogleMaps();
        const directionsService = new googleMaps.DirectionsService();

        // Prepare waypoints
        // If returnToStart is true, the last point is the start point (handled in Sidebar)
        // Google Directions API max waypoints is 25 (plus origin/dest)

        const origin = waypoints[0];
        const destination = waypoints[waypoints.length - 1];
        const intermediate = waypoints.slice(1, -1);

        const stops = intermediate.map(wp => ({
            location: { lat: parseFloat(wp.lat), lng: parseFloat(wp.lng) },
            stopover: true
        }));

        const result = await directionsService.route({
            origin: { lat: parseFloat(origin.lat), lng: parseFloat(origin.lng) },
            destination: { lat: parseFloat(destination.lat), lng: parseFloat(destination.lng) },
            waypoints: stops,
            optimizeWaypoints: true, // This is the key optimization feature
            travelMode: googleMaps.TravelMode.DRIVING,
            drivingOptions: {
                departureTime: new Date(),
                trafficModel: 'best_guess'
            }
        });

        if (result.routes && result.routes.length > 0) {
            // Process routes to match the expected format in Sidebar
            const formattedOptions = result.routes.map((route, index) => {
                const totalDistMeters = route.legs.reduce((acc, leg) => acc + leg.distance.value, 0);
                const totalDurationSecs = route.legs.reduce((acc, leg) => acc + (leg.duration_in_traffic ? leg.duration_in_traffic.value : leg.duration.value), 0);
                const noTrafficDurationSecs = route.legs.reduce((acc, leg) => acc + leg.duration.value, 0);

                // Format times
                const hours = Math.floor(totalDurationSecs / 3600);
                const mins = Math.floor((totalDurationSecs % 3600) / 60);
                const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;

                return {
                    id: `google_route_${index}`,
                    name: route.summary || `Ruta Vía Google ${index + 1}`,
                    description: `Vía ${route.summary}`,
                    distance: totalDistMeters,
                    distanceKm: (totalDistMeters / 1000).toFixed(1),
                    duration: totalDurationSecs,
                    durationFormatted: durationStr,
                    durationInTrafficFormatted: durationStr, // Google returns traffic duration primarily
                    coordinates: route.overview_path.map(p => [p.lng(), p.lat()]), // [lng, lat] for OSRM compatibility if needed, but Google usually renders its own
                    googleResult: result, // Store full result for rendering
                    legs: route.legs,
                    waypointOrder: route.waypoint_order
                };
            });

            return {
                success: true,
                options: formattedOptions
            };
        }

        return { success: false, error: 'No routes found' };

    } catch (error) {
        console.warn('Google Maps Optimization Failed:', error);
        return { success: false, error: error.message };
    }
};
