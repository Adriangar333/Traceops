import { registerPlugin } from '@capacitor/core';
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

// Check if running on native platform
const isNative = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNative;

// This service handles both native background geolocation AND web fallback
export const TrackingService = {
    watcherId: null,
    webWatchId: null,

    // Check if we have permissions
    async checkPermissions() {
        if (isNative) {
            try {
                const status = await BackgroundGeolocation.checkPermissions();
                return status;
            } catch (error) {
                console.error('Error checking permissions:', error);
                return { location: 'prompt' };
            }
        } else {
            // Web: check via navigator.permissions if available
            if (navigator.permissions && navigator.permissions.query) {
                try {
                    const result = await navigator.permissions.query({ name: 'geolocation' });
                    return { location: result.state };
                } catch {
                    return { location: 'prompt' };
                }
            }
            return { location: 'prompt' };
        }
    },

    // Request permissions if needed
    async requestPermissions() {
        if (isNative) {
            try {
                const status = await BackgroundGeolocation.requestPermissions();
                return status;
            } catch (error) {
                console.error('Error requesting permissions:', error);
                return null;
            }
        } else {
            // Web: just return prompt (permissions are requested on first use)
            return { location: 'prompt' };
        }
    },

    // Start tracking
    // callback: (location, error) => void
    async startTracking(callback) {
        // Prevent multiple watchers
        if (this.watcherId || this.webWatchId) {
            console.warn('Tracking already active');
            return true;
        }

        if (isNative) {
            // NATIVE: Use BackgroundGeolocation plugin
            try {
                this.watcherId = await BackgroundGeolocation.addWatcher(
                    {
                        backgroundMessage: "Rastreando tu ubicación para el despacho.",
                        backgroundTitle: "Traceops",
                        requestPermissions: true,
                        stale: false,
                        distanceFilter: 10
                    },
                    (location, error) => {
                        if (error) {
                            if (error.code === "NOT_AUTHORIZED") {
                                if (window.confirm("Esta app necesita usar tu ubicación. ¿Ir a configuraciones?")) {
                                    BackgroundGeolocation.openSettings();
                                }
                            }
                            console.error('Location error:', error);
                            if (callback) callback(null, error);
                            return;
                        }
                        console.log('Native location update:', location);
                        if (callback) callback(location, null);
                    }
                );
                console.log('Native tracking started with watcher ID:', this.watcherId);
                return true;
            } catch (err) {
                console.error('Failed to start native tracking:', err);
                return false;
            }
        } else {
            // WEB: Use standard Geolocation API (foreground only)
            if (!navigator.geolocation) {
                console.error('Geolocation not supported');
                if (callback) callback(null, { message: 'Geolocation not supported' });
                return false;
            }

            try {
                this.webWatchId = navigator.geolocation.watchPosition(
                    (position) => {
                        const location = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            accuracy: position.coords.accuracy,
                            speed: position.coords.speed,
                            heading: position.coords.heading,
                            time: position.timestamp
                        };
                        console.log('Web location update:', location);
                        if (callback) callback(location, null);
                    },
                    (error) => {
                        console.error('Web geolocation error:', error);
                        if (callback) callback(null, error);
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 30000,
                        maximumAge: 5000
                    }
                );
                console.log('Web tracking started with watch ID:', this.webWatchId);
                return true;
            } catch (err) {
                console.error('Failed to start web tracking:', err);
                return false;
            }
        }
    },

    // Stop tracking
    async stopTracking() {
        if (isNative && this.watcherId) {
            try {
                await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
                console.log('Native tracking stopped');
                this.watcherId = null;
                return true;
            } catch (err) {
                console.error('Error stopping native tracking:', err);
                return false;
            }
        } else if (this.webWatchId !== null) {
            navigator.geolocation.clearWatch(this.webWatchId);
            console.log('Web tracking stopped');
            this.webWatchId = null;
            return true;
        }
        return false;
    },

    // Check if tracking is active
    isTracking() {
        return this.watcherId !== null || this.webWatchId !== null;
    }
};
