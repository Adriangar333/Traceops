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
        console.log('✅ Table driver_locations ready');
        client.release();
    } catch (err) {
        console.error('❌ Database connection error:', err);
    }
};

initDB();

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
