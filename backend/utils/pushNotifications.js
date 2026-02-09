/**
 * Push Notification Service
 * Sends FCM notifications to technicians using Firebase Admin SDK
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin (use environment variable or service account file)
let firebaseInitialized = false;

const initializeFirebase = () => {
    if (firebaseInitialized) return true;

    try {
        // Option 1: Use GOOGLE_APPLICATION_CREDENTIALS env variable
        // Option 2: Use service account JSON from env
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            admin.initializeApp({
                credential: admin.credential.applicationDefault()
            });
        } else {
            // Fallback: try default credentials (works in Google Cloud)
            admin.initializeApp();
        }

        firebaseInitialized = true;
        console.log('✅ Firebase Admin SDK initialized');
        return true;
    } catch (error) {
        console.error('❌ Firebase Admin init error:', error.message);
        return false;
    }
};

/**
 * Send push notification to a specific technician
 * @param {string} fcmToken - The technician's FCM token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Optional data payload
 */
const sendPushToTechnician = async (fcmToken, title, body, data = {}) => {
    if (!fcmToken) {
        console.warn('⚠️ No FCM token provided, skipping push');
        return { success: false, reason: 'no_token' };
    }

    if (!initializeFirebase()) {
        console.warn('⚠️ Firebase not initialized, skipping push');
        return { success: false, reason: 'firebase_not_initialized' };
    }

    try {
        const message = {
            token: fcmToken,
            notification: {
                title,
                body
            },
            data: {
                ...data,
                timestamp: new Date().toISOString()
            },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'traceops_notifications'
                }
            }
        };

        const response = await admin.messaging().send(message);
        console.log(`📱 Push sent successfully: ${response}`);
        return { success: true, messageId: response };
    } catch (error) {
        console.error('❌ Push send error:', error.message);
        return { success: false, reason: error.message };
    }
};

/**
 * Send push notification by driver ID (looks up FCM token from DB)
 * @param {object} pool - PostgreSQL pool
 * @param {string|number} driverId - Driver/Technician ID
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Optional data payload
 */
const sendPushByDriverId = async (pool, driverId, title, body, data = {}) => {
    try {
        const result = await pool.query(
            'SELECT fcm_token FROM drivers WHERE id = $1',
            [driverId]
        );

        if (result.rows.length === 0 || !result.rows[0].fcm_token) {
            console.warn(`⚠️ No FCM token for driver ${driverId}`);
            return { success: false, reason: 'no_token_in_db' };
        }

        return await sendPushToTechnician(result.rows[0].fcm_token, title, body, data);
    } catch (error) {
        console.error('❌ Push by driver ID error:', error.message);
        return { success: false, reason: error.message };
    }
};

// Notification templates for common events
const NotificationTemplates = {
    ROUTE_ASSIGNED: (routeName) => ({
        title: '🆕 Nueva OT Asignada',
        body: `Se te ha asignado: ${routeName || 'Nueva orden de trabajo'}`
    }),
    ROUTE_UPDATED: (routeName, reason) => ({
        title: '🔄 OT Actualizada',
        body: reason || `La OT "${routeName}" ha sido modificada`
    }),
    ROUTE_CONFIRMED: (routeName) => ({
        title: '✅ OT Confirmada',
        body: `Pago recibido - ${routeName || 'Orden confirmada'}`
    }),
    ROUTE_CANCELLED: (routeName, reason) => ({
        title: '❌ OT Cancelada',
        body: reason || `La OT "${routeName}" ha sido cancelada`
    })
};

module.exports = {
    initializeFirebase,
    sendPushToTechnician,
    sendPushByDriverId,
    NotificationTemplates
};
