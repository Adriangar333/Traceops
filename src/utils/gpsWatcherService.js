/**
 * GPS Watcher Service
 * Monitors GPS status and sends alerts when disabled
 * Uses Capacitor Geolocation for cross-platform support
 * 
 * NOTE: This service only works on native platforms (iOS/Android).
 * On web, it provides a no-op implementation for build compatibility.
 */

import { Capacitor } from '@capacitor/core';

const API_URL = import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host';

// Lazy load Capacitor plugins only on native platforms
let Geolocation = null;
let LocalNotifications = null;

const loadCapacitorPlugins = async () => {
    if (Capacitor.isNativePlatform()) {
        try {
            const geoModule = await import('@capacitor/geolocation');
            Geolocation = geoModule.Geolocation;

            const notifModule = await import('@capacitor/local-notifications');
            LocalNotifications = notifModule.LocalNotifications;
            return true;
        } catch (e) {
            console.warn('Capacitor plugins not available:', e);
            return false;
        }
    }
    return false;
};

class GPSWatcherService {
    constructor() {
        this.watchId = null;
        this.technicianId = null;
        this.brigadeId = null;
        this.lastLocation = null;
        this.isWatching = false;
        this.gpsEnabled = true;
        this.checkInterval = null;
        this.sendInterval = null;
        this.listeners = [];
        this.pluginsLoaded = false;
    }

    /**
     * Start watching GPS position
     * @param {string} technicianId - Technician ID for tracking
     * @param {string} brigadeId - Brigade ID (optional)
     */
    async start(technicianId, brigadeId = null) {
        if (this.isWatching) {
            console.log('GPS Watcher already running');
            return;
        }

        // Load plugins if not already loaded
        if (!this.pluginsLoaded) {
            this.pluginsLoaded = await loadCapacitorPlugins();
        }

        // If not on native platform, use web fallback
        if (!Capacitor.isNativePlatform() || !Geolocation) {
            console.log('📍 GPS Watcher: Using web geolocation fallback');
            return this.startWebFallback(technicianId, brigadeId);
        }

        this.technicianId = technicianId;
        this.brigadeId = brigadeId;
        this.isWatching = true;

        try {
            // Request permissions first
            const permissions = await Geolocation.checkPermissions();
            if (permissions.location !== 'granted') {
                const request = await Geolocation.requestPermissions();
                if (request.location !== 'granted') {
                    this.emitAlert('GPS_PERMISSION_DENIED', 'El técnico no concedió permisos de ubicación');
                    return false;
                }
            }

            // Start continuous position watch (high accuracy for field work)
            this.watchId = await Geolocation.watchPosition(
                {
                    enableHighAccuracy: true,
                    timeout: 30000,
                    maximumAge: 0
                },
                (position, err) => {
                    if (err) {
                        console.error('GPS Error:', err);
                        this.handleGPSError(err);
                        return;
                    }
                    if (position) {
                        this.gpsEnabled = true;
                        this.lastLocation = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude,
                            accuracy: position.coords.accuracy,
                            timestamp: new Date().toISOString()
                        };
                        this.notifyListeners('position', this.lastLocation);
                    }
                }
            );

            // Check GPS provider status every 30 seconds
            this.checkInterval = setInterval(() => this.checkGPSStatus(), 30000);

            // Send location to server every 60 seconds
            this.sendInterval = setInterval(() => this.sendLocationToServer(), 60000);

            // Show persistent notification on Android
            if (Capacitor.getPlatform() === 'android' && LocalNotifications) {
                await this.showTrackingNotification();
            }

            console.log('✅ GPS Watcher started for technician:', technicianId);
            return true;

        } catch (error) {
            console.error('Failed to start GPS watcher:', error);
            this.emitAlert('GPS_START_FAILED', error.message);
            return false;
        }
    }

    /**
     * Web fallback using navigator.geolocation
     */
    async startWebFallback(technicianId, brigadeId) {
        if (!navigator.geolocation) {
            console.warn('Geolocation not supported in this browser');
            return false;
        }

        this.technicianId = technicianId;
        this.brigadeId = brigadeId;
        this.isWatching = true;

        try {
            this.watchId = navigator.geolocation.watchPosition(
                (position) => {
                    this.gpsEnabled = true;
                    this.lastLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: new Date().toISOString()
                    };
                    this.notifyListeners('position', this.lastLocation);
                },
                (error) => {
                    console.error('Web GPS Error:', error);
                    if (error.code === error.PERMISSION_DENIED) {
                        this.emitAlert('GPS_PERMISSION_DENIED', 'Permisos de ubicación denegados');
                    }
                },
                { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
            );

            // Send location to server every 60 seconds
            this.sendInterval = setInterval(() => this.sendLocationToServer(), 60000);

            console.log('✅ GPS Watcher (web) started for technician:', technicianId);
            return true;
        } catch (error) {
            console.error('Failed to start web GPS watcher:', error);
            return false;
        }
    }

    /**
     * Stop watching GPS
     */
    async stop() {
        if (this.watchId !== null) {
            if (Capacitor.isNativePlatform() && Geolocation) {
                await Geolocation.clearWatch({ id: this.watchId });
            } else if (navigator.geolocation) {
                navigator.geolocation.clearWatch(this.watchId);
            }
            this.watchId = null;
        }

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        if (this.sendInterval) {
            clearInterval(this.sendInterval);
            this.sendInterval = null;
        }

        this.isWatching = false;
        console.log('🛑 GPS Watcher stopped');
    }

    /**
     * Check if GPS provider is enabled
     */
    async checkGPSStatus() {
        if (!Geolocation) return;

        try {
            // Try to get a single position - will fail if GPS is off
            const position = await Geolocation.getCurrentPosition({
                enableHighAccuracy: false,
                timeout: 5000
            });

            if (!this.gpsEnabled) {
                // GPS was off, now it's on
                this.gpsEnabled = true;
                this.emitAlert('GPS_ENABLED', 'El técnico reactivó la ubicación');
            }
        } catch (error) {
            // GPS might be disabled
            if (error.code === 2 || error.message?.includes('disabled')) {
                if (this.gpsEnabled) {
                    // GPS just got disabled!
                    this.gpsEnabled = false;
                    this.emitAlert('GPS_DISABLED', 'El técnico apagó la ubicación');

                    // Show local warning to technician
                    this.showGPSWarning();
                }
            }
        }
    }

    /**
     * Handle GPS errors from watchPosition
     */
    handleGPSError(error) {
        switch (error.code) {
            case 1: // PERMISSION_DENIED
                this.emitAlert('GPS_PERMISSION_DENIED', 'Permisos de ubicación denegados');
                break;
            case 2: // POSITION_UNAVAILABLE (GPS off or no signal)
                if (this.gpsEnabled) {
                    this.gpsEnabled = false;
                    this.emitAlert('GPS_DISABLED', 'Ubicación no disponible - GPS apagado');
                    this.showGPSWarning();
                }
                break;
            case 3: // TIMEOUT
                console.warn('GPS timeout, retrying...');
                break;
        }
    }

    /**
     * Send current location to server
     */
    async sendLocationToServer() {
        if (!this.lastLocation || !this.technicianId) return;

        try {
            const response = await fetch(`${API_URL}/api/scrc/tech-location`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    technician_id: this.technicianId,
                    brigade_id: this.brigadeId,
                    latitude: this.lastLocation.lat,
                    longitude: this.lastLocation.lng,
                    accuracy: this.lastLocation.accuracy,
                    gps_enabled: this.gpsEnabled
                })
            });

            if (!response.ok) {
                console.error('Failed to send location:', response.status);
            }
        } catch (error) {
            console.error('Error sending location:', error);
        }
    }

    /**
     * Emit alert to server about GPS status change
     */
    async emitAlert(type, message) {
        console.warn(`🚨 GPS Alert: ${type} - ${message}`);

        try {
            await fetch(`${API_URL}/api/scrc/tech-location`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    technician_id: this.technicianId,
                    brigade_id: this.brigadeId,
                    latitude: this.lastLocation?.lat || 0,
                    longitude: this.lastLocation?.lng || 0,
                    alert_type: type,
                    alert_message: message,
                    gps_enabled: this.gpsEnabled
                })
            });
        } catch (error) {
            console.error('Failed to send alert:', error);
        }

        // Notify local listeners
        this.notifyListeners('alert', { type, message });
    }

    /**
     * Show warning notification to technician when GPS is off
     */
    async showGPSWarning() {
        if (!LocalNotifications) return;

        try {
            await LocalNotifications.schedule({
                notifications: [{
                    id: 999,
                    title: '⚠️ GPS Desactivado',
                    body: 'Por favor active la ubicación para continuar con el registro de rutas.',
                    largeBody: 'El sistema requiere ubicación activa. Si no reactiva el GPS, se notificará al supervisor.',
                    ongoing: true,
                    autoCancel: false
                }]
            });
        } catch (error) {
            console.error('Failed to show notification:', error);
        }
    }

    /**
     * Show persistent tracking notification (Android foreground service workaround)
     */
    async showTrackingNotification() {
        if (!LocalNotifications) return;

        try {
            await LocalNotifications.schedule({
                notifications: [{
                    id: 1,
                    title: '📍 Rastreo Activo',
                    body: 'Tu ubicación está siendo registrada.',
                    ongoing: true,
                    autoCancel: false
                }]
            });
        } catch (error) {
            console.error('Failed to show tracking notification:', error);
        }
    }

    /**
     * Subscribe to GPS events
     * @param {Function} callback - Called with (eventType, data)
     */
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    notifyListeners(eventType, data) {
        this.listeners.forEach(cb => cb(eventType, data));
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            isWatching: this.isWatching,
            gpsEnabled: this.gpsEnabled,
            lastLocation: this.lastLocation,
            technicianId: this.technicianId
        };
    }
}

// Singleton instance
export const gpsWatcher = new GPSWatcherService();
export default gpsWatcher;
