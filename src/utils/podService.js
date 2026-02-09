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
 * OPTIMIZED FOR MOBILE - Limits canvas size to prevent memory overflow
 * @param {string} base64Image - Base64 encoded image
 * @param {Object} metadata - Metadata to overlay
 * @returns {Promise<string>} Base64 encoded watermarked image
 */
/**
 * Add advanced watermark with "Data BB" style overlay
 * Includes mini-map visualization, technician details, and operation info
 */
const addWatermarkToPhoto = async (base64Image, metadata = {}) => {
    return new Promise((resolve) => {
        try {
            const img = new Image();

            img.onload = () => {
                try {
                    // MEMORY OPTIMIZATION: Limit max size to 1024px for better quality but safe
                    const MAX_SIZE = 1024;
                    let width = img.width;
                    let height = img.height;

                    if (width > MAX_SIZE || height > MAX_SIZE) {
                        if (width > height) {
                            height = Math.round((height * MAX_SIZE) / width);
                            width = MAX_SIZE;
                        } else {
                            width = Math.round((width * MAX_SIZE) / height);
                            height = MAX_SIZE;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');

                    // 1. Draw scaled image
                    ctx.drawImage(img, 0, 0, width, height);

                    // --- WATERMARK CONFIGURATION ---
                    const overlayHeight = Math.max(160, Math.round(height * 0.22)); // Taller overlay
                    const padding = Math.round(width * 0.03);
                    const footerY = height - overlayHeight;

                    // 2. Draw modern gradient background (Glassmorphism look)
                    const gradient = ctx.createLinearGradient(0, footerY, 0, height);
                    gradient.addColorStop(0, 'rgba(15, 23, 42, 0.85)'); // Slate-900 transparent
                    gradient.addColorStop(1, 'rgba(15, 23, 42, 0.98)'); // Slate-900 solid
                    ctx.fillStyle = gradient;
                    ctx.fillRect(0, footerY, width, overlayHeight);

                    // Add top border line for accent
                    ctx.fillStyle = '#3B82F6'; // Blue-500
                    ctx.fillRect(0, footerY, width, 4);

                    // --- 3. DRAW MINI-MAP VISUALIZATION (Left Side) ---
                    const mapSize = overlayHeight - (padding * 2);
                    const mapX = padding;
                    const mapY = footerY + padding;

                    // Draw Map Background
                    ctx.fillStyle = '#1e293b'; // Slate-800
                    ctx.fillRect(mapX, mapY, mapSize, mapSize);

                    // Draw Grid Lines (Simulating map)
                    ctx.strokeStyle = '#334155'; // Slate-700
                    ctx.lineWidth = 1;
                    const gridSize = mapSize / 4;
                    for (let i = 1; i < 4; i++) {
                        // Vertical
                        ctx.beginPath();
                        ctx.moveTo(mapX + (gridSize * i), mapY);
                        ctx.lineTo(mapX + (gridSize * i), mapY + mapSize);
                        ctx.stroke();
                        // Horizontal
                        ctx.beginPath();
                        ctx.moveTo(mapX, mapY + (gridSize * i));
                        ctx.lineTo(mapX + mapSize, mapY + (gridSize * i));
                        ctx.stroke();
                    }

                    // Draw "GPS" Label on Map
                    ctx.fillStyle = 'rgba(255,255,255,0.5)';
                    ctx.font = `bold ${Math.round(mapSize * 0.15)}px monospace`;
                    ctx.textAlign = 'right';
                    ctx.fillText('GPS', mapX + mapSize - 4, mapY + mapSize - 4);

                    // Draw Pin Point (Red Dot with Pulse effect)
                    const centerX = mapX + (mapSize / 2);
                    const centerY = mapY + (mapSize / 2);

                    // Pulse ring
                    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)'; // Red-500
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, mapSize * 0.15, 0, Math.PI * 2);
                    ctx.stroke();

                    // Center Dot
                    ctx.fillStyle = '#ef4444'; // Red-500
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, mapSize * 0.08, 0, Math.PI * 2);
                    ctx.fill();

                    // --- 4. DRAW TEXT DATA ---
                    const textX = mapX + mapSize + padding;
                    const textWidth = width - textX - padding;

                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';

                    // Prepare fonts
                    const titleFont = `bold ${Math.round(width * 0.035)}px sans-serif`;
                    const dataFont = `bold ${Math.round(width * 0.025)}px monospace`; // Monospace for data looks techy
                    const labelFont = `normal ${Math.round(width * 0.02)}px sans-serif`;

                    let currentY = mapY;
                    const lineHeight = Math.round(width * 0.045);

                    // -- ROW 1: OPERATION TYPE (Big Header) --
                    ctx.fillStyle = '#fbbf24'; // Amber-400 (Highlight)
                    ctx.font = titleFont;
                    const opType = (metadata.operationType || 'OPERACIÓN').toUpperCase();
                    ctx.fillText(opType, textX, currentY);
                    currentY += lineHeight * 1.2;

                    // -- ROW 2: TECHNICIAN --
                    ctx.fillStyle = '#94a3b8'; // Slate-400 (Label)
                    ctx.font = labelFont;
                    ctx.fillText('TÉCNICO:', textX, currentY);

                    ctx.fillStyle = '#ffffff'; // White (Value)
                    ctx.font = dataFont;
                    const techName = (metadata.driverName || 'N/A').toUpperCase().substring(0, 25);
                    const labelWidth = ctx.measureText('TÉCNICO: ').width;
                    ctx.fillText(techName, textX + labelWidth + 10, currentY - 2); // Align nicely
                    currentY += lineHeight;

                    // -- ROW 3: DATE & TIME --
                    const now = new Date();
                    const dateStr = now.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
                    const timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

                    ctx.fillStyle = '#94a3b8';
                    ctx.font = labelFont;
                    ctx.fillText('FECHA:', textX, currentY);

                    ctx.fillStyle = '#ffffff';
                    ctx.font = dataFont;
                    const dateLabelWidth = ctx.measureText('FECHA: ').width;
                    ctx.fillText(`${dateStr} - ${timeStr}`, textX + dateLabelWidth + 10, currentY - 2);
                    currentY += lineHeight;

                    // -- ROW 4: ADDRESS (Wrapped) --
                    ctx.fillStyle = '#94a3b8';
                    ctx.font = labelFont;
                    ctx.fillText('UBICACIÓN:', textX, currentY);

                    ctx.fillStyle = '#e2e8f0'; // Slight off-white
                    ctx.font = `normal ${Math.round(width * 0.022)}px sans-serif`;

                    let address = (metadata.address || '').substring(0, 60);
                    const addrY = currentY + (lineHeight * 0.8);
                    ctx.fillText(address, textX, addrY);
                    currentY += lineHeight * 1.8;

                    // -- ROW 5: COORDINATES (Small at bottom) --
                    if (metadata.location) {
                        ctx.fillStyle = '#64748b'; // Slate-500
                        ctx.font = `italic ${Math.round(width * 0.02)}px monospace`;
                        const coords = `LAT: ${metadata.location.lat.toFixed(6)}  LNG: ${metadata.location.lng.toFixed(6)}`;
                        ctx.fillText(coords, textX, currentY);
                    }

                    // Convert to base64
                    const watermarkedBase64 = canvas.toDataURL('image/jpeg', 0.80).split(',')[1];

                    // Cleanup
                    canvas.width = 0;
                    canvas.height = 0;

                    resolve(watermarkedBase64);
                } catch (canvasError) {
                    console.error('Canvas watermark error:', canvasError);
                    resolve(base64Image); // Return original on error
                }
            };

            img.onerror = () => {
                resolve(base64Image);
            };

            img.src = `data:image/jpeg;base64,${base64Image}`;
        } catch (outerError) {
            console.error('Watermark outer error:', outerError);
            resolve(base64Image);
        }
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
