export const sendToN8N = async (payload) => {
    try {
        // Replace with actual N8N webhook if available, or just mock success
        // console.log("Sending to N8N:", payload);
        // const res = await fetch('YOUR_N8N_WEBHOOK_URL', { ... });

        // Mock success for now as no URL was provided in context
        return { success: true };
    } catch (error) {
        console.error("N8N Error:", error);
        return { success: false, error };
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
