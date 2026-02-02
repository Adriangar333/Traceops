/**
 * POD Service Stub
 * Proof of Delivery functions for DriverView
 */

// Capture photo using native camera
export const capturePhoto = async () => {
    return new Promise((resolve, reject) => {
        // Create a file input and trigger it
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) {
                resolve(null);
                return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
                // Return base64 without prefix
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = () => reject(new Error('Failed to read photo'));
            reader.readAsDataURL(file);
        };

        input.click();
    });
};

// Get current location
export const getCurrentLocation = () => {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(null);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
            },
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });
};

// Validate if user is within geofence radius
export const validateGeofence = (currentLocation, waypoint, maxDistance = 150) => {
    if (!currentLocation || !waypoint) {
        return { isWithinRange: false, distance: 0 };
    }

    // Calculate distance using Haversine formula
    const R = 6371000; // Earth's radius in meters
    const lat1 = currentLocation.lat * Math.PI / 180;
    const lat2 = (waypoint.lat || waypoint.coordinates?.[1]) * Math.PI / 180;
    const deltaLat = (lat2 - lat1);
    const deltaLng = ((waypoint.lng || waypoint.coordinates?.[0]) - currentLocation.lng) * Math.PI / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = Math.round(R * c);

    return {
        isWithinRange: distance <= maxDistance,
        distance
    };
};

// Submit POD to backend
export const submitPOD = async (podData) => {
    try {
        const response = await fetch('https://dashboard-backend.zvkdyr.easypanel.host/api/pod', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(podData)
        });
        return response.ok;
    } catch (err) {
        console.error('POD submission failed:', err);
        return false;
    }
};
