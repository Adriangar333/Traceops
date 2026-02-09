# 📋 Análisis del proyecto Logistics Dashboard (TraceOps)

**Fecha:** Febrero 2026  
**Alcance:** `logistics-dashboard` (frontend, backend, móvil, documentación)

---

## 1. Resumen ejecutivo

**TraceOps** es una plataforma de gestión logística y operaciones de campo que incluye:

- **Dashboard web** para administradores (rutas, flota, inventario, SCRC, jornadas, configuración).
- **App móvil para conductores** (vista driver) con tracking GPS en tiempo real, POD (prueba de entrega) y botón de pánico.
- **App móvil para técnicos** (vista técnico) orientada a órdenes SCRC (suspensión, corte, reconexión, cobro), offline-first con SQLite.
- **Backend** con REST, Socket.io, GraphQL, PostgreSQL/PostGIS, Redis (opcional), Firebase (push).

Está desplegado en **Easypanel** (frontend, backend, n8n) y preparado para **Android** con Capacitor.

---

## 2. Stack tecnológico

| Capa | Tecnologías |
|------|-------------|
| **Frontend** | React 19, Vite 7, TailwindCSS 4, Wouter (rutas), MapLibre GL, Lucide, Sonner |
| **Móvil** | Capacitor 8 (Android), Background Geolocation, SQLite (técnicos), Camera |
| **Backend** | Node.js, Express 5, Socket.io 4, Apollo Server 5 (GraphQL), Helmet, CORS, rate-limit |
| **Base de datos** | PostgreSQL + PostGIS (opcional TimescaleDB), Redis (adapter Socket.io) |
| **Otros** | Firebase Admin (FCM push), n8n (webhooks), JWT (auth) |

---

## 3. Estructura del proyecto

```
logistics-dashboard/
├── src/                    # Frontend React
│   ├── App.jsx             # Rutas y auth global
│   ├── components/         # Pantallas y UI
│   ├── utils/              # Servicios (backend, mapas, n8n, sync, POD, etc.)
│   ├── services/           # DB y sync (técnicos)
│   └── lib/
├── backend/                # API Node
│   ├── index.js            # Express, Socket.io, DB init, rutas REST
│   ├── graphql/            # Apollo schema, resolvers, loaders
│   ├── middleware/         # auth, rateLimiter
│   ├── routes/             # auth, config, fleet, inventory, schedule, scrc, zones
│   ├── services/           # configService, routingEngine, zoneClassifier
│   └── utils/              # pushNotifications
├── android/                # Proyecto Capacitor Android
├── public/                 # PWA assets, manifest, sw.js
├── docs/                   # ZONE_CLASSIFICATION_ARCHITECTURE.md
├── .env.example
├── capacitor.config.json
├── vite.config.js
├── tailwind.config.js
├── vercel.json             # SPA rewrite (por si se usa Vercel)
├── Dockerfile.frontend
├── backend/Dockerfile
└── DEPLOYMENT.md           # Variables y URLs de producción
```

---

## 4. Funcionalidades por módulo

### 4.1 Autenticación

- **Login** en `/login`; token JWT guardado en `localStorage` (`authToken`, `user`).
- Middleware en backend: `authRequired`, `requireRole`, `optionalAuth`, `driverAuth`.
- Secret por defecto: `JWT_SECRET` (cambiar en producción).

### 4.2 Rutas y conductores (REST + Socket)

- **CRUD conductores**: `GET/POST/DELETE /drivers`, `PATCH /drivers/:id/routes`.
- **Rutas**: `POST /routes`, `PATCH /routes/:id`, `POST /routes/:id/confirm`, `DELETE /routes/:id`.
- **Waypoints y geofencing**: `POST /routes/assign`, `GET /routes/:routeId/status`.
- **Historial**: `GET /drivers/:driverId/history?date=YYYY-MM-DD`.
- **POD**: `POST /pod`, `GET /pod/:routeId`.
- **FCM**: `POST /api/drivers/fcm-token`.
- **Socket.io**: eventos `driver:join`, `driver:location`, `driver:panic`; el servidor hace broadcast a admins, buffer de ubicaciones (batch insert cada 30 s), geofencing en memoria (llegada a waypoints).

### 4.3 SCRC (Suspensión, Corte, Reconexión, Cobro)

- **Backend**: `backend/routes/scrcRoutes.js` (upload Excel, órdenes, brigadas, actualizaciones).
- **Base de datos**: tablas `scrc_orders`, `brigades`; migraciones y columnas de auditoría.
- **Motor de ruteo**: `routingEngine.js` (capacidades por brigada, prioridad por tipo de OS, tiempos estimados, patrones urbano/rural).
- **Frontend**: componente `SCRCPanel` importado en `App.jsx` pero **no hay ruta declarada para `/scrc`**; el enlace del menú lleva a 404. Conviene añadir `<Route path="/scrc" component={SCRCPanel} />`.

### 4.4 Zonas (clasificación geográfica)

- **Rutas**: `backend/routes/zones.js` bajo `/api/zones`.
- **Documentación**: `docs/ZONE_CLASSIFICATION_ARCHITECTURE.md` (Google, OSM, K-Means, cache, ROI).
- Servicio `zoneClassifier` en backend; arquitectura pensada para ETA y optimización por tipo de zona.

### 4.5 Jornadas y configuración

- **Horarios**: `scheduleRoutes.js` → `/api/schedules`.
- **Configuración**: `configRoutes.js` → `/api/config`; `configService` para configuración dinámica (SCR, matriz de brigadas, etc.).

### 4.6 Flota e inventario

- **Flota**: `fleetRoutes.js` → `/api/fleet` (vehículos, conductores, mantenimiento).
- **Inventario**: `inventoryRoutes.js` → `/api/inventory`.

### 4.7 GraphQL

- **Endpoint**: `/graphql` (Apollo Server 5).
- **Schema**: Drivers, Routes, Waypoints, POD, Location, DashboardStats.
- **Resolvers** y DataLoaders para evitar N+1.

### 4.8 Vista conductor (DriverView)

- Rutas: `/driver`, `/driver/:routeId` (sin auth obligatoria; se usa `driverId` por query).
- Tracking en tiempo real (Socket.io), MapLibre, geolocalización (Capacitor en nativo).
- POD por parada (foto/firma), sincronización offline, botón de pánico (SOS, cliente agresivo, predio cerrado, imposibilidad).
- Deep links: `traceops://driver/routes/:routeId`; redirección desde web móvil a app.

### 4.9 Vista técnico (TechnicianApp)

- Ruta: `/tecnico`.
- Login local; órdenes en SQLite (offline-first); sync con backend vía `SyncService` y `DatabaseService`.
- Formulario de ejecución con evidencia (OrderExecutionForm); navegación a Google Maps.

### 4.10 Integraciones externas

- **Backend**: `backendService.js` usa `API_URL` fija (`https://dashboard-backend.zvkdyr.easypanel.host`). No usa `VITE_BACKEND_URL`; en desarrollo puede requerir proxy o variable de entorno.
- **Mapas**: Google (Directions, Geocoding) y/o OSRM (map matching en frontend); MapLibre para renderizado.
- **n8n**: webhook en `n8nService.js` (envío de asignaciones y datos al workflow).
- **Gemini**: `geminiService.js` en frontend (posible uso para sugerencias o texto).
- **Push**: Firebase Admin en backend; FCM tokens en tabla `drivers`.

---

## 5. Base de datos (PostgreSQL)

- **Extensiones**: PostGIS; opcional TimescaleDB para `driver_locations`.
- **Tablas principales**: `drivers`, `driver_locations`, `routes`, `route_waypoints`, `delivery_proofs`, `alerts`, `brigades`, `scrc_orders`, y tablas de configuración/sistema.
- **Optimizaciones**: batch de ubicaciones (cada 30 s), limpieza de ubicaciones >30 días, cache en memoria de waypoints activos para geofencing, compresión TimescaleDB para datos antiguos.

---

## 6. Seguridad y despliegue

- **CORS**: orígenes permitidos definidos en backend (incluye localhost y dominio Easypanel); comentario indica “temporalmente permitir todos”.
- **Helmet** activo; CSP desactivada para el API.
- **Rate limiting**: `apiLimiter` y `publicLimiter` en rutas.
- **Credenciales**: `DEPLOYMENT.md` contiene URLs y secretos; es un archivo sensible (no subir a repositorios públicos).
- **Frontend**: `.env.example` con `VITE_*`; en producción se usan las variables de Easypanel según DEPLOYMENT.md.

---

## 7. Puntos fuertes

- Arquitectura clara: REST + Socket.io + GraphQL, módulos por dominio (SCRC, flota, inventario, zonas).
- Diseño offline-first en técnicos (SQLite + sync) y en driver (buffer y sync).
- Geofencing en memoria y batch de ubicaciones para reducir carga en DB.
- Documentación de arquitectura de zonas y despliegue (DEPLOYMENT.md).
- Móvil: Capacitor, deep links, FCM, botón de pánico y tipos de alerta.
- Configuración dinámica (configService) y motor de ruteo SCRC alineado con criterios técnicos.

---

## 8. Recomendaciones y posibles mejoras

| Prioridad | Tema | Acción sugerida |
|-----------|------|------------------|
| Alta | Ruta SCRC | Añadir en `App.jsx`: `<Route path="/scrc" component={SCRCPanel} />` dentro del layout autenticado. |
| Alta | URL del API en frontend | Usar `import.meta.env.VITE_BACKEND_URL` (o similar) en `backendService.js` en lugar de URL fija, y definirla en `.env` y en Easypanel. |
| Media | CORS | Dejar de permitir “todos” los orígenes; mantener solo la lista explícita de dominios. |
| Media | JWT | Asegurar `JWT_SECRET` fuerte y único en producción (ya indicado en DEPLOYMENT). |
| Media | Credenciales en DEPLOYMENT.md | Mover secretos a variables de entorno y dejar en el doc solo nombres de variables y ejemplos sin valores reales. |
| Baja | Tests | Añadir tests (Jest/Vitest en frontend, Jest/Mocha en backend) para rutas críticas y servicios. |
| Baja | Centro de llamadas | La ruta `/calls` está como “Próximamente”; implementar o ocultar del menú hasta que exista. |

---

## 9. Cómo arrancar el proyecto

**Backend (puerto 3001):**
```bash
cd backend
npm install
# Crear .env con DATABASE_URL, opcional REDIS_URL, JWT_SECRET, etc.
node index.js
```

**Frontend (Vite, normalmente 5173):**
```bash
npm install
# .env con VITE_GOOGLE_MAPS_API_KEY, VITE_BACKEND_URL (local o prod), etc.
npm run dev
```

**Android:**
```bash
npm run build
npx cap sync android
npx cap open android
```

---

## 10. Conclusión

El proyecto **logistics-dashboard** es una aplicación de gestión logística y de campo bien estructurada, con backend escalable (Redis, batch, geofencing en memoria), soporte móvil (conductores y técnicos) y módulo SCRC documentado. Las mejoras más impactantes y rápidas son: exponer la ruta `/scrc` en el router y centralizar la URL del backend en variables de entorno para entornos múltiples.
