import { registerPlugin } from '@capacitor/core';

// Check if we're on a native platform
const isNative = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNative;

/**
 * Push Notification Service for TraceOps Driver App
 * Handles FCM registration and token management
 */
export const PushService = {
    token: null,

    /**
     * Initialize push notifications
     * Call this when the driver logs in
     */
    async initialize(driverId) {
        if (!isNative) {
            console.log('Push notifications only available on native platforms');
            return null;
        }

        try {
            // Request notification permission (Android 13+)
            const permissionResult = await this.requestPermission();
            if (permissionResult !== 'granted') {
                console.warn('Notification permission not granted');
                return null;
            }

            // Get the FCM token
            const token = await this.getToken();
            if (token) {
                this.token = token;
                console.log('📱 FCM Token obtained:', token.substring(0, 20) + '...');

                // Send token to backend
                await this.registerTokenWithBackend(driverId, token);

                return token;
            }
        } catch (error) {
            console.error('Error initializing push notifications:', error);
        }
        return null;
    },

    /**
     * Request notification permission (required for Android 13+)
     */
    async requestPermission() {
        if (!isNative) return 'denied';

        try {
            // Use the native permission API via Capacitor
            if (window.Capacitor.Plugins.PushNotifications) {
                const result = await window.Capacitor.Plugins.PushNotifications.requestPermissions();
                return result.receive;
            }

            // Fallback: check if Notification API is available
            if ('Notification' in window) {
                return await Notification.requestPermission();
            }
        } catch (error) {
            console.error('Error requesting notification permission:', error);
        }
        return 'denied';
    },

    /**
     * Get the FCM registration token
     */
    async getToken() {
        if (!isNative) return null;

        try {
            if (window.Capacitor.Plugins.PushNotifications) {
                // Listen for registration
                return new Promise((resolve) => {
                    window.Capacitor.Plugins.PushNotifications.addListener('registration', (token) => {
                        resolve(token.value);
                    });

                    window.Capacitor.Plugins.PushNotifications.addListener('registrationError', (error) => {
                        console.error('FCM registration error:', error);
                        resolve(null);
                    });

                    // Trigger registration
                    window.Capacitor.Plugins.PushNotifications.register();
                });
            }
        } catch (error) {
            console.error('Error getting FCM token:', error);
        }
        return null;
    },

    /**
     * Register the FCM token with the backend
     */
    async registerTokenWithBackend(driverId, token) {
        try {
            const response = await fetch('https://dashboard-backend.zvkdyr.easypanel.host/api/drivers/fcm-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    driverId,
                    fcmToken: token,
                    platform: 'android',
                    timestamp: new Date().toISOString()
                })
            });

            if (response.ok) {
                console.log('✅ FCM token registered with backend');
                return true;
            } else {
                console.error('Failed to register FCM token:', response.status);
                return false;
            }
        } catch (error) {
            console.error('Error registering FCM token with backend:', error);
            return false;
        }
    },

    /**
     * Listen for incoming push notifications
     */
    addNotificationListener(callback) {
        if (!isNative) return;

        try {
            if (window.Capacitor.Plugins.PushNotifications) {
                // Notification received while app is in foreground
                window.Capacitor.Plugins.PushNotifications.addListener(
                    'pushNotificationReceived',
                    (notification) => {
                        console.log('📬 Push received (foreground):', notification);
                        if (callback) callback(notification, 'foreground');
                    }
                );

                // Notification was tapped/clicked
                window.Capacitor.Plugins.PushNotifications.addListener(
                    'pushNotificationActionPerformed',
                    (action) => {
                        console.log('👆 Push tapped:', action);
                        if (callback) callback(action.notification, 'tapped');
                    }
                );
            }
        } catch (error) {
            console.error('Error adding notification listener:', error);
        }
    },

    /**
     * Get the current token (if already initialized)
     */
    getCurrentToken() {
        return this.token;
    }
};
