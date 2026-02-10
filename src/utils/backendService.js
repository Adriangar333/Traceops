const API_URL = 'https://dashboard-backend.zvkdyr.easypanel.host';

export const getDrivers = async () => {
    try {
        const res = await fetch(`${API_URL}/drivers`);
        if (!res.ok) throw new Error('Error fetching drivers');
        const data = await res.json();

        // Ensure every driver has an email for n8n/notifications
        return data.map(d => ({
            ...d,
            email: d.email || '', // Use empty string if no email, do not invent one
            phone: d.phone || ''
        }));
    } catch (error) {
        console.error('Get Drivers Error:', error);
        return [];
    }
};

export const getDriverById = async (id) => {
    try {
        const res = await fetch(`${API_URL}/drivers/${id}`);
        if (!res.ok) throw new Error('Error fetching driver');
        return await res.json();
    } catch (error) {
        console.error('Get Driver By ID Error:', error);
        return null;
    }
};

export const createDriver = async (driver) => {
    try {
        const res = await fetch(`${API_URL}/drivers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(driver)
        });
        if (!res.ok) throw new Error('Error creating driver');
        return await res.json();
    } catch (error) {
        console.error('Create Driver Error:', error);
        throw error;
    }
};

export const deleteDriver = async (id) => {
    try {
        const res = await fetch(`${API_URL}/drivers/${id}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Error deleting driver');
        return true;
    } catch (error) {
        console.error('Delete Driver Error:', error);
        throw error;
    }
};

export const assignRouteToDriver = async (driverId, routeId) => {
    try {
        const res = await fetch(`${API_URL}/drivers/${driverId}/routes`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ routeId })
        });
        if (!res.ok) throw new Error('Error assigning route');
        return true;
    } catch (error) {
        console.error('Assign Route Error:', error);
        // We don't throw here to avoid blocking the main flow if just the counter update fails
    }
};

// Create and Assign full route (Persistent)
export const createRoute = async (routeData) => {
    try {
        const res = await fetch(`${API_URL}/routes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routeData)
        });
        if (!res.ok) throw new Error('Error creating route');
        return await res.json();
    } catch (error) {
        console.error('Create Route Error:', error);
        throw error;
    }
};

// Get assigned routes for a driver
export const getDriverRoutes = async (driverId) => {
    try {
        const res = await fetch(`${API_URL}/drivers/${driverId}/routes`);
        if (!res.ok) throw new Error('Error fetching driver routes');
        return await res.json();
    } catch (error) {
        console.error('Get Driver Routes Error:', error);
        return [];
    }
};

// Assign route waypoints for geofencing
export const assignRouteWaypoints = async (routeId, driverId, waypoints) => {
    try {
        const res = await fetch(`${API_URL}/routes/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ routeId, driverId, waypoints })
        });
        if (!res.ok) throw new Error('Error assigning waypoints');
        return await res.json();
    } catch (error) {
        console.error('Assign Waypoints Error:', error);
        throw error;
    }
};

// Get driver's historical route for a date
export const getDriverHistory = async (driverId, date) => {
    try {
        const res = await fetch(`${API_URL}/drivers/${driverId}/history?date=${date}`);
        if (!res.ok) throw new Error('Error fetching history');
        return await res.json();
    } catch (error) {
        console.error('Get History Error:', error);
        return null;
    }
};

// Get route waypoint status
export const getRouteStatus = async (routeId) => {
    try {
        const res = await fetch(`${API_URL}/routes/${routeId}/status`);
        if (!res.ok) throw new Error('Error fetching route status');
        return await res.json();
    } catch (error) {
        console.error('Route Status Error:', error);
        return [];
    }
};

// --- OSRM Map Matching (Snap to Road) ---
export const optimizeRoutePath = async (geoJson) => {
    if (!geoJson || !geoJson.coordinates || geoJson.coordinates.length < 2) return null;

    try {
        const coords = geoJson.coordinates;
        const CHUNK_SIZE = 80;
        const optimizedCoords = [];

        // Simple distance filter (approx 1m)
        const filtered = coords.filter((c, i) => {
            if (i === 0) return true;
            const prev = coords[i - 1];
            const dist = Math.abs(c[0] - prev[0]) + Math.abs(c[1] - prev[1]);
            return dist > 0.00001;
        });

        for (let i = 0; i < filtered.length; i += CHUNK_SIZE) {
            const start = i === 0 ? 0 : i - 1;
            const end = Math.min(i + CHUNK_SIZE, filtered.length);
            const chunk = filtered.slice(start, end);

            if (chunk.length < 2) continue;

            const coordString = chunk.map(c => `${c[0]},${c[1]}`).join(';');
            const radiuses = chunk.map(() => 40).join(';');

            const url = `https://router.project-osrm.org/match/v1/driving/${coordString}?overview=full&geometries=geojson&radiuses=${radiuses}`;

            try {
                const res = await fetch(url);
                if (res.ok) {
                    const json = await res.json();
                    if (json.code === 'Ok' && json.matchings) {
                        json.matchings.forEach(m => optimizedCoords.push(...m.geometry.coordinates));
                    } else {
                        optimizedCoords.push(...chunk);
                    }
                } else {
                    optimizedCoords.push(...chunk);
                }
            } catch (err) {
                optimizedCoords.push(...chunk);
            }
            // Delay for rate limits
            await new Promise(r => setTimeout(r, 200));
        }

        return optimizedCoords.length > 0 ? optimizedCoords : null;

    } catch (error) {
        console.error('OSRM Optimization Error:', error);
        return null; // Return null so UI keeps using RAW
    }
};
