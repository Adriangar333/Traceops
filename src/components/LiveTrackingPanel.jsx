import React, { useState, useEffect, useRef } from 'react';
import { Users, Radio, MapPin, Clock, RefreshCw, Calendar, Route, Bell } from 'lucide-react';
import { io } from 'socket.io-client';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getDriverHistory } from '../utils/backendService';

// Vehicle Icons (SVG Strings)
const VEHICLE_ICONS = {
    // Moto (Cuadrilla Liviana)
    liviana: (initials) => `
        <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
            <div style="background:#10b981;border:2px solid white;border-radius:50%;width:36px;height:36px;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:2;">
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>
            </div>
            <div style="position:absolute;bottom:-6px;background:#064e3b;color:white;font-size:10px;padding:1px 4px;border-radius:4px;font-weight:bold;z-index:3;white-space:nowrap;border:1px solid white;">${initials}</div>
        </div>`,

    // Camioneta/Pickup (Cuadrilla Mediana)
    mediana: (initials) => `
         <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
            <div style="background:#f59e0b;border:2px solid white;border-radius:50%;width:36px;height:36px;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:2;">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>
            </div>
            <div style="position:absolute;bottom:-6px;background:#78350f;color:white;font-size:10px;padding:1px 4px;border-radius:4px;font-weight:bold;z-index:3;white-space:nowrap;border:1px solid white;">${initials}</div>
        </div>`,

    // Camión Canastilla (Cuadrilla Pesada)
    pesada: (initials) => `
         <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
             <div style="background:#ef4444;border:2px solid white;border-radius:50%;width:36px;height:36px;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:2;">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            </div>
            <div style="position:absolute;top:-8px;right:-4px;background:#1e293b;color:#fbbf24;font-size:10px;padding:2px;border-radius:50%;border:1px solid white;z-index:4;">⚡</div>
            <div style="position:absolute;bottom:-6px;background:#7f1d1d;color:white;font-size:10px;padding:1px 4px;border-radius:4px;font-weight:bold;z-index:3;white-space:nowrap;border:1px solid white;">${initials}</div>
        </div>`,

    // Default (Generic Driver)
    default: (initials) => `
        <div style="
            background: #3b82f6;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            color: white;
            text-transform: uppercase;
        ">
            ${initials}
        </div>
    `
};

const BACKEND_URL = 'https://dashboard-backend.zvkdyr.easypanel.host';

const LiveTrackingPanel = ({ isOpen, onClose, driversList = [] }) => {
    const [activeDrivers, setActiveDrivers] = useState({});
    const [selectedDriver, setSelectedDriver] = useState(null);
    const [arrivals, setArrivals] = useState([]);
    const [historyDate, setHistoryDate] = useState('');
    const [historyData, setHistoryData] = useState(null);
    const [showHistory, setShowHistory] = useState(false);
    const mapContainer = useRef(null);
    const map = useRef(null);
    const markers = useRef({});
    const historyLayerRef = useRef(null);
    const socketRef = useRef(null);

    // Resolve driver name and cuadrilla
    const resolveDriverInfo = (driverId) => {
        if (!driversList.length) return { name: driverId, cuadrilla: '' };

        // Handle various ID formats (123, "123", "driver-123")
        const cleanId = driverId.toString().replace('driver-', '');

        const agent = driversList.find(a =>
            a.id.toString() === cleanId ||
            a.id.toString() === driverId
        );

        if (agent) {
            return {
                name: agent.name,
                cuadrilla: agent.cuadrilla || 'General',
                phone: agent.phone
            };
        }

        // If no match, return ID
        return { name: driverId, cuadrilla: 'Externo' };
    };

    // Initialize map
    useEffect(() => {
        if (!isOpen || !mapContainer.current || map.current) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
            center: [-74.8061, 10.9961], // Barranquilla
            zoom: 12
        });

        map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

        return () => {
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, [isOpen]);

    // Socket connection for real-time updates
    useEffect(() => {
        if (!isOpen) return;

        socketRef.current = io(BACKEND_URL);

        socketRef.current.on('connect', () => {
            console.log('📡 Connected to tracking server');
        });

        socketRef.current.on('admin:driver-update', (data) => {
            console.log('🚗 Driver update:', data);
            setActiveDrivers(prev => ({
                ...prev,
                [data.driverId]: {
                    ...data,
                    lastUpdate: new Date()
                }
            }));

            // Update marker on map
            updateDriverMarker(data);
        });

        // Listen for arrival notifications
        socketRef.current.on('driver:arrived', (data) => {
            console.log('🚩 Arrival:', data);
            setArrivals(prev => [data, ...prev].slice(0, 10)); // Keep last 10
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [isOpen]);

    // Load history when date or driver changes
    const loadHistory = async () => {
        if (!selectedDriver || !historyDate) return;

        const data = await getDriverHistory(selectedDriver, historyDate);
        if (data && data.route) {
            setHistoryData(data);
            setShowHistory(true);
            drawHistoryRoute(data.route);
        } else {
            setHistoryData(null);
            alert('No hay datos para esta fecha');
        }
    };

    const drawHistoryRoute = (routeGeoJson) => {
        if (!map.current) return;

        // Remove existing history layer
        if (historyLayerRef.current) {
            if (map.current.getLayer('history-route')) map.current.removeLayer('history-route');
            if (map.current.getSource('history-route')) map.current.removeSource('history-route');
        }

        map.current.addSource('history-route', {
            type: 'geojson',
            data: {
                type: 'Feature',
                properties: {},
                geometry: routeGeoJson
            }
        });

        map.current.addLayer({
            id: 'history-route',
            type: 'line',
            source: 'history-route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#f59e0b', 'line-width': 4, 'line-opacity': 0.8 }
        });

        historyLayerRef.current = true;

        // Fit map to route bounds
        if (routeGeoJson.coordinates?.length > 0) {
            const bounds = routeGeoJson.coordinates.reduce((bounds, coord) => {
                return bounds.extend(coord);
            }, new maplibregl.LngLatBounds(routeGeoJson.coordinates[0], routeGeoJson.coordinates[0]));
            map.current.fitBounds(bounds, { padding: 50 });
        }
    };

    const updateDriverMarker = (driver) => {
        if (!map.current) return;

        const markerId = driver.driverId;

        if (markers.current[markerId]) {
            // Update existing marker
            markers.current[markerId].setLngLat([driver.lng, driver.lat]);
        } else {
            // Create new marker
            const el = document.createElement('div');
            const info = resolveDriverInfo(driver.driverId);
            // Get initials or fallback to ID
            const initials = info.name === driver.driverId
                ? (typeof driver.driverId === 'string' ? driver.driverId.substring(0, 2) : 'D')
                : info.name.split(' ').map(n => n[0]).join('').substring(0, 2);

            el.className = 'driver-marker-container'; // Add class for potential CSS styling

            const cuadrillaType = (info.cuadrilla || '').toLowerCase();
            let iconHtml = VEHICLE_ICONS.default(initials);

            if (cuadrillaType.includes('liviana') || cuadrillaType.includes('moto')) {
                iconHtml = VEHICLE_ICONS.liviana(initials);
            } else if (cuadrillaType.includes('mediana') || cuadrillaType.includes('camioneta')) {
                iconHtml = VEHICLE_ICONS.mediana(initials);
            } else if (cuadrillaType.includes('pesada') || cuadrillaType.includes('camion') || cuadrillaType.includes('grua')) {
                iconHtml = VEHICLE_ICONS.pesada(initials);
            }

            el.innerHTML = iconHtml;

            const marker = new maplibregl.Marker({ element: el })
                .setLngLat([driver.lng, driver.lat])
                .addTo(map.current);

            el.addEventListener('click', () => {
                setSelectedDriver(driver.driverId);
                map.current.flyTo({ center: [driver.lng, driver.lat], zoom: 15 });
            });

            markers.current[markerId] = marker;
        }
    };

    const formatLastUpdate = (date) => {
        if (!date) return 'Nunca';
        const seconds = Math.floor((new Date() - date) / 1000);
        if (seconds < 60) return `Hace ${seconds}s`;
        if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)}m`;
        return `Hace ${Math.floor(seconds / 3600)}h`;
    };

    if (!isOpen) return null;

    const driverList = Object.values(activeDrivers);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* Header */}
            <div style={{
                padding: '16px 20px',
                background: '#ffffff',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Radio size={24} color="#9DBD39" />
                    <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.25rem', fontWeight: 700 }}>
                        Rastreo en Vivo
                    </h2>
                    <span style={{
                        background: '#9DBD39',
                        color: 'white',
                        padding: '4px 10px',
                        borderRadius: 12,
                        fontSize: '0.8rem',
                        fontWeight: 600
                    }}>
                        {driverList.length} activo{driverList.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        color: '#64748b',
                        padding: '8px 16px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 500
                    }}
                >
                    Cerrar
                </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Driver List */}
                <div style={{
                    width: 320,
                    background: '#f8fafc',
                    borderRight: '1px solid #e2e8f0',
                    overflowY: 'auto',
                    padding: 16
                }}>
                    <h3 style={{ color: '#64748b', margin: '0 0 16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                        <Users size={16} /> Conductores Activos
                    </h3>

                    {driverList.length === 0 ? (
                        <div style={{
                            padding: 20,
                            textAlign: 'center',
                            color: '#64748b'
                        }}>
                            <RefreshCw size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
                            <p style={{ margin: 0 }}>
                                No hay conductores transmitiendo ubicación.
                            </p>
                            <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>
                                Aparecerán cuando inicien una ruta.
                            </p>
                        </div>
                    ) : (
                        driverList.map(driver => (
                            <div
                                key={driver.driverId}
                                onClick={() => {
                                    setSelectedDriver(driver.driverId);
                                    if (map.current) {
                                        map.current.flyTo({ center: [driver.lng, driver.lat], zoom: 15 });
                                    }
                                }}
                                style={{
                                    padding: 12,
                                    background: selectedDriver === driver.driverId ? '#ffffff' : 'transparent',
                                    borderRadius: 8,
                                    marginBottom: 8,
                                    cursor: 'pointer',
                                    border: selectedDriver === driver.driverId ? '1px solid #9DBD39' : '1px solid transparent',
                                    boxShadow: selectedDriver === driver.driverId ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: '50%',
                                        background: '#9DBD39',
                                        boxShadow: '0 0 8px #9DBD39'
                                    }} />
                                    <div>
                                        <span style={{ color: '#0f172a', fontWeight: 600, display: 'block' }}>
                                            {resolveDriverInfo(driver.driverId).name}
                                        </span>
                                        {resolveDriverInfo(driver.driverId).cuadrilla && (
                                            <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, display: 'inline-block', marginTop: 2, border: '1px solid #e2e8f0' }}>
                                                {resolveDriverInfo(driver.driverId).cuadrilla}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, color: '#64748b', fontSize: '0.8rem' }}>
                                    <MapPin size={12} />
                                    <span>{driver.lat?.toFixed(5)}, {driver.lng?.toFixed(5)}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, color: '#94a3b8', fontSize: '0.75rem' }}>
                                    <Clock size={12} />
                                    <span>{formatLastUpdate(driver.lastUpdate)}</span>
                                    {driver.speed && (
                                        <span style={{ marginLeft: 8 }}>
                                            {Math.round(driver.speed * 3.6)} km/h
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Map */}
                <div style={{ flex: 1, position: 'relative' }}>
                    <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

                    {/* History Stats Overlay */}
                    {showHistory && historyData && (
                        <div style={{
                            position: 'absolute',
                            top: 16,
                            left: 16,
                            background: 'rgba(30,41,59,0.95)',
                            padding: 16,
                            borderRadius: 12,
                            border: '1px solid #334155',
                            color: 'white'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <Route size={18} color="#f59e0b" />
                                <span style={{ fontWeight: 600 }}>Historial de Ruta</span>
                                <button
                                    onClick={() => {
                                        setShowHistory(false);
                                        if (map.current?.getLayer('history-route')) {
                                            map.current.removeLayer('history-route');
                                            map.current.removeSource('history-route');
                                        }
                                    }}
                                    style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                                >✕</button>
                            </div>
                            <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
                                <p style={{ margin: '4px 0' }}>📏 Distancia: <strong style={{ color: '#10b981' }}>{historyData.distanceKm.toFixed(2)} km</strong></p>
                                <p style={{ margin: '4px 0' }}>📍 Puntos: {historyData.pointCount}</p>
                                {historyData.startTime && (
                                    <p style={{ margin: '4px 0' }}>🕐 {new Date(historyData.startTime).toLocaleTimeString()} - {new Date(historyData.endTime).toLocaleTimeString()}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Arrivals Notifications */}
                    {arrivals.length > 0 && (
                        <div style={{
                            position: 'absolute',
                            top: 16,
                            right: 60,
                            maxWidth: 300,
                            maxHeight: 200,
                            overflowY: 'auto',
                            background: 'rgba(30,41,59,0.95)',
                            borderRadius: 12,
                            border: '1px solid #10b981',
                            padding: 12
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', marginBottom: 8 }}>
                                <Bell size={16} />
                                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Llegadas Recientes</span>
                            </div>
                            {arrivals.map((a, i) => (
                                <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #334155', fontSize: '0.8rem', color: '#e2e8f0' }}>
                                    🚩 <strong>{a.driverId.slice(-8)}</strong> llegó a Punto #{a.waypointIndex + 1}
                                    <div style={{ color: '#64748b', fontSize: '0.7rem' }}>{a.address?.slice(0, 40) || 'Sin dirección'}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Date Picker for History */}
                    {selectedDriver && (
                        <div style={{
                            position: 'absolute',
                            bottom: 16,
                            left: 16,
                            background: 'rgba(30,41,59,0.95)',
                            padding: 12,
                            borderRadius: 8,
                            display: 'flex',
                            gap: 8,
                            alignItems: 'center'
                        }}>
                            <Calendar size={18} color="#94a3b8" />
                            <input
                                type="date"
                                value={historyDate}
                                onChange={(e) => setHistoryDate(e.target.value)}
                                style={{
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    borderRadius: 6,
                                    padding: '6px 10px',
                                    color: 'white'
                                }}
                            />
                            <button
                                onClick={loadHistory}
                                style={{
                                    background: '#f59e0b',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '6px 12px',
                                    color: '#0f172a',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Ver Historial
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LiveTrackingPanel;
