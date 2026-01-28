import { registerPlugin } from '@capacitor/core';
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

// This service handles the native background geolocation logic
export const TrackingService = {
    watcherId: null,

    // Check if we have permissions
    async checkPermissions() {
        try {
            const status = await BackgroundGeolocation.checkPermissions();
            return status;
        } catch (error) {
            console.error('Error checking permissions:', error);
            // Likely running on web, not native
            return { location: 'prompt' };
        }
    },

    // Request permissions if needed
    async requestPermissions() {
        try {
            const status = await BackgroundGeolocation.requestPermissions();
            return status;
        } catch (error) {
            console.error('Error requesting permissions:', error);
            return null;
        }
    },

    // Start tracking
    // callback: (location, error) => void
    async startTracking(callback) {
        // Prevent multiple watchers
        if (this.watcherId) {
            console.warn('Tracking already active');
            return;
        }

        try {
            // Add a watcher
            this.watcherId = await BackgroundGeolocation.addWatcher(
                {
                    // Options
                    backgroundMessage: "Rastreando tu ubicación para el despacho.",
                    backgroundTitle: "Logistics Dashboard",
                    requestPermissions: true,
                    stale: false,
                    distanceFilter: 10 // Update every 10 meters
                },
                (location, error) => {
                    if (error) {
                        if (error.code === "NOT_AUTHORIZED") {
                            if (window.confirm("Esta app necesita usar tu ubicación para el seguimiento. ¿Quieres ir a configuraciones?")) {
                                BackgroundGeolocation.openSettings();
                            }
                        }
                        console.error('Location error:', error);
                        if (callback) callback(null, error);
                        return;
                    }

                    // Success
                    console.log('Location update:', location);
                    if (callback) callback(location, null);
                }
            );

            console.log('Tracking started with watcher ID:', this.watcherId);
            return true;

        } catch (err) {
            console.error('Failed to start tracking:', err);
            return false;
        }
    },

    // Stop tracking
    async stopTracking() {
        if (this.watcherId) {
            try {
                await BackgroundGeolocation.removeWatcher({
                    id: this.watcherId
                });
                console.log('Tracking stopped');
                this.watcherId = null;
                return true;
            } catch (err) {
                console.error('Error stopping tracking:', err);
                return false;
            }
        }
        return false;
    }
};
