const API_URL = 'https://dashboard-backend.zvkdyr.easypanel.host';

export const getDrivers = async () => {
    try {
        const res = await fetch(`${API_URL}/drivers`);
        if (!res.ok) throw new Error('Error fetching drivers');
        return await res.json();
    } catch (error) {
        console.error('Get Drivers Error:', error);
        return [];
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
