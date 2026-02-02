export const sendToN8N = async (payload) => {
    try {
        const WEBHOOK_URL = 'https://n8n-n8n.zvkdyr.easypanel.host/webhook/proyecto-rutas';

        console.log("Sending to N8N:", payload);

        const res = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            throw new Error(`n8n responded with status: ${res.status}`);
        }

        const data = await res.json().catch(() => ({})); // Handle empty responses
        return { success: true, data };
    } catch (error) {
        console.error("N8N Error:", error);
        return { success: false, error: error.message };
    }
};

export const transformCoordinates = (point) => {
    if (!point) return null;
    return {
        lat: point.lat,
        lng: point.lng,
        address: point.address || ''
    };
};

export const notifyDriverAssignment = async (assignment) => {
    // console.log("Notifying driver:", assignment);
    return true;
};
