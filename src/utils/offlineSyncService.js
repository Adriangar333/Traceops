/**
 * Offline Sync Service
 * Manages pending deliveries queue and auto-sync when connection is restored
 */

const PENDING_KEY = 'traceops_pending_deliveries';
const BACKEND_URL = 'https://dashboard-backend.zvkdyr.easypanel.host';

// Event listeners for sync status
const syncListeners = [];

/**
 * Check if device is online
 */
export const isOnline = () => {
    return navigator.onLine;
};

/**
 * Get all pending deliveries
 */
export const getPendingDeliveries = () => {
    try {
        return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    } catch (e) {
        console.error('Error reading pending deliveries:', e);
        return [];
    }
};

/**
 * Get count of pending deliveries
 */
export const getPendingCount = () => {
    return getPendingDeliveries().length;
};

/**
 * Queue a delivery for later sync
 */
export const queueDelivery = (podData) => {
    try {
        const pending = getPendingDeliveries();
        const newEntry = {
            ...podData,
            queuedAt: new Date().toISOString(),
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };
        pending.push(newEntry);
        localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
        console.log('📦 Delivery queued for sync:', newEntry.id);
        notifyListeners({ type: 'queued', count: pending.length });
        return true;
    } catch (e) {
        console.error('Error queueing delivery:', e);
        return false;
    }
};

/**
 * Remove a delivery from queue after successful sync
 */
const removeFromQueue = (id) => {
    try {
        const pending = getPendingDeliveries().filter(d => d.id !== id);
        localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch (e) {
        console.error('Error removing from queue:', e);
    }
};

/**
 * Sync a single delivery to backend
 */
const syncDelivery = async (delivery) => {
    try {
        const response = await fetch(`${BACKEND_URL}/pod/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                routeId: delivery.routeId,
                waypointIndex: delivery.waypointIndex,
                driverId: delivery.driverId,
                photo: delivery.photo,
                signature: delivery.signature,
                location: delivery.location,
                deliveredAt: delivery.queuedAt // Original time of delivery
            })
        });
        return response.ok;
    } catch (e) {
        console.error('Sync failed for delivery:', delivery.id, e);
        return false;
    }
};

/**
 * Sync all pending deliveries
 */
export const syncPending = async () => {
    if (!isOnline()) {
        console.log('📵 Still offline, cannot sync');
        return { synced: 0, failed: 0 };
    }

    const pending = getPendingDeliveries();
    if (pending.length === 0) {
        return { synced: 0, failed: 0 };
    }

    console.log(`🔄 Syncing ${pending.length} pending deliveries...`);
    notifyListeners({ type: 'syncing', count: pending.length });

    let synced = 0;
    let failed = 0;

    for (const delivery of pending) {
        const success = await syncDelivery(delivery);
        if (success) {
            removeFromQueue(delivery.id);
            synced++;
        } else {
            failed++;
        }
    }

    console.log(`✅ Sync complete: ${synced} synced, ${failed} failed`);
    notifyListeners({ type: 'complete', synced, failed, remaining: getPendingCount() });

    return { synced, failed };
};

/**
 * Subscribe to sync events
 */
export const onSyncEvent = (callback) => {
    syncListeners.push(callback);
    return () => {
        const index = syncListeners.indexOf(callback);
        if (index > -1) syncListeners.splice(index, 1);
    };
};

/**
 * Notify all listeners of sync status
 */
const notifyListeners = (event) => {
    syncListeners.forEach(cb => {
        try { cb(event); } catch (e) { console.error('Listener error:', e); }
    });
};

/**
 * Initialize auto-sync on connection restore
 */
export const initAutoSync = () => {
    // Listen for online event
    window.addEventListener('online', async () => {
        console.log('📶 Connection restored! Starting auto-sync...');
        const pending = getPendingCount();
        if (pending > 0) {
            await syncPending();
        }
    });

    // Listen for offline event
    window.addEventListener('offline', () => {
        console.log('📵 Connection lost. Deliveries will be queued.');
        notifyListeners({ type: 'offline' });
    });

    // Initial check - sync any pending items on load
    if (isOnline() && getPendingCount() > 0) {
        setTimeout(() => {
            console.log('🔄 Found pending deliveries on startup, syncing...');
            syncPending();
        }, 2000); // Delay to let app initialize
    }

    console.log('✅ Offline sync service initialized');
};

export default {
    isOnline,
    getPendingDeliveries,
    getPendingCount,
    queueDelivery,
    syncPending,
    onSyncEvent,
    initAutoSync
};
