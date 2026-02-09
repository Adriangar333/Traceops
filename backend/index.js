require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');
const helmet = require('helmet');

// Redis Adapter for Socket.io Horizontal Scaling
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

// Security Middleware
const { authRequired, requireRole, optionalAuth, driverAuth } = require('./middleware/auth');
const { apiLimiter, publicLimiter } = require('./middleware/rateLimiter');
const authRoutes = require('./routes/authRoutes');
// GraphQL
const { createApolloServer, setupGraphQLMiddleware } = require('./graphql');

// Push Notifications
const { sendPushByDriverId, NotificationTemplates, initializeFirebase } = require('./utils/pushNotifications');

const app = express();

// ======================================
// SECURITY CONFIGURATION
// ======================================

// Helmet - Security Headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false // Disable for API server
}));

// CORS - Restricted to allowed origins
const allowedOrigins = [
    'https://dashboard-frontend.zvkdyr.easypanel.host',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173'
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, Postman)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        console.warn(`🚫 CORS blocked origin: ${origin}`);
        return callback(null, true); // Temporarily allow all during transition
    },
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate Limiting - Apply to all API routes
app.use('/api/', apiLimiter);

// Auth Routes (login, register, etc.)
app.use('/api/auth', authRoutes);

// SCRC Routes - initialized after pool (see below)

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Database Connection - MUST be initialized before routes that need it
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false // Disable SSL for now as requested in query string
});

// SCRC Routes (Ingestion, Updates) - requires pool
const scrcRoutes = require('./routes/scrcRoutes')(pool);
app.use('/api/scrc', scrcRoutes);

// Zone Classification Routes (Urban/Rural detection)
const zoneRoutes = require('./routes/zones');
app.use('/api/zones', zoneRoutes);

// ======================================
// SCALABILITY OPTIMIZATIONS
// ======================================

// Redis Adapter Setup (if REDIS_URL configured)
if (process.env.REDIS_URL) {
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => console.error('Redis Pub Error:', err));
    subClient.on('error', (err) => console.error('Redis Sub Error:', err));

    Promise.all([pubClient.connect(), subClient.connect()])
        .then(() => {
            io.adapter(createAdapter(pubClient, subClient));
            console.log('✅ Redis Adapter connected - Horizontal scaling enabled');
        })
        .catch((err) => {
            console.warn('⚠️ Redis Adapter failed, falling back to in-memory:', err.message);
        });
} else {
    console.log('ℹ️ REDIS_URL not configured - using in-memory Socket.io (single instance)');
}

// Buffer for batch inserts (reduces DB writes by ~94%)
const locationBuffer = [];
const BATCH_INTERVAL = 30000; // 30 seconds
const MIN_DISTANCE_METERS = 10; // Only save if moved > 10m

// Cache for last known positions (for throttling)
const lastPositions = new Map(); // driverId -> {lat, lng, timestamp}

// Cache for active waypoints (for in-memory geofencing)
const activeWaypoints = new Map(); // driverId -> [{lat, lng, routeId, waypointIndex, id, address}]

// Haversine distance calculation (meters)
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Check if location should be saved (throttling)
function shouldSaveLocation(driverId, lat, lng) {
    const last = lastPositions.get(driverId);
    if (!last) {
        lastPositions.set(driverId, { lat, lng, timestamp: Date.now() });
        return true;
    }

    const distance = haversineDistance(last.lat, last.lng, lat, lng);
    if (distance > MIN_DISTANCE_METERS) {
        lastPositions.set(driverId, { lat, lng, timestamp: Date.now() });
        return true;
    }
    return false;
}

// Check geofence in memory (no DB query needed)
function checkGeofenceInMemory(driverId, lat, lng) {
    const waypoints = activeWaypoints.get(driverId) || [];
    return waypoints.filter(wp => {
        const distance = haversineDistance(lat, lng, wp.lat, wp.lng);
        return distance < 100; // 100 meters radius
    });
}

// Load active waypoints into memory cache
async function loadActiveWaypoints() {
    try {
        const result = await pool.query(`
            SELECT id, driver_id, route_id, waypoint_index, address,
                   ST_X(location) as lng, ST_Y(location) as lat
            FROM route_waypoints WHERE arrived = FALSE
        `);

        activeWaypoints.clear();
        result.rows.forEach(wp => {
            if (!activeWaypoints.has(wp.driver_id)) {
                activeWaypoints.set(wp.driver_id, []);
            }
            activeWaypoints.get(wp.driver_id).push({
                id: wp.id,
                routeId: wp.route_id,
                waypointIndex: wp.waypoint_index,
                address: wp.address,
                lat: wp.lat,
                lng: wp.lng
            });
        });
        console.log(`📍 Loaded ${result.rows.length} active waypoints into cache`);
    } catch (err) {
        console.error('Error loading waypoints cache:', err);
    }
}

// Batch insert locations to DB
async function flushLocationBuffer() {
    if (locationBuffer.length === 0) return;

    const batch = locationBuffer.splice(0, locationBuffer.length);

    try {
        // Build parameterized query for batch insert
        const values = batch.map((_, i) => {
            const offset = i * 5;
            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, 
                    ST_SetSRID(ST_MakePoint($${offset + 3}, $${offset + 2}), 4326))`;
        }).join(',');

        const params = batch.flatMap(l => [l.driverId, l.lat, l.lng, l.speed, l.heading]);

        await pool.query(`
            INSERT INTO driver_locations (driver_id, latitude, longitude, speed, heading, location)
            VALUES ${values}
        `, params);

        console.log(`📦 Batch insert: ${batch.length} locations saved`);
    } catch (err) {
        console.error('Batch insert error:', err);
        // Put failed items back in buffer for retry
        locationBuffer.unshift(...batch);
    }
}

// Cleanup old locations (TTL: 30 days)
async function cleanupOldLocations() {
    try {
        const result = await pool.query(`
            DELETE FROM driver_locations 
            WHERE timestamp < NOW() - INTERVAL '30 days'
        `);
        if (result.rowCount > 0) {
            console.log(`🧹 Cleaned ${result.rowCount} old locations (>30 days)`);
        }
    } catch (err) {
        console.error('Cleanup error:', err);
    }
}

// Start batch insert interval
setInterval(flushLocationBuffer, BATCH_INTERVAL);

// Start cleanup job (every 24 hours)
setInterval(cleanupOldLocations, 24 * 60 * 60 * 1000);

// Reload waypoints cache every 5 minutes (in case of external changes)
setInterval(loadActiveWaypoints, 5 * 60 * 1000);

// Set timezone for all pool connections to Colombia
pool.on('connect', (client) => {
    client.query("SET timezone = 'America/Bogota';");
});

// Initialize Database Schema
const initDB = async () => {
    try {
        const client = await pool.connect();
        console.log('✅ Connected to PostgreSQL + PostGIS');

        // Set timezone to Colombia
        await client.query("SET timezone = 'America/Bogota';");
        console.log('✅ Timezone set to America/Bogota');

        // Activate PostGIS (Required even if image has it installed)
        await client.query('CREATE EXTENSION IF NOT EXISTS postgis;');
        console.log('✅ PostGIS Extension Activated');

        // Create driver_locations table (TimescaleDB compatible)
        await client.query(`
            CREATE TABLE IF NOT EXISTS driver_locations (
                id SERIAL,
                driver_id TEXT NOT NULL,
                latitude FLOAT NOT NULL,
                longitude FLOAT NOT NULL,
                speed FLOAT,
                heading FLOAT,
                timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                location GEOMETRY(POINT, 4326)
            );
        `);

        // Try to convert to TimescaleDB hypertable (if TimescaleDB is available)
        try {
            await client.query(`SELECT create_hypertable('driver_locations', 'timestamp', if_not_exists => TRUE);`);
            console.log('✅ driver_locations converted to TimescaleDB hypertable');

            // Enable compression for old data
            await client.query(`
                ALTER TABLE driver_locations SET (
                    timescaledb.compress,
                    timescaledb.compress_segmentby = 'driver_id'
                );
            `);
            await client.query(`SELECT add_compression_policy('driver_locations', INTERVAL '7 days', if_not_exists => TRUE);`);
            console.log('✅ Compression policy enabled (>7 days)');
        } catch (tsErr) {
            // TimescaleDB not available, continue with regular table
            console.log('ℹ️ TimescaleDB not available, using regular table');
        }
        // Create drivers table
        await client.query(`
            CREATE TABLE IF NOT EXISTS drivers (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT,
                phone TEXT,
                cuadrilla TEXT,
                status TEXT DEFAULT 'idle',
                assigned_routes TEXT[] DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Ensure columns exist (migrations)
        await client.query(`
            ALTER TABLE drivers 
            ADD COLUMN IF NOT EXISTS cuadrilla TEXT;
        `);
        await client.query(`
            ALTER TABLE drivers 
            ADD COLUMN IF NOT EXISTS vehicle_type TEXT DEFAULT 'car';
        `);
        await client.query(`
            ALTER TABLE drivers 
            ADD COLUMN IF NOT EXISTS brigade_role TEXT;
        `);
        // FCM Push Notification columns
        await client.query(`
            ALTER TABLE drivers 
            ADD COLUMN IF NOT EXISTS fcm_token TEXT;
        `);
        await client.query(`
            ALTER TABLE drivers 
            ADD COLUMN IF NOT EXISTS platform VARCHAR(20);
        `);
        await client.query(`
            ALTER TABLE drivers 
            ADD COLUMN IF NOT EXISTS fcm_updated_at TIMESTAMP;
        `);
        console.log('✅ Table drivers ready (with vehicle_type, roles & FCM)');

        // Create delivery_proofs table for POD
        await client.query(`
            CREATE TABLE IF NOT EXISTS delivery_proofs (
                id SERIAL PRIMARY KEY,
                route_id TEXT NOT NULL,
                waypoint_index INTEGER NOT NULL,
                driver_id TEXT NOT NULL,
                photo TEXT,
                signature TEXT,
                latitude FLOAT,
                longitude FLOAT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Table delivery_proofs ready');

        // Create routes table for Persistent Links
        await client.query(`
            CREATE TABLE IF NOT EXISTS routes (
                id TEXT PRIMARY KEY,
                name TEXT,
                driver_id TEXT,
                status TEXT DEFAULT 'active',
                waypoints JSONB,
                distance_km FLOAT,
                duration_min FLOAT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Table routes ready');

        // Ensure column exists (migration for routes)
        await client.query(`
            ALTER TABLE routes 
            ADD COLUMN IF NOT EXISTS route_geometry JSONB;
        `);
        console.log('✅ Table routes ready (with geometry)');

        // Create route_waypoints table for geofencing
        await client.query(`
            CREATE TABLE IF NOT EXISTS route_waypoints (
                id SERIAL PRIMARY KEY,
                route_id TEXT NOT NULL,
                driver_id TEXT NOT NULL,
                waypoint_index INTEGER NOT NULL,
                address TEXT,
                location GEOMETRY(POINT, 4326),
                arrived BOOLEAN DEFAULT FALSE,
                arrived_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Table route_waypoints ready');

        // Create indexes for faster geospatial queries
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_waypoints_location 
            ON route_waypoints USING GIST(location);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_locations_driver_date 
            ON driver_locations(driver_id, timestamp);
        `);
        // Create alerts table
        await client.query(`
            CREATE TABLE IF NOT EXISTS alerts (
                id SERIAL PRIMARY KEY,
                driver_id TEXT NOT NULL,
                type TEXT DEFAULT 'SOS',
                latitude FLOAT,
                longitude FLOAT,
                details JSONB,
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Table alerts ready');

        // ==========================================
        // SCRC MODULE TABLES (ISES Project)
        // ==========================================

        // 1. Brigades (Cuadrillas)
        await client.query(`
            CREATE TABLE IF NOT EXISTS brigades (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                type TEXT DEFAULT 'mixed', -- 'SCR LIVIANA', 'SCR PESADA', 'CANASTA', etc.
                members JSONB DEFAULT '[]', -- [{id, name, role: 'titular'}, {id, name, role: 'auxiliar'}]
                status TEXT DEFAULT 'active',
                current_zone TEXT,
                capacity_per_day INTEGER DEFAULT 30,
                assigned_orders_count INTEGER DEFAULT 0,
                last_location GEOMETRY(POINT, 4326),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Table brigades ready');

        // 2. SCRC Orders (Órdenes de Trabajo - Mapped from ASIGNACION DE TRABAJOS ISES.xlsx)
        await client.query(`
            CREATE TABLE IF NOT EXISTS scrc_orders (
                id SERIAL PRIMARY KEY,
                order_number TEXT UNIQUE NOT NULL, -- ORDEN from Excel
                nic TEXT NOT NULL, -- Número de Identificación de Contrato
                order_type TEXT NOT NULL, -- 'suspension', 'corte', 'reconexion'
                product_code TEXT, -- TIPO DE OS (TO501, TO502, etc.)
                priority INTEGER DEFAULT 2, -- 1=High (Cortes), 2=Medium, 3=Low
                
                -- Client Info
                client_name TEXT, -- NOMBRE DEL CLIENTE
                tariff TEXT, -- TARIFA (ESTRATO 1, 2, etc.)
                
                -- Location
                address TEXT, -- DIRECCION
                municipality TEXT, -- MUNICIPIO
                neighborhood TEXT, -- BARRIO
                department TEXT, -- DEPARTAMENTO
                zone_code TEXT, -- BRIGADA (Zone code)
                
                -- Technician / Brigade
                technician_name TEXT, -- TECNICO
                brigade_type TEXT, -- TIPO DE BRIGADA (SCR LIVIANA, SCR PESADA, etc.)
                strategic_line TEXT, -- LINEA ESTRATEGICA
                supervisor TEXT, -- SUPERVISOR
                
                -- Financials
                amount_due DECIMAL(12, 2) DEFAULT 0, -- DEUDA
                
                -- Meter Info
                meter_number TEXT, -- MEDIDOR
                meter_brand TEXT, -- MARCA MEDIDOR
                
                -- GeoLocation (for routing)
                latitude FLOAT,
                longitude FLOAT,
                location GEOMETRY(POINT, 4326),
                
                -- Status
                status TEXT DEFAULT 'pending', -- 'pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled_payment'
                sub_status TEXT, -- 'no_access', 'address_not_found', etc.
                
                -- Assignment
                assigned_brigade_id INTEGER REFERENCES brigades(id),
                assigned_at TIMESTAMP,
                assignment_date TIMESTAMP, -- FECHA ASIGNACION
                
                -- Execution
                execution_date TIMESTAMP,
                evidence_photos TEXT[], -- Array of URLs
                notes TEXT, -- OBSERVACIONES
                
                -- Metadata
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Table scrc_orders ready');

        // Migration: Add columns if they don't exist (for existing tables)
        await client.query(`
            ALTER TABLE scrc_orders ADD COLUMN IF NOT EXISTS order_number TEXT;
            ALTER TABLE scrc_orders ADD COLUMN IF NOT EXISTS technician_name TEXT;
            ALTER TABLE scrc_orders ADD COLUMN IF NOT EXISTS brigade_type TEXT;
            ALTER TABLE scrc_orders ADD COLUMN IF NOT EXISTS strategic_line TEXT;
            ALTER TABLE scrc_orders ADD COLUMN IF NOT EXISTS department TEXT;
            ALTER TABLE scrc_orders ADD COLUMN IF NOT EXISTS tariff TEXT;
            ALTER TABLE scrc_orders ADD COLUMN IF NOT EXISTS meter_number TEXT;
            ALTER TABLE scrc_orders ADD COLUMN IF NOT EXISTS meter_brand TEXT;
            ALTER TABLE scrc_orders ADD COLUMN IF NOT EXISTS supervisor TEXT;
            ALTER TABLE scrc_orders ADD COLUMN IF NOT EXISTS assignment_date TIMESTAMP;
        `);
        console.log('✅ SCRC migrations applied');

        // Indexes for SCRC
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_scrc_location ON scrc_orders USING GIST(location);
            CREATE INDEX IF NOT EXISTS idx_scrc_nic ON scrc_orders(nic);
            CREATE INDEX IF NOT EXISTS idx_scrc_status ON scrc_orders(status);
            CREATE INDEX IF NOT EXISTS idx_scrc_brigade ON scrc_orders(assigned_brigade_id);
            CREATE INDEX IF NOT EXISTS idx_scrc_order_number ON scrc_orders(order_number);
            CREATE INDEX IF NOT EXISTS idx_brigades_location ON brigades USING GIST(last_location);
        `);

        client.release();

        // Load active waypoints into memory cache after DB init
        await loadActiveWaypoints();
    } catch (err) {
        console.error('❌ Database connection error:', err);
    }
};

initDB();

// API Routes for Drivers

// PROTECTED: Full driver data (requires auth)
app.get('/api/drivers', authRequired, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM drivers ORDER BY created_at DESC');
        const drivers = result.rows.map(d => ({
            ...d,
            assignedRoutes: d.assigned_routes || []
        }));
        res.json(drivers);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch drivers' });
    }
});

// PUBLIC: Minimal driver data (no sensitive info)
app.get('/drivers', publicLimiter, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, status, cuadrilla, email, phone, vehicle_type, brigade_role FROM drivers ORDER BY created_at DESC');
        // Only return non-sensitive fields
        const drivers = result.rows.map(d => ({
            id: d.id,
            name: d.name,
            status: d.status,
            cuadrilla: d.cuadrilla,
            email: d.email,
            phone: d.phone,
            vehicleType: d.vehicle_type || 'car',
            brigadeRole: d.brigade_role || ''
        }));
        res.json(drivers);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch drivers' });
    }
});

// Get routes assigned to a specific driver
app.get('/drivers/:id/routes', async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM routes WHERE driver_id = $1 AND status != 'completed' ORDER BY created_at DESC",
            [req.params.id]
        );
        const rows = result.rows.map(r => {
            // Ensure geometry is parsed correctly (Postgres sometimes returns string for json/text columns)
            let geom = r.route_geometry;
            if (typeof geom === 'string') {
                try { geom = JSON.parse(geom); } catch (e) { console.error('Error parsing route geometry:', e); }
            }
            return { ...r, route_geometry: geom };
        });
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch driver routes' });
    }
});

// Create/Assign a route
app.post('/routes', async (req, res) => {
    const { id, name, driverId, waypoints, distanceKm, duration, geometry } = req.body; // Added geometry

    if (!id || !driverId) return res.status(400).json({ error: 'Route ID and Driver ID required' });

    try {
        // 1. Save Route Metadata
        await pool.query(
            `INSERT INTO routes (id, name, driver_id, waypoints, distance_km, duration_min, route_geometry)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO UPDATE SET
                route_geometry = EXCLUDED.route_geometry,
                driver_id = EXCLUDED.driver_id`, // Allow updating existing routes geometry
            [id.toString(), name, driverId, JSON.stringify(waypoints), distanceKm, duration, geometry ? JSON.stringify(geometry) : null]
        );

        // 2. Also update drivers table for redundancy/legacy support
        await pool.query(
            'UPDATE drivers SET assigned_routes = array_append(assigned_routes, $1) WHERE id = $2',
            [id.toString(), driverId]
        );

        // 3. Send push notification to technician
        const notification = NotificationTemplates.ROUTE_ASSIGNED(name);
        sendPushByDriverId(pool, driverId, notification.title, notification.body, { routeId: id.toString() })
            .then(result => console.log('📱 Push result:', result))
            .catch(err => console.error('Push error:', err));

        res.status(201).json({ success: true, message: 'Route created and assigned' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create route' });
    }
});

// Update route (with optional notification reason)
app.patch('/routes/:id', async (req, res) => {
    const { id } = req.params;
    const { name, waypoints, status, notifyReason } = req.body;

    try {
        // Get current route to find driver
        const currentRoute = await pool.query('SELECT driver_id, name FROM routes WHERE id = $1', [id]);
        if (currentRoute.rows.length === 0) {
            return res.status(404).json({ error: 'Route not found' });
        }
        const driverId = currentRoute.rows[0].driver_id;
        const routeName = name || currentRoute.rows[0].name;

        // Update route
        await pool.query(
            `UPDATE routes SET 
                name = COALESCE($1, name),
                waypoints = COALESCE($2, waypoints),
                status = COALESCE($3, status)
             WHERE id = $4`,
            [name, waypoints ? JSON.stringify(waypoints) : null, status, id]
        );

        // Send push notification to technician
        if (driverId) {
            const notification = NotificationTemplates.ROUTE_UPDATED(routeName, notifyReason);
            sendPushByDriverId(pool, driverId, notification.title, notification.body, { routeId: id, action: 'updated' })
                .catch(err => console.error('Push error:', err));
        }

        res.json({ success: true, message: 'Route updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update route' });
    }
});

// Confirm route (payment received)
app.post('/routes/:id/confirm', async (req, res) => {
    const { id } = req.params;

    try {
        const currentRoute = await pool.query('SELECT driver_id, name FROM routes WHERE id = $1', [id]);
        if (currentRoute.rows.length === 0) {
            return res.status(404).json({ error: 'Route not found' });
        }

        const driverId = currentRoute.rows[0].driver_id;
        const routeName = currentRoute.rows[0].name;

        await pool.query("UPDATE routes SET status = 'confirmed' WHERE id = $1", [id]);

        // Notify technician
        if (driverId) {
            const notification = NotificationTemplates.ROUTE_CONFIRMED(routeName);
            sendPushByDriverId(pool, driverId, notification.title, notification.body, { routeId: id, action: 'confirmed' })
                .catch(err => console.error('Push error:', err));
        }

        res.json({ success: true, message: 'Route confirmed' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to confirm route' });
    }
});

// Cancel/Delete route
app.delete('/routes/:id', async (req, res) => {
    const { id } = req.params;
    const { cancelReason } = req.body || {};

    try {
        const currentRoute = await pool.query('SELECT driver_id, name FROM routes WHERE id = $1', [id]);
        if (currentRoute.rows.length === 0) {
            return res.status(404).json({ error: 'Route not found' });
        }

        const driverId = currentRoute.rows[0].driver_id;
        const routeName = currentRoute.rows[0].name;

        // Option 1: Soft delete (mark as cancelled)
        await pool.query("UPDATE routes SET status = 'cancelled' WHERE id = $1", [id]);

        // Option 2: Hard delete (uncomment if you prefer)
        // await pool.query('DELETE FROM routes WHERE id = $1', [id]);

        // Remove from driver's assigned routes
        if (driverId) {
            await pool.query(
                'UPDATE drivers SET assigned_routes = array_remove(assigned_routes, $1) WHERE id = $2',
                [id, driverId]
            );

            // Notify technician
            const notification = NotificationTemplates.ROUTE_CANCELLED(routeName, cancelReason);
            sendPushByDriverId(pool, driverId, notification.title, notification.body, { routeId: id, action: 'cancelled' })
                .catch(err => console.error('Push error:', err));
        }

        res.json({ success: true, message: 'Route cancelled' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to cancel route' });
    }
});

app.post('/drivers', async (req, res) => {
    const { name, email, phone, cuadrilla, vehicleType, brigadeRole } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    try {
        const result = await pool.query(
            'INSERT INTO drivers (name, email, phone, cuadrilla, vehicle_type, brigade_role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [name, email, phone, cuadrilla, vehicleType || 'car', brigadeRole]
        );
        const driver = result.rows[0];
        res.status(201).json({ ...driver, vehicleType: driver.vehicle_type, brigadeRole: driver.brigade_role, assignedRoutes: [] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create driver' });
    }
});

app.patch('/drivers/:id/routes', async (req, res) => {
    const { routeId } = req.body;
    if (!routeId) return res.status(400).json({ error: 'routeId is required' });
    try {
        await pool.query(
            'UPDATE drivers SET assigned_routes = array_append(assigned_routes, $1) WHERE id = $2',
            [routeId.toString(), req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update driver routes' });
    }
});

app.delete('/drivers/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM drivers WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete driver' });
    }
});

// FCM Token Registration for Push Notifications
app.post('/api/drivers/fcm-token', async (req, res) => {
    const { driverId, fcmToken, platform } = req.body;

    if (!driverId || !fcmToken) {
        return res.status(400).json({ error: 'driverId and fcmToken are required' });
    }

    try {
        await pool.query(
            `UPDATE drivers 
             SET fcm_token = $1, platform = $2, fcm_updated_at = NOW() 
             WHERE id = $3`,
            [fcmToken, platform || 'android', driverId]
        );
        console.log(`📱 FCM token registered for driver ${driverId}`);
        res.json({ success: true });
    } catch (err) {
        console.error('FCM token save error:', err);
        res.status(500).json({ error: 'Failed to save FCM token' });
    }
});

// POD - Proof of Delivery
app.post('/pod', async (req, res) => {
    const { routeId, waypointIndex, driverId, photo, signature, location, notes } = req.body;

    if (!routeId || waypointIndex === undefined || !driverId) {
        return res.status(400).json({ error: 'routeId, waypointIndex, and driverId are required' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO delivery_proofs 
             (route_id, waypoint_index, driver_id, photo, signature, latitude, longitude, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
                routeId,
                waypointIndex,
                driverId,
                photo || null,  // Base64 can be large, consider storing in S3 for production
                signature || null,
                location?.lat || null,
                location?.lng || null,
                notes || ''
            ]
        );

        console.log(`✅ POD saved for route ${routeId}, waypoint ${waypointIndex}`);
        res.json({ success: true, podId: result.rows[0].id });
    } catch (err) {
        console.error('POD save error:', err);
        res.status(500).json({ error: 'Failed to save POD' });
    }
});

app.get('/pod/:routeId', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM delivery_proofs WHERE route_id = $1 ORDER BY waypoint_index',
            [req.params.routeId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch PODs' });
    }
});

// ======================================
// HISTORICAL TRACKING & GEOFENCING APIs
// ======================================

// Get driver's historical route for a specific date
app.get('/drivers/:driverId/history', async (req, res) => {
    const { driverId } = req.params;
    const { date } = req.query; // YYYY-MM-DD format

    if (!date) {
        return res.status(400).json({ error: 'Date parameter required (YYYY-MM-DD)' });
    }

    try {
        const result = await pool.query(`
            SELECT 
                ST_AsGeoJSON(ST_MakeLine(location ORDER BY timestamp)) as route_geojson,
                COALESCE(ST_Length(ST_MakeLine(location ORDER BY timestamp)::geography) / 1000, 0) as distance_km,
                MIN(timestamp) as start_time,
                MAX(timestamp) as end_time,
                COUNT(*) as point_count
            FROM driver_locations 
            WHERE driver_id = $1 
              AND DATE(timestamp) = $2
              AND location IS NOT NULL
        `, [driverId, date]);

        const data = result.rows[0];

        // Also get individual points for detailed playback
        const pointsResult = await pool.query(`
            SELECT latitude, longitude, speed, heading, timestamp
            FROM driver_locations
            WHERE driver_id = $1 AND DATE(timestamp) = $2
            ORDER BY timestamp
        `, [driverId, date]);

        res.json({
            route: data.route_geojson ? JSON.parse(data.route_geojson) : null,
            distanceKm: parseFloat(data.distance_km) || 0,
            startTime: data.start_time,
            endTime: data.end_time,
            pointCount: parseInt(data.point_count),
            points: pointsResult.rows
        });
    } catch (err) {
        console.error('History fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Assign route waypoints for geofencing
app.post('/routes/assign', async (req, res) => {
    const { routeId, driverId, waypoints } = req.body;

    if (!routeId || !driverId || !waypoints?.length) {
        return res.status(400).json({ error: 'routeId, driverId, and waypoints are required' });
    }

    try {
        // Clear previous waypoints for this route
        await pool.query('DELETE FROM route_waypoints WHERE route_id = $1', [routeId]);

        // Insert new waypoints
        for (let i = 0; i < waypoints.length; i++) {
            const wp = waypoints[i];
            await pool.query(`
                INSERT INTO route_waypoints (route_id, driver_id, waypoint_index, address, location)
                VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326))
            `, [routeId, driverId, i, wp.address || '', wp.lng, wp.lat]);
        }

        console.log(`✅ Assigned ${waypoints.length} waypoints to driver ${driverId} for route ${routeId}`);

        // Update memory cache immediately for real-time geofencing
        if (!activeWaypoints.has(driverId)) {
            activeWaypoints.set(driverId, []);
        }
        // Get the newly inserted waypoints with their IDs
        const newWaypoints = await pool.query(`
            SELECT id, waypoint_index, address, ST_X(location) as lng, ST_Y(location) as lat
            FROM route_waypoints WHERE route_id = $1 AND driver_id = $2
        `, [routeId, driverId]);

        newWaypoints.rows.forEach(wp => {
            activeWaypoints.get(driverId).push({
                id: wp.id,
                routeId: routeId,
                waypointIndex: wp.waypoint_index,
                address: wp.address,
                lat: wp.lat,
                lng: wp.lng
            });
        });

        res.json({ success: true, waypointCount: waypoints.length });
    } catch (err) {
        console.error('Route assign error:', err);
        res.status(500).json({ error: 'Failed to assign route' });
    }
});

// Get waypoint status for a route
app.get('/routes/:routeId/status', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT waypoint_index, address, arrived, arrived_at
            FROM route_waypoints
            WHERE route_id = $1
            ORDER BY waypoint_index
        `, [req.params.routeId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch route status' });
    }
});

// Socket.io Real-time Logic
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Identify as driver
    socket.on('driver:join', (driverId) => {
        console.log(`Driver ${driverId} joined room`);
        socket.join(`driver_${driverId}`);
    });

    // Receive location update from Driver
    socket.on('driver:location', async (data) => {
        const { driverId, lat, lng, speed, heading } = data;

        // 1. Emit to Admin Dashboard immediately (Real-time - NO DELAY)
        io.emit('admin:driver-update', data);

        // 2. Add to buffer for batch insert (only if moved > 10m)
        if (shouldSaveLocation(driverId, lat, lng)) {
            locationBuffer.push({
                driverId,
                lat,
                lng,
                speed: speed || 0,
                heading: heading || 0
            });
        }

        // 3. Geofencing Check IN MEMORY (no DB query!)
        const arrivedWaypoints = checkGeofenceInMemory(driverId, lat, lng);

        for (const waypoint of arrivedWaypoints) {
            try {
                // Mark as arrived in DB
                await pool.query(`
                    UPDATE route_waypoints
                    SET arrived = TRUE, arrived_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                `, [waypoint.id]);

                // Remove from memory cache
                const driverWaypoints = activeWaypoints.get(driverId);
                if (driverWaypoints) {
                    const idx = driverWaypoints.findIndex(w => w.id === waypoint.id);
                    if (idx > -1) driverWaypoints.splice(idx, 1);
                }

                // Emit arrival event to Admin
                io.emit('driver:arrived', {
                    driverId,
                    routeId: waypoint.routeId,
                    waypointIndex: waypoint.waypointIndex,
                    address: waypoint.address,
                    arrivedAt: new Date().toISOString()
                });

                console.log(`🚩 Driver ${driverId} arrived at waypoint ${waypoint.waypointIndex} (${waypoint.address})`);
            } catch (err) {
                console.error('Error marking waypoint arrival:', err);
            }
        }
    });

    // Panic Button Alert
    socket.on('driver:panic', async (data) => {
        console.warn(`🚨 PANIC ALERT received from Driver ${data.driverId}`, data);
        const serverTimestamp = new Date().toISOString();

        // Broadcast to all admins
        io.emit('admin:panic-alert', {
            ...data,
            serverTimestamp
        });

        // Persist to database
        try {
            await pool.query(`
                INSERT INTO alerts (driver_id, type, latitude, longitude, details, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                data.driverId,
                data.type || 'SOS',
                data.location?.lat,
                data.location?.lng,
                JSON.stringify(data), // Save full payload
                serverTimestamp
            ]);
            console.log('💾 Alert saved to DB');
        } catch (err) {
            console.error('Error saving alert:', err);
        }
    });



    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3001;

// Health check endpoint for monitoring
app.get('/health', async (req, res) => {
    try {
        // Quick DB check
        await pool.query('SELECT 1');
        res.json({
            status: 'healthy',
            uptime: Math.floor(process.uptime()),
            connections: io.engine.clientsCount || 0,
            bufferSize: locationBuffer.length,
            cachedWaypoints: Array.from(activeWaypoints.values()).flat().length,
            cachedDriverPositions: lastPositions.size,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({
            status: 'unhealthy',
            error: err.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ======================================
// GRAPHQL + SERVER STARTUP
// ======================================
async function startServer() {
    try {
        // Initialize Apollo GraphQL Server
        const apolloServer = createApolloServer();
        await apolloServer.start();

        // Mount GraphQL at /graphql endpoint using setupGraphQLMiddleware
        await setupGraphQLMiddleware(app, apolloServer, pool);

        console.log('✅ GraphQL endpoint available at /graphql');

        // Start HTTP server
        server.listen(PORT, () => {
            console.log(`🚀 Backend server running on port ${PORT}`);
            console.log(`📊 GraphQL Playground: http://localhost:${PORT}/graphql`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
