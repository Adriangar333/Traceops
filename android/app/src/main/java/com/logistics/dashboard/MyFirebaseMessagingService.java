package com.logistics.dashboard;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Firebase Cloud Messaging Service for TraceOps Driver App
 * Handles incoming push notifications for:
 * - New route assignments
 * - Panic alert acknowledgments
 * - Admin messages
 */
public class MyFirebaseMessagingService extends FirebaseMessagingService {
    
    private static final String TAG = "FCM_TraceOps";
    private static final String CHANNEL_ID = "traceops_notifications";
    private static final String CHANNEL_NAME = "TraceOps Notificaciones";
    
    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }
    
    /**
     * Called when a new FCM token is generated.
     * This happens on first app install or when the token is refreshed.
     * Token should be sent to backend to enable targeted push notifications.
     */
    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        Log.d(TAG, "New FCM Token: " + token);
        
        // TODO: Send token to your backend server
        // The JavaScript side will handle this via Capacitor plugin
        sendTokenToServer(token);
    }
    
    /**
     * Called when a message is received while app is in foreground.
     * When app is in background, the system handles the notification automatically.
     */
    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        
        Log.d(TAG, "Message received from: " + remoteMessage.getFrom());
        
        // Check if message contains a notification payload
        if (remoteMessage.getNotification() != null) {
            String title = remoteMessage.getNotification().getTitle();
            String body = remoteMessage.getNotification().getBody();
            Log.d(TAG, "Notification - Title: " + title + ", Body: " + body);
            showNotification(title, body, remoteMessage.getData());
        }
        
        // Check if message contains a data payload (for silent notifications)
        if (remoteMessage.getData().size() > 0) {
            Log.d(TAG, "Data payload: " + remoteMessage.getData());
            handleDataMessage(remoteMessage.getData());
        }
    }
    
    /**
     * Handle data-only messages (silent notifications)
     */
    private void handleDataMessage(java.util.Map<String, String> data) {
        String type = data.get("type");
        
        if (type != null) {
            switch (type) {
                case "new_route":
                    // New route assigned to driver
                    String routeId = data.get("routeId");
                    String routeName = data.get("routeName");
                    showNotification(
                        "📦 Nueva Ruta Asignada",
                        routeName != null ? routeName : "Tienes una nueva ruta de entrega",
                        data
                    );
                    break;
                    
                case "panic_ack":
                    // Admin acknowledged the panic alert
                    showNotification(
                        "✅ Alerta Recibida",
                        "El administrador ha recibido tu alerta",
                        data
                    );
                    break;
                    
                case "message":
                    // General message from admin
                    String message = data.get("message");
                    showNotification(
                        "💬 Mensaje del Admin",
                        message != null ? message : "Nuevo mensaje",
                        data
                    );
                    break;
                    
                default:
                    Log.d(TAG, "Unknown message type: " + type);
            }
        }
    }
    
    /**
     * Display notification to the user
     */
    private void showNotification(String title, String body, java.util.Map<String, String> data) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        
        // Pass data to the activity
        if (data != null) {
            for (java.util.Map.Entry<String, String> entry : data.entrySet()) {
                intent.putExtra(entry.getKey(), entry.getValue());
            }
        }
        
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 
            0, 
            intent, 
            PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
        );
        
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info) // Use app icon in production
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent);
        
        NotificationManager notificationManager = 
            (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        
        if (notificationManager != null) {
            notificationManager.notify((int) System.currentTimeMillis(), builder.build());
        }
    }
    
    /**
     * Create notification channel for Android 8.0+
     */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Notificaciones de rutas y alertas de TraceOps");
            channel.enableVibration(true);
            channel.enableLights(true);
            
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
    
    /**
     * Send token to backend server for targeted notifications
     */
    private void sendTokenToServer(String token) {
        // This will be handled by the JavaScript/Capacitor side
        // The token is stored and can be retrieved via:
        // FirebaseMessaging.getInstance().getToken()
        Log.d(TAG, "Token ready to be sent to server: " + token);
    }
}
