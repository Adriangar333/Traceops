/**
 * GPS Watcher Service
 * Monitors GPS status and sends alerts when disabled
 * 
 * Platform-aware:
 * - Native (iOS/Android): Uses Capacitor plugins
 * - Web: Uses navigator.geolocation
 */

const API_URL = import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host';

// Platform detection without importing Capacitor
const isNativePlatform = () => {
    try {
        // Check if running in Capacitor native shell
        return typeof window !== 'undefined' &&
            window.Capacitor &&
            window.Capacitor.isNativePlatform &&
            window.Capacitor.isNativePlatform();
    } catch {
        return false;
    }
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
        this.Geolocation = null;
        this.LocalNotifications = null;
    }

    /**
     * Load Capacitor plugins dynamically (only on native)
     */
    async loadNativePlugins() {
        if (!isNativePlatform()) {
            console.log('📍 Web platform detected, using navigator.geolocation');
            return false;
        }

        try {
            // Dynamic imports only execute on native platforms
            const [geoModule, notifModule] = await Promise.all([
                import('@capacitor/geolocation'),
                import('@capacitor/local-notifications')
            ]);
            this.Geolocation = geoModule.Geolocation;
            this.LocalNotifications = notifModule.LocalNotifications;
            console.log('✅ Capacitor plugins loaded');
            return true;
        } catch (error) {
            console.warn('Capacitor plugins not available:', error);
            return false;
        }
    }

    /**
     * Start watching GPS position
     * @param {string} technicianId - Technician ID for tracking
     * @param {string} brigadeId - Brigade ID (optional)
     */
    async start(technicianId, brigadeId = null) {
        if (this.isWatching) {
            console.log('GPS Watcher already running');
            return true;
        }

        this.technicianId = technicianId;
        this.brigadeId = brigadeId;

        // Try to load native plugins
        const hasNative = await this.loadNativePlugins();

        if (hasNative && this.Geolocation) {
            return this.startNative();
        } else {
            return this.startWeb();
        }
    }

    /**
     * Native platform implementation (Capacitor)
     */
    async startNative() {
        try {
            const permissions = await this.Geolocation.checkPermissions();
            if (permissions.location !== 'granted') {
                const request = await this.Geolocation.requestPermissions();
                if (request.location !== 'granted') {
                    this.emitAlert('GPS_PERMISSION_DENIED', 'El técnico no concedió permisos de ubicación');
                    return false;
                }
            }

            this.watchId = await this.Geolocation.watchPosition(
                { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
                (position, err) => {
                    if (err) {
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

            this.isWatching = true;
            this.checkInterval = setInterval(() => this.checkGPSStatus(), 30000);
            this.sendInterval = setInterval(() => this.sendLocationToServer(), 60000);

            // Show tracking notification on Android
            if (this.LocalNotifications) {
                this.showTrackingNotification();
            }

            console.log('✅ GPS Watcher (native) started');
            return true;
        } catch (error) {
            console.error('Failed to start native GPS:', error);
            this.emitAlert('GPS_START_FAILED', error.message);
            return false;
        }
    }

    /**
     * Web platform implementation (navigator.geolocation)
     */
    async startWeb() {
        if (!navigator.geolocation) {
            console.warn('Geolocation not supported in this browser');
            return false;
        }

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

            this.isWatching = true;
            this.sendInterval = setInterval(() => this.sendLocationToServer(), 60000);

            console.log('✅ GPS Watcher (web) started');
            return true;
        } catch (error) {
            console.error('Failed to start web GPS:', error);
            return false;
        }
    }

    /**
     * Stop watching GPS
     */
    async stop() {
        if (this.watchId !== null) {
            if (this.Geolocation) {
                await this.Geolocation.clearWatch({ id: this.watchId });
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
     * Check GPS provider status (native only)
     */
    async checkGPSStatus() {
        if (!this.Geolocation) return;

        try {
            await this.Geolocation.getCurrentPosition({
                enableHighAccuracy: false,
                timeout: 5000
            });

            if (!this.gpsEnabled) {
                this.gpsEnabled = true;
                this.emitAlert('GPS_ENABLED', 'El técnico reactivó la ubicación');
            }
        } catch (error) {
            if (error.code === 2 || error.message?.includes('disabled')) {
                if (this.gpsEnabled) {
                    this.gpsEnabled = false;
                    this.emitAlert('GPS_DISABLED', 'El técnico apagó la ubicación');
                    this.showGPSWarning();
                }
            }
        }
    }

    /**
     * Handle GPS errors
     */
    handleGPSError(error) {
        switch (error.code) {
            case 1:
                this.emitAlert('GPS_PERMISSION_DENIED', 'Permisos de ubicación denegados');
                break;
            case 2:
                if (this.gpsEnabled) {
                    this.gpsEnabled = false;
                    this.emitAlert('GPS_DISABLED', 'Ubicación no disponible');
                    this.showGPSWarning();
                }
                break;
            case 3:
                console.warn('GPS timeout, retrying...');
                break;
        }
    }

    /**
     * Send location to server
     */
    async sendLocationToServer() {
        if (!this.lastLocation || !this.technicianId) return;

        try {
            await fetch(`${API_URL}/api/scrc/tech-location`, {
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
        } catch (error) {
            console.error('Error sending location:', error);
        }
    }

    /**
     * Emit GPS alert to server
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

        this.notifyListeners('alert', { type, message });
    }

    /**
     * Show GPS warning notification (native only)
     */
    async showGPSWarning() {
        if (!this.LocalNotifications) return;

        try {
            await this.LocalNotifications.schedule({
                notifications: [{
                    id: 999,
                    title: '⚠️ GPS Desactivado',
                    body: 'Por favor active la ubicación.',
                    ongoing: true,
                    autoCancel: false
                }]
            });
        } catch (error) {
            console.error('Notification error:', error);
        }
    }

    /**
     * Show tracking notification (native only)
     */
    async showTrackingNotification() {
        if (!this.LocalNotifications) return;

        try {
            await this.LocalNotifications.schedule({
                notifications: [{
                    id: 1,
                    title: '📍 Rastreo Activo',
                    body: 'Tu ubicación está siendo registrada.',
                    ongoing: true,
                    autoCancel: false
                }]
            });
        } catch (error) {
            console.error('Notification error:', error);
        }
    }

    /**
     * Subscribe to GPS events
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

// Singleton
export const gpsWatcher = new GPSWatcherService();
export default gpsWatcher;
