import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

/**
 * POD Service - Proof of Delivery
 * Handles photo capture, geofencing validation, and POD submission
 */

const API_URL = import.meta.env.VITE_BACKEND_URL || 'https://dashboard-backend.zvkdyr.easypanel.host';

/**
 * Calculate distance between two points using Haversine formula
 * @param {Object} point1 - {lat, lng}
 * @param {Object} point2 - {lat, lng}
 * @returns {number} Distance in meters
 */
export const calculateDistance = (point1, point2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (point1.lat * Math.PI) / 180;
    const φ2 = (point2.lat * Math.PI) / 180;
    const Δφ = ((point2.lat - point1.lat) * Math.PI) / 180;
    const Δλ = ((point2.lng - point1.lng) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
};

/**
 * Check if driver is within acceptable range of destination
 * @param {Object} driverLocation - {lat, lng}
 * @param {Object} destination - {lat, lng}
 * @param {number} maxDistance - Maximum allowed distance in meters (default 100m)
 * @returns {Object} { isWithinRange, distance }
 */
export const validateGeofence = (driverLocation, destination, maxDistance = 100) => {
    const distance = calculateDistance(driverLocation, destination);
    return {
        isWithinRange: distance <= maxDistance,
        distance: Math.round(distance)
    };
};

/**
 * Capture photo for POD using device camera
 * @returns {Promise<string|null>} Base64 encoded image or null on failure
 */
export const capturePhoto = async () => {
    try {
        const image = await Camera.getPhoto({
            quality: 80,
            allowEditing: false,
            resultType: CameraResultType.Base64,
            source: CameraSource.Camera,
            width: 1024,
            height: 1024,
            correctOrientation: true
        });

        return image.base64String;
    } catch (error) {
        console.error('Camera error:', error);
        // Check if user cancelled
        if (error.message?.includes('cancelled') || error.message?.includes('User cancelled')) {
            return null;
        }
        throw error;
    }
};

/**
 * Get current location using browser/device geolocation
 * @returns {Promise<{lat, lng}|null>}
 */
export const getCurrentLocation = () => {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            console.error('Geolocation not supported');
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
            (error) => {
                console.error('Geolocation error:', error);
                resolve(null);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
};

/**
 * Submit POD data to backend
 * @param {Object} podData
 * @returns {Promise<boolean>}
 */
export const submitPOD = async (podData) => {
    try {
        const response = await fetch(`${API_URL}/pod`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                routeId: podData.routeId,
                waypointIndex: podData.waypointIndex,
                driverId: podData.driverId,
                photo: podData.photo, // Base64
                signature: podData.signature, // Base64
                location: podData.location,
                timestamp: new Date().toISOString(),
                notes: podData.notes || ''
            })
        });

        if (!response.ok) {
            throw new Error('Failed to submit POD');
        }

        return true;
    } catch (error) {
        console.error('POD submission error:', error);
        return false;
    }
};

export default {
    calculateDistance,
    validateGeofence,
    capturePhoto,
    getCurrentLocation,
    submitPOD
};
