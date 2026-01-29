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

// Initialize Database Schema
const initDB = async () => {
    try {
        const client = await pool.connect();
        console.log('✅ Connected to PostgreSQL + PostGIS');

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
                status TEXT DEFAULT 'idle',
                assigned_routes TEXT[] DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
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

        client.release();
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

app.post('/drivers', async (req, res) => {
    const { name, email, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    try {
        const result = await pool.query(
            'INSERT INTO drivers (name, email, phone) VALUES ($1, $2, $3) RETURNING *',
            [name, email, phone]
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
        console.log(`📍 Update from ${driverId}:`, lat, lng);

        // 1. Emit to Admin Dashboard immediately (Real-time)
        io.emit('admin:driver-update', data);

        // 2. Save to PostgreSQL (PostGIS)
        try {
            await pool.query(
                `INSERT INTO driver_locations (driver_id, latitude, longitude, speed, heading, location)
                 VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($3, $2), 4326))`,
                [driverId, lat, lng, speed || 0, heading || 0]
            );
        } catch (err) {
            console.error('Error saving location:', err);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Backend server running on port ${PORT}`);
});
