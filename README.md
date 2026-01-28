# Traceops 🌍🚛

**Traceops** is a comprehensive logistics management platform designed for real-time route optimization, field agent tracking, and operational control.

## 🚀 Key Features

*   **Real-Time Tracking:** Live GPS monitoring of field agents using WebSocket technology.
*   **Route Optimization:** Intelligent route calculations using Google Maps & OSRM integration.
*   **Cross-Platform:**
    *   **Web Dashboard:** For administrators to assign routes and monitor operations.
    *   **Mobile App (Android):** For drivers/agents to receive routes and share location (Background Services enabled).
*   **Data Persistence:** PostgreSQL + PostGIS architecture for robust spatial data management.

## 🛠️ Technology Stack

*   **Frontend:** React, Vite, TailwindCSS, MapLibre GL.
*   **Mobile:** CapacitorJS (Native Android integration).
*   **Backend:** Node.js, Express, Socket.io.
*   **Database:** PostgreSQL (PostGIS enabled).
*   **Infrastructure:** Dockerized services compatible with Coolify/EasyPanel.

## 📦 Deployment

### Backend (VPS)
The backend is containerized. Deploy simply using the provided `backend/Dockerfile`.
*   **Port:** 3001
*   **Env Vars:** `DATABASE_URL` (Postgres Connection String).

### Mobile (Android)
```bash
npm run build
npx cap sync android
npx cap open android
```

---
*Powered by Traceops Systems © 2026*
