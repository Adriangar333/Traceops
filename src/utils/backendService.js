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
