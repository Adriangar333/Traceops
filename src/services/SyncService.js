/**
 * Sync Service
 * Handles bidirectional synchronization between local SQLite and remote PostgreSQL
 * 
 * Flow:
 * 1. DOWNLOAD: Fetch assigned orders from server -> Save to local DB
 * 2. UPLOAD: Push pending evidences/status updates from sync_queue -> Server
 */

import { dbService } from './DatabaseService';
import { Network } from '@capacitor/network';
import client from '../apollo/client';
import { gql } from '@apollo/client';

const API_BASE = 'https://dashboard-backend.zvkdyr.easypanel.host/api';

const UPLOAD_EVIDENCE = gql`
    mutation UploadSCRCEvidence(
        $orderNumber: String!,
        $type: String!,
        $photo: String,
        $signature: String,
        $notes: String,
        $technicianName: String,
        $lat: Float,
        $lng: Float,
        $capturedAt: String
    ) {
        uploadSCRCEvidence(
            orderNumber: $orderNumber,
            type: $type,
            photo: $photo,
            signature: $signature,
            notes: $notes,
            technicianName: $technicianName,
            lat: $lat,
            lng: $lng,
            capturedAt: $capturedAt
        ) {
            id
        }
    }
`;

class SyncService {
    constructor() {
        this.isSyncing = false;
        this.isOnline = true;
        this.lastSyncTime = null;
        this.listeners = [];
    }

    /**
     * Initialize network monitoring
     */
    async init() {
        // Check initial status
        const status = await Network.getStatus();
        this.isOnline = status.connected;

        // Listen for network changes
        Network.addListener('networkStatusChange', (status) => {
            const wasOffline = !this.isOnline;
            this.isOnline = status.connected;

            console.log(`📡 Network: ${this.isOnline ? 'ONLINE' : 'OFFLINE'}`);

            // Trigger sync when coming back online
            if (wasOffline && this.isOnline) {
                console.log('🔄 Back online! Starting sync...');
                this.syncAll();
            }

            // Notify listeners
            this.listeners.forEach(cb => cb(this.isOnline));
        });

        console.log('✅ SyncService initialized');
    }

    /**
     * Subscribe to network status changes
     */
    onNetworkChange(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    /**
     * Get auth token from local storage
     */
    getToken() {
        return localStorage.getItem('token');
    }

    /**
     * Fetch headers with auth
     */
    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.getToken()}`
        };
    }

    // ==========================================
    // DOWNLOAD: Server -> Local
    // ==========================================

    /**
     * Download assigned orders for this technician
     */
    async downloadOrders(technicianId) {
        if (!this.isOnline) {
            console.log('⚠️ Offline - using cached orders');
            return await dbService.getOrders();
        }

        try {
            const response = await fetch(
                `${API_BASE}/scrc/orders?technician_id=${technicianId}&status=assigned`,
                { headers: this.getHeaders() }
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            const orders = data.orders || data;

            // Save to local DB
            await dbService.saveOrders(orders);
            await dbService.setState('lastOrderSync', new Date().toISOString());

            console.log(`📥 Downloaded ${orders.length} orders`);
            return orders;

        } catch (err) {
            console.error('❌ Download orders failed:', err);
            // Return cached data
            return await dbService.getOrders();
        }
    }

    // ==========================================
    // UPLOAD: Local -> Server
    // ==========================================

    /**
     * Process sync queue - upload pending changes
     */
    async uploadPending() {
        if (!this.isOnline || this.isSyncing) return;

        this.isSyncing = true;

        try {
            const queue = await dbService.getSyncQueue();

            for (const item of queue) {
                try {
                    await this.processQueueItem(item);
                    await dbService.removeSyncItem(item.id);
                    console.log(`✅ Synced: ${item.action} #${item.record_id}`);
                } catch (err) {
                    console.error(`❌ Sync failed for item ${item.id}:`, err);
                    await dbService.recordSyncFailure(item.id, err.message);
                }
            }

        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Process individual queue item
     */
    async processQueueItem(item) {
        const payload = JSON.parse(item.payload);

        switch (item.action) {
            case 'UPDATE_STATUS':
                await this.syncOrderStatus(item.record_id, payload.status);
                break;

            case 'UPLOAD_EVIDENCE':
                await this.syncEvidence(item.record_id, payload);
                break;

            default:
                console.warn(`Unknown sync action: ${item.action}`);
        }
    }

    /**
     * Sync order status change to server
     */
    async syncOrderStatus(orderId, status) {
        const response = await fetch(`${API_BASE}/scrc/orders/${orderId}/status`, {
            method: 'PATCH',
            headers: this.getHeaders(),
            body: JSON.stringify({ status })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        // Mark as synced locally
        await dbService.db.run(
            'UPDATE orders SET synced = 1 WHERE id = ?',
            [orderId]
        );
    }

    /**
     * Sync evidence (photo, form) to server
     */
    async syncEvidence(evidenceId, evidence) {
        // Get evidence record
        const result = await dbService.db.query(
            'SELECT * FROM evidences WHERE id = ?',
            [evidenceId]
        );

        if (!result.values || result.values.length === 0) {
            throw new Error('Evidence not found locally');
        }

        const record = result.values[0];

        // Get order number (which is the ID for the endpoint)
        const orderRes = await dbService.db.query('SELECT order_number FROM orders WHERE id = ?', [record.order_id]);
        const orderNumber = orderRes.values[0]?.order_number;

        // Get technician name
        const user = await dbService.getState('user');

        // Combine notes
        const combinedNotes = [
            record.notes,
            record.reading_value ? `Lectura: ${record.reading_value}` : '',
            record.action_taken ? `Acción: ${record.action_taken}` : ''
        ].filter(Boolean).join(' | ');

        // Upload to server using GraphQL
        await client.mutate({
            mutation: UPLOAD_EVIDENCE,
            variables: {
                orderNumber: orderNumber,
                type: record.type,
                photo: record.file_path, // Base64 content
                signature: record.signature,
                notes: combinedNotes,
                technicianName: user?.name,
                lat: record.lat,
                lng: record.lng,
                capturedAt: record.captured_at
            }
        });

        // Mark as synced
        await dbService.db.run(
            'UPDATE evidences SET synced = 1 WHERE id = ?',
            [evidenceId]
        );
    }

    // ==========================================
    // FULL SYNC
    // ==========================================

    /**
     * Full sync: download + upload
     */
    async syncAll(technicianId = null) {
        if (!this.isOnline) {
            console.log('⚠️ Cannot sync - offline');
            return { success: false, reason: 'offline' };
        }

        try {
            // Get technician ID from state if not provided
            if (!technicianId) {
                const user = await dbService.getState('user');
                technicianId = user?.id;
            }

            // 1. Upload pending changes first
            await this.uploadPending();

            // 2. Download fresh data
            if (technicianId) {
                await this.downloadOrders(technicianId);
            }

            this.lastSyncTime = new Date();
            await dbService.setState('lastSync', this.lastSyncTime.toISOString());

            return { success: true, lastSync: this.lastSyncTime };

        } catch (err) {
            console.error('❌ Full sync failed:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Get sync status
     */
    async getStatus() {
        const pendingQueue = await dbService.getSyncQueue();
        const pendingEvidences = await dbService.getPendingEvidences();

        return {
            isOnline: this.isOnline,
            isSyncing: this.isSyncing,
            lastSync: this.lastSyncTime,
            pendingActions: pendingQueue.length,
            pendingEvidences: pendingEvidences.length
        };
    }
}

// Singleton export
export const syncService = new SyncService();
