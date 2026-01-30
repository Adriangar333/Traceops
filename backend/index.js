require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all for dev, restrict in prod
        methods: ["GET", "POST"]
    }
});

// Database Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false // Disable SSL for now as requested in query string
});

// ======================================
// SCALABILITY OPTIMIZATIONS
// ======================================

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

        // Create table if not exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS driver_locations (
                id SERIAL PRIMARY KEY,
                driver_id TEXT NOT NULL,
                latitude FLOAT NOT NULL,
                longitude FLOAT NOT NULL,
                speed FLOAT,
                heading FLOAT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                location GEOMETRY(POINT, 4326)
            );
        `);
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
        // Ensure column exists (migration)
        await client.query(`
            ALTER TABLE drivers 
            ADD COLUMN IF NOT EXISTS cuadrilla TEXT;
        `);
        console.log('✅ Table drivers ready');

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
        console.log('✅ Geospatial indexes ready');

        client.release();

        // Load active waypoints into memory cache after DB init
        await loadActiveWaypoints();
    } catch (err) {
        console.error('❌ Database connection error:', err);
    }
};

initDB();

// API Routes for Drivers
app.get('/drivers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM drivers ORDER BY created_at DESC');
        // Convert snake_case to camelCase for frontend compatibility if needed, 
        // or just ensure frontend handles it. 
        // Map assigned_routes to assignedRoutes
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

// Get routes assigned to a specific driver
app.get('/drivers/:id/routes', async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM routes WHERE driver_id = $1 AND status != 'completed' ORDER BY created_at DESC",
            [req.params.id]
        );
        res.json(result.rows);
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

        res.status(201).json({ success: true, message: 'Route created and assigned' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create route' });
    }
});

app.post('/drivers', async (req, res) => {
    const { name, email, phone, cuadrilla } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    try {
        const result = await pool.query(
            'INSERT INTO drivers (name, email, phone, cuadrilla) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, email, phone, cuadrilla]
        );
        const driver = result.rows[0];
        res.status(201).json({ ...driver, assignedRoutes: [] });
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

server.listen(PORT, () => {
    console.log(`🚀 Backend server running on port ${PORT}`);
});
