/**
 * Mobile Offline Database Service
 * Uses @capacitor-community/sqlite for local storage
 * 
 * Purpose: Store orders, evidences, and sync queue locally
 * when the technician is offline in the field.
 */

import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

const DB_NAME = 'scrc_mobile.db';

class DatabaseService {
    constructor() {
        this.sqlite = new SQLiteConnection(CapacitorSQLite);
        this.db = null;
        this.platform = Capacitor.getPlatform();
        this.initialized = false;
    }

    /**
     * Initialize the database and create tables
     */
    async init() {
        if (this.initialized) return;

        try {
            // Web requires different handling
            if (this.platform === 'web') {
                await this.sqlite.initWebStore();
            }

            // Create connection
            const ret = await this.sqlite.checkConnectionsConsistency();
            const isConn = (await this.sqlite.isConnection(DB_NAME, false)).result;

            if (ret.result && isConn) {
                this.db = await this.sqlite.retrieveConnection(DB_NAME, false);
            } else {
                this.db = await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
            }

            await this.db.open();
            await this.createTables();
            this.initialized = true;
            console.log('✅ Mobile Database initialized');

        } catch (err) {
            console.error('❌ Database init error:', err);
            throw err;
        }
    }

    /**
     * Create local tables for offline storage
     */
    async createTables() {
        const statements = `
            -- Orders cached from server
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY,
                order_number TEXT UNIQUE,
                nic TEXT,
                client_name TEXT,
                address TEXT,
                municipality TEXT,
                neighborhood TEXT,
                order_type TEXT,
                brigade_type TEXT,
                amount_due REAL,
                priority INTEGER,
                status TEXT DEFAULT 'pending',
                assigned_at TEXT,
                lat REAL,
                lng REAL,
                synced INTEGER DEFAULT 1,
                updated_at TEXT
            );

            -- Evidences (photos, forms) waiting to sync
            CREATE TABLE IF NOT EXISTS evidences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER,
                type TEXT,
                file_path TEXT,
                reading_value TEXT,
                action_taken TEXT,
                notes TEXT,
                lat REAL,
                lng REAL,
                captured_at TEXT,
                synced INTEGER DEFAULT 0,
                FOREIGN KEY (order_id) REFERENCES orders(id)
            );

            -- Sync queue for offline actions
            CREATE TABLE IF NOT EXISTS sync_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT,
                table_name TEXT,
                record_id INTEGER,
                payload TEXT,
                created_at TEXT,
                attempts INTEGER DEFAULT 0,
                last_error TEXT
            );

            -- App state (last sync, user info)
            CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `;

        await this.db.execute(statements);
    }

    // ==========================================
    // ORDERS OPERATIONS
    // ==========================================

    /**
     * Save orders downloaded from server
     */
    async saveOrders(orders) {
        const stmt = `
            INSERT OR REPLACE INTO orders 
            (id, order_number, nic, client_name, address, municipality, neighborhood, 
             order_type, brigade_type, amount_due, priority, status, assigned_at, lat, lng, synced, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `;

        for (const o of orders) {
            await this.db.run(stmt, [
                o.id, o.order_number, o.nic, o.client_name || o.nombre_cliente,
                o.address || o.direccion, o.municipality || o.municipio,
                o.neighborhood || o.barrio, o.order_type || o.tipo_os,
                o.brigade_type || o.tipo_brigada, o.amount_due || o.deuda,
                o.priority, o.status, o.assigned_at, o.lat, o.lng,
                new Date().toISOString()
            ]);
        }

        console.log(`📥 Saved ${orders.length} orders to local DB`);
    }

    /**
     * Get all orders for the technician
     */
    async getOrders(status = null) {
        let sql = 'SELECT * FROM orders';
        const params = [];

        if (status) {
            sql += ' WHERE status = ?';
            params.push(status);
        }

        sql += ' ORDER BY priority ASC, amount_due DESC';

        const result = await this.db.query(sql, params);
        return result.values || [];
    }

    /**
     * Update order status locally
     */
    async updateOrderStatus(orderId, status) {
        await this.db.run(
            'UPDATE orders SET status = ?, synced = 0, updated_at = ? WHERE id = ?',
            [status, new Date().toISOString(), orderId]
        );

        // Add to sync queue
        await this.addToSyncQueue('UPDATE_STATUS', 'orders', orderId, { status });
    }

    // ==========================================
    // EVIDENCES OPERATIONS
    // ==========================================

    /**
     * Save evidence (photo, form data)
     */
    async saveEvidence(evidence) {
        const stmt = `
            INSERT INTO evidences 
            (order_id, type, file_path, reading_value, action_taken, notes, lat, lng, captured_at, synced)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `;

        const result = await this.db.run(stmt, [
            evidence.orderId, evidence.type, evidence.filePath,
            evidence.reading, evidence.action, evidence.notes,
            evidence.lat, evidence.lng, new Date().toISOString()
        ]);

        // Add to sync queue
        await this.addToSyncQueue('UPLOAD_EVIDENCE', 'evidences', result.changes.lastId, evidence);

        return result.changes.lastId;
    }

    /**
     * Get pending evidences (not synced)
     */
    async getPendingEvidences() {
        const result = await this.db.query('SELECT * FROM evidences WHERE synced = 0');
        return result.values || [];
    }

    // ==========================================
    // SYNC QUEUE OPERATIONS
    // ==========================================

    /**
     * Add action to sync queue
     */
    async addToSyncQueue(action, tableName, recordId, payload) {
        await this.db.run(
            `INSERT INTO sync_queue (action, table_name, record_id, payload, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [action, tableName, recordId, JSON.stringify(payload), new Date().toISOString()]
        );
    }

    /**
     * Get pending sync items
     */
    async getSyncQueue() {
        const result = await this.db.query(
            'SELECT * FROM sync_queue ORDER BY created_at ASC LIMIT 50'
        );
        return result.values || [];
    }

    /**
     * Mark sync item as done
     */
    async removeSyncItem(id) {
        await this.db.run('DELETE FROM sync_queue WHERE id = ?', [id]);
    }

    /**
     * Record sync failure
     */
    async recordSyncFailure(id, error) {
        await this.db.run(
            'UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?',
            [error, id]
        );
    }

    // ==========================================
    // APP STATE
    // ==========================================

    async setState(key, value) {
        await this.db.run(
            'INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)',
            [key, JSON.stringify(value)]
        );
    }

    async getState(key) {
        const result = await this.db.query('SELECT value FROM app_state WHERE key = ?', [key]);
        if (result.values && result.values.length > 0) {
            return JSON.parse(result.values[0].value);
        }
        return null;
    }

    /**
     * Clear all local data (logout)
     */
    async clearAll() {
        await this.db.execute(`
            DELETE FROM orders;
            DELETE FROM evidences;
            DELETE FROM sync_queue;
            DELETE FROM app_state;
        `);
    }
}

// Singleton export
export const dbService = new DatabaseService();
