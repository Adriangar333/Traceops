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
                    // MEMORY OPTIMIZATION: Limit max size to 1200px for better quality
                    const MAX_SIZE = 1200;
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

                    // --- WATERMARK CONFIGURATION (BIGGER - 30% of image) ---
                    const overlayHeight = Math.max(220, Math.round(height * 0.32));
                    const padding = Math.round(width * 0.025);
                    const footerY = height - overlayHeight;

                    // 2. Draw solid dark background with gradient top
                    const gradient = ctx.createLinearGradient(0, footerY, 0, height);
                    gradient.addColorStop(0, 'rgba(2, 6, 23, 0.92)');
                    gradient.addColorStop(0.15, 'rgba(2, 6, 23, 0.98)');
                    gradient.addColorStop(1, 'rgba(2, 6, 23, 1)');
                    ctx.fillStyle = gradient;
                    ctx.fillRect(0, footerY, width, overlayHeight);

                    // Top accent line (gradient blue-green)
                    const accentGrad = ctx.createLinearGradient(0, 0, width, 0);
                    accentGrad.addColorStop(0, '#10b981');
                    accentGrad.addColorStop(0.5, '#3b82f6');
                    accentGrad.addColorStop(1, '#8b5cf6');
                    ctx.fillStyle = accentGrad;
                    ctx.fillRect(0, footerY, width, 5);

                    // --- 3. LEFT COLUMN: GPS COORDINATES (PROMINENT) ---
                    const colWidth = (width - padding * 3) / 2;
                    const leftX = padding;
                    const rightX = padding + colWidth + padding;
                    let leftY = footerY + padding + 10;
                    let rightY = footerY + padding + 10;

                    // GPS HEADER with icon
                    ctx.fillStyle = '#10b981';
                    ctx.font = `bold ${Math.round(width * 0.028)}px monospace`;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    ctx.fillText('📍 COORDENADAS GPS', leftX, leftY);
                    leftY += Math.round(width * 0.045);

                    // LAT value (BIG)
                    ctx.fillStyle = '#94a3b8';
                    ctx.font = `normal ${Math.round(width * 0.022)}px sans-serif`;
                    ctx.fillText('LATITUD:', leftX, leftY);
                    leftY += Math.round(width * 0.032);

                    const lat = metadata.location?.lat ?? 0;
                    ctx.fillStyle = '#ffffff';
                    ctx.font = `bold ${Math.round(width * 0.038)}px monospace`;
                    ctx.fillText(lat.toFixed(6), leftX, leftY);
                    leftY += Math.round(width * 0.055);

                    // LNG value (BIG)
                    ctx.fillStyle = '#94a3b8';
                    ctx.font = `normal ${Math.round(width * 0.022)}px sans-serif`;
                    ctx.fillText('LONGITUD:', leftX, leftY);
                    leftY += Math.round(width * 0.032);

                    const lng = metadata.location?.lng ?? 0;
                    ctx.fillStyle = '#ffffff';
                    ctx.font = `bold ${Math.round(width * 0.038)}px monospace`;
                    ctx.fillText(lng.toFixed(6), leftX, leftY);
                    leftY += Math.round(width * 0.055);

                    // "VERIFICADO GPS" badge
                    const badgeText = '✓ VERIFICADO GPS';
                    ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
                    const badgeW = Math.round(width * 0.28);
                    const badgeH = Math.round(width * 0.04);
                    ctx.fillRect(leftX, leftY, badgeW, badgeH);
                    ctx.strokeStyle = '#10b981';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(leftX, leftY, badgeW, badgeH);
                    ctx.fillStyle = '#10b981';
                    ctx.font = `bold ${Math.round(width * 0.022)}px sans-serif`;
                    ctx.fillText(badgeText, leftX + 8, leftY + 6);

                    // --- 4. RIGHT COLUMN: JOB DETAILS ---
                    // OPERATION TYPE (Header)
                    const opType = (metadata.operationType || 'OPERACIÓN').toUpperCase();
                    ctx.fillStyle = '#fbbf24';
                    ctx.font = `bold ${Math.round(width * 0.032)}px sans-serif`;
                    ctx.fillText(opType, rightX, rightY);
                    rightY += Math.round(width * 0.048);

                    // TECHNICIAN
                    ctx.fillStyle = '#64748b';
                    ctx.font = `normal ${Math.round(width * 0.018)}px sans-serif`;
                    ctx.fillText('TÉCNICO', rightX, rightY);
                    rightY += Math.round(width * 0.028);
                    ctx.fillStyle = '#f1f5f9';
                    ctx.font = `bold ${Math.round(width * 0.024)}px sans-serif`;
                    const techName = (metadata.driverName || 'N/A').toUpperCase().substring(0, 28);
                    ctx.fillText(techName, rightX, rightY);
                    rightY += Math.round(width * 0.04);

                    // NIC / ORDER NUMBER (if available)
                    if (metadata.nic || metadata.orderNumber) {
                        ctx.fillStyle = '#64748b';
                        ctx.font = `normal ${Math.round(width * 0.018)}px sans-serif`;
                        ctx.fillText('NIC / ORDEN', rightX, rightY);
                        rightY += Math.round(width * 0.028);
                        ctx.fillStyle = '#60a5fa';
                        ctx.font = `bold ${Math.round(width * 0.024)}px monospace`;
                        const nicOrder = metadata.nic || metadata.orderNumber || '';
                        ctx.fillText(nicOrder.toString().substring(0, 20), rightX, rightY);
                        rightY += Math.round(width * 0.04);
                    }

                    // ADDRESS
                    ctx.fillStyle = '#64748b';
                    ctx.font = `normal ${Math.round(width * 0.018)}px sans-serif`;
                    ctx.fillText('DIRECCIÓN', rightX, rightY);
                    rightY += Math.round(width * 0.028);
                    ctx.fillStyle = '#cbd5e1';
                    ctx.font = `normal ${Math.round(width * 0.02)}px sans-serif`;
                    const address = (metadata.address || 'Sin dirección').substring(0, 45);
                    ctx.fillText(address, rightX, rightY);
                    rightY += Math.round(width * 0.035);

                    // --- 5. BOTTOM BAR: DATE & TIME (Full Width) ---
                    const now = new Date();
                    const dateStr = now.toLocaleDateString('es-CO', {
                        weekday: 'short',
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                    }).toUpperCase();
                    const timeStr = now.toLocaleTimeString('es-CO', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                    });

                    const bottomBarY = height - padding - Math.round(width * 0.035);
                    ctx.fillStyle = '#475569';
                    ctx.font = `normal ${Math.round(width * 0.022)}px monospace`;
                    ctx.textAlign = 'left';
                    ctx.fillText(`📅 ${dateStr}`, leftX, bottomBarY);
                    ctx.textAlign = 'right';
                    ctx.fillText(`🕐 ${timeStr}`, width - padding, bottomBarY);

                    // Convert to base64 (higher quality)
                    const watermarkedBase64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

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
 * Check if running in a native Capacitor app
 */
const isNativeApp = () => {
    return window.Capacitor?.isNativePlatform?.() || false;
};

/**
 * Capture photo using native browser input (fallback for web)
 * More reliable than PWA elements on desktop browsers
 */
const capturePhotoWeb = (metadata) => {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment'; // Use back camera on mobile

        input.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) {
                resolve(null);
                return;
            }

            try {
                // Convert file to base64
                const reader = new FileReader();
                reader.onload = async () => {
                    let base64 = reader.result.split(',')[1];

                    // Add watermark if metadata provided
                    if (metadata) {
                        console.log('📷 Adding watermark...');
                        base64 = await addWatermarkToPhoto(base64, metadata);
                    }

                    resolve(base64);
                };
                reader.onerror = () => reject(new Error('Failed to read image'));
                reader.readAsDataURL(file);
            } catch (err) {
                reject(err);
            }
        };

        input.oncancel = () => resolve(null);

        // Trigger file picker
        input.click();
    });
};

/**
 * Capture photo for POD using device camera
 * Uses Capacitor Camera for native apps, browser input for web
 * @param {Object} metadata - Optional metadata to add as watermark
 * @returns {Promise<string|null>} Base64 encoded image or null on failure
 */
export const capturePhoto = async (metadata = null) => {
    console.log('📷 Starting camera capture...', isNativeApp() ? '(Native)' : '(Web)');

    // Use native browser input for web - more reliable than PWA elements
    if (!isNativeApp()) {
        try {
            return await capturePhotoWeb(metadata);
        } catch (error) {
            console.error('Web camera error:', error);
            throw error;
        }
    }

    // Native app - use Capacitor Camera
    try {
        const image = await Camera.getPhoto({
            quality: 80,
            allowEditing: false,
            resultType: CameraResultType.Base64,
            source: CameraSource.Camera,
            width: 1024,
            height: 1024,
            correctOrientation: true,
            promptLabelHeader: 'Foto de entrega',
            promptLabelCancel: 'Cancelar',
            promptLabelPhoto: 'Galería',
            promptLabelPicture: 'Tomar foto'
        });

        console.log('📷 Photo captured successfully');
        let photoBase64 = image.base64String;

        // Add watermark if metadata provided
        if (metadata) {
            console.log('📷 Adding watermark...');
            photoBase64 = await addWatermarkToPhoto(photoBase64, metadata);
        }

        return photoBase64;
    } catch (error) {
        console.error('Camera error:', error);
        // Check if user cancelled
        if (error.message?.includes('cancelled') || error.message?.includes('User cancelled')) {
            console.log('📷 User cancelled camera');
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
                notes: podData.notes || '',
                technicianName: podData.technicianName
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
