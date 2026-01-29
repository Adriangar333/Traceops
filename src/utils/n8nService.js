// n8n Service - Automatización de comunicación y tareas administrativas
// Sends data to n8n webhook in the format expected by the workflow

const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || 'https://n8n-n8n.zvkdyr.easypanel.host/webhook/proyecto-rutas';

// Transform coordinates to string format
export const transformCoordinates = (lngLat) => {
    let lng, lat;

    if (Array.isArray(lngLat)) {
        [lng, lat] = lngLat;
    } else {
        lng = lngLat.lng;
        lat = lngLat.lat;
    }

    const latStr = lat.toFixed(10);
    const lngStr = lng.toFixed(10);

    return `${latStr},${lngStr}`;
};

// Send route assignment to n8n (uses GET with query params as expected by workflow)
export const sendToN8N = async (payload) => {
    try {
        // The n8n workflow expects data in query.data as a JSON string
        const dataString = encodeURIComponent(JSON.stringify(payload));
        const url = `${N8N_WEBHOOK_URL}?data=${dataString}`;

        console.log('Sending to n8n:', url);

        const response = await fetch(url, {
            method: 'GET'
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.status} ${response.statusText}`);
        }

        const responseText = await response.text();
        console.log('n8n response:', responseText);
        return { success: true, data: responseText };
    } catch (error) {
        console.error('n8n webhook error:', error);
        return { success: false, error: error.message };
    }
};

// Alternative POST method (for future workflow updates)
export const sendToN8NPOST = async (action, payload) => {
    try {
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action,
                timestamp: new Date().toISOString(),
                ...payload
            })
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.status} ${response.statusText}`);
        }

        const responseText = await response.text();
        return { success: true, data: responseText };
    } catch (error) {
        console.error(`n8n webhook error (${action}):`, error);
        return { success: false, error: error.message };
    }
};

// Notify driver about new route assignment
export const notifyDriverAssignment = async (driver, route, waypoints) => {
    try {
        // ALWAYS use the production URL for notifications to ensure drivers can access it
        const baseUrl = 'https://dashboard-frontend.zvkdyr.easypanel.host';
        const driverLink = `${baseUrl}/driver/${route.id}`;

        // Simple message format
        const message = `
          Hola ${driver.name},
          Se te ha asignado una nueva ruta: ${route.name}
          
          Detalles:
          - Distancia: ${route.distanceKm || 'N/A'} km
          - Paradas: ${waypoints.length}
          
          👉 Ver ruta completa y gestionar entregas aquí:
          ${driverLink}
        `;

        // Only send the text content for now (simpler for n8n to handle)
        // or struct if your n8n expects it. Let's send a structured payload for the new workflow.
        const payload = {
            type: 'notification',
            agent_email: driver.email,
            agent_phone: driver.phone,
            message: message,
            driver_link: driverLink,
            route_name: route.name,
            waypoints_count: waypoints.length
        };

        console.log('Notifying driver via n8n:', payload);
        // We use the same generic webhook for now, passing this special payload
        // The n8n workflow might need adjustment to handle 'type: notification'
        return sendToN8N(payload);
    } catch (error) {
        console.error('Error notifying driver:', error);
        return { success: false, error: error.message };
    }
};

// Report route status change
export const reportRouteStatus = async (routeId, driverId, status, location = null) => {
    return sendToN8NPOST('route_status', {
        route_id: routeId,
        driver_id: driverId,
        status: status,
        location: location ? transformCoordinates(location) : null,
        reported_at: new Date().toISOString()
    });
};

// Report delivery completed
export const reportDeliveryCompleted = async (routeId, driverId, stopIndex, address, notes = '') => {
    return sendToN8NPOST('delivery_completed', {
        route_id: routeId,
        driver_id: driverId,
        stop_index: stopIndex,
        address: address,
        notes: notes,
        completed_at: new Date().toISOString()
    });
};
