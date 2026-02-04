# Traceops - Manual de Despliegue y Migración

> ⚠️ **ARCHIVO PRIVADO** - Contiene credenciales reales, NO subir a repositorios públicos

## 📋 Variables de Entorno

### Backend (Easypanel)
```env
PORT=80
DATABASE_URL=postgres://postgres:5e56da087e6f571ab145@72.60.124.121:5433/dashboard?sslmode=disable
REDIS_URL=redis://default:Secso29%40@redis:6379
JWT_SECRET=traceops-super-secret-key-change-in-prod
```

### Frontend (Easypanel)
```env
VITE_BACKEND_URL=https://dashboard-backend.zvkdyr.easypanel.host
VITE_N8N_WEBHOOK_URL=https://n8n-n8n.zvkdyr.easypanel.host/webhook/proyecto-rutas
VITE_GOOGLE_MAPS_API_KEY=AIzaSyAjNacW2ioCzCuK-TcMmh7upwwDh5ntdpg
VITE_GEMINI_API_KEY=AIzaSyCGvwDklfBpu9we2oOwGMlbrzTgbO_1sKM
VITE_APP_URL=https://dashboard-frontend.zvkdyr.easypanel.host
```

---

## 🔑 Credenciales Completas

### PostgreSQL
```
Host: 72.60.124.121
Puerto: 5433
Database: dashboard
Usuario: postgres
Password: 5e56da087e6f571ab145
Connection String: postgres://postgres:5e56da087e6f571ab145@72.60.124.121:5433/dashboard
```

### Redis
```
Host: redis (interno Easypanel)
Puerto: 6379
Password: Secso29@
URL: redis://default:Secso29%40@redis:6379
```

### Easypanel Admin
```
URL: http://72.60.124.121:3000
```

---

## 🗄️ SQL de Inicialización

### Extensiones Requeridas
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Si usas TimescaleDB:
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

### Particionamiento de Ubicaciones (Escalabilidad)
```sql
-- Renombrar tabla actual
ALTER TABLE driver_locations RENAME TO driver_locations_old;

-- Crear tabla particionada
CREATE TABLE driver_locations (
    id SERIAL,
    driver_id INTEGER,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    speed DOUBLE PRECISION DEFAULT 0,
    heading DOUBLE PRECISION DEFAULT 0,
    location GEOMETRY(Point, 4326),
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Particiones mensuales
CREATE TABLE driver_locations_2026_02 PARTITION OF driver_locations
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE driver_locations_2026_03 PARTITION OF driver_locations
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- Índice para búsquedas rápidas
CREATE INDEX idx_driver_locations_driver_time 
ON driver_locations (driver_id, timestamp DESC);

-- Migrar datos existentes
INSERT INTO driver_locations 
SELECT * FROM driver_locations_old 
WHERE timestamp >= '2026-02-01';
```

### TimescaleDB - Inicialización Completa (USAR SI DB NUEVA)
```sql
-- 1. Extensiones
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabla drivers
CREATE TABLE IF NOT EXISTS drivers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'available',
    cuadrilla VARCHAR(100),
    assigned_routes TEXT[],
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla driver_locations como HYPERTABLE
CREATE TABLE IF NOT EXISTS driver_locations (
    id SERIAL,
    driver_id INTEGER,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    speed DOUBLE PRECISION DEFAULT 0,
    heading DOUBLE PRECISION DEFAULT 0,
    location GEOMETRY(Point, 4326),
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

SELECT create_hypertable('driver_locations', 'timestamp', if_not_exists => TRUE);

-- 4. Tabla routes
CREATE TABLE IF NOT EXISTS routes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    driver_id INTEGER,
    waypoints JSONB,
    geometry GEOMETRY(LineString, 4326),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabla route_waypoints
CREATE TABLE IF NOT EXISTS route_waypoints (
    id SERIAL PRIMARY KEY,
    route_id INTEGER,
    driver_id INTEGER,
    waypoint_index INTEGER,
    address TEXT,
    location GEOMETRY(Point, 4326),
    arrived BOOLEAN DEFAULT FALSE,
    arrived_at TIMESTAMPTZ
);

-- 6. Tabla alerts
CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER,
    type VARCHAR(50),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tabla brigades
CREATE TABLE IF NOT EXISTS brigades (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    type VARCHAR(100),
    members JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. Compresión automática para datos viejos (>7 días)
ALTER TABLE driver_locations SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'driver_id'
);

SELECT add_compression_policy('driver_locations', INTERVAL '7 days');
```

---

## 🐳 Imágenes Docker (Easypanel)

| Servicio | Imagen | Notas |
|----------|--------|-------|
| Backend | Build desde GitHub | Node 20 |
| Frontend | Build desde GitHub | Vite |
| PostgreSQL | `postgres:17` | O `timescale/timescaledb-ha:pg17` |
| Redis | `redis:7-alpine` | Password: Secso29@ |

---

## 🔗 URLs de Producción

| Servicio | URL |
|----------|-----|
| Frontend | https://dashboard-frontend.zvkdyr.easypanel.host |
| Backend | https://dashboard-backend.zvkdyr.easypanel.host |
| n8n | https://n8n-n8n.zvkdyr.easypanel.host |
| Easypanel | http://72.60.124.121:3000 |

---

## 📦 Repositorio Git

```bash
# Push cambios (PowerShell)
git add . ; git commit -m "mensaje" ; git push

# Forzar rebuild en Easypanel
# Ve a la app > Deploy > Rebuild
```

---

## 🚨 Troubleshooting

### Redis no conecta
- Verificar REDIS_URL (@ debe ser %40)
- Logs deben mostrar: `✅ Redis Adapter connected`

### Postgres versión incompatible
- NO cambiar de pg17 a pg16
- Usar `timescale/timescaledb-ha:pg17` para TimescaleDB

### TimescaleDB no carga
- Agregar variable: `POSTGRES_INITDB_ARGS=--shared_preload_libraries=timescaledb`
- O usar imagen `timescale/timescaledb-ha:pg17` (viene preconfigurada)

### Socket.io no sincroniza
- Verificar Redis está corriendo
- Verificar REDIS_URL en variables del backend
