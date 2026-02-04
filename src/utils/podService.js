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
 * Add watermark with metadata to a photo
 * @param {string} base64Image - Base64 encoded image
 * @param {Object} metadata - Metadata to overlay
 * @returns {Promise<string>} Base64 encoded watermarked image
 */
const addWatermarkToPhoto = async (base64Image, metadata = {}) => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');

            // Draw original image
            ctx.drawImage(img, 0, 0);

            // Semi-transparent overlay at bottom
            const overlayHeight = 120;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(0, canvas.height - overlayHeight, canvas.width, overlayHeight);

            // Text settings
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px Arial, sans-serif';
            ctx.textBaseline = 'top';

            const padding = 10;
            let y = canvas.height - overlayHeight + padding;
            const lineHeight = 18;

            // Format date/time
            const now = new Date();
            const dateStr = now.toLocaleDateString('es-CO', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
            const timeStr = now.toLocaleTimeString('es-CO', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            // Line 1: Date & Time
            ctx.fillText(`📅 ${dateStr} ${timeStr}`, padding, y);
            y += lineHeight;

            // Line 2: Technician name
            if (metadata.driverName) {
                ctx.fillText(`👷 ${metadata.driverName}`, padding, y);
                y += lineHeight;
            }

            // Line 3: Operation
            if (metadata.operationType) {
                ctx.fillText(`📦 ${metadata.operationType}`, padding, y);
                y += lineHeight;
            }

            // Line 4: Address (truncate if too long)
            if (metadata.address) {
                const maxWidth = canvas.width - (padding * 2);
                let address = metadata.address;
                if (ctx.measureText(address).width > maxWidth) {
                    while (ctx.measureText(address + '...').width > maxWidth && address.length > 0) {
                        address = address.slice(0, -1);
                    }
                    address += '...';
                }
                ctx.fillText(`📍 ${address}`, padding, y);
                y += lineHeight;
            }

            // Line 5: Coordinates
            if (metadata.location) {
                ctx.fillText(`🌐 ${metadata.location.lat.toFixed(6)}, ${metadata.location.lng.toFixed(6)}`, padding, y);
            }

            // Mini map placeholder on right side (optional visual cue)
            const mapSize = 80;
            const mapX = canvas.width - mapSize - padding;
            const mapY = canvas.height - overlayHeight + padding;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(mapX, mapY, mapSize, mapSize);
            ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
            ctx.fillRect(mapX, mapY, mapSize, mapSize);

            // Draw a simple marker in center
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(mapX + mapSize / 2, mapY + mapSize / 2, 6, 0, 2 * Math.PI);
            ctx.fill();

            // Convert back to base64
            const watermarkedBase64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
            resolve(watermarkedBase64);
        };

        img.onerror = () => {
            console.error('Failed to load image for watermarking');
            resolve(base64Image); // Return original if watermarking fails
        };

        img.src = `data:image/jpeg;base64,${base64Image}`;
    });
};

/**
 * Capture photo for POD using device camera
 * @param {Object} metadata - Optional metadata to add as watermark
 * @returns {Promise<string|null>} Base64 encoded image or null on failure
 */
export const capturePhoto = async (metadata = null) => {
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

        let photoBase64 = image.base64String;

        // Add watermark if metadata provided
        if (metadata) {
            photoBase64 = await addWatermarkToPhoto(photoBase64, metadata);
        }

        return photoBase64;
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
