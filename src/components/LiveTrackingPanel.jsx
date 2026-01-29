import React, { useState, useEffect, useRef } from 'react';
import { Users, Radio, MapPin, Clock, RefreshCw, Calendar, Route, Bell } from 'lucide-react';
import { io } from 'socket.io-client';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getDriverHistory } from '../utils/backendService';

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

            el.innerHTML = `
                <div style="
                    background: #10b981;
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
            `;

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
                background: '#1e293b',
                borderBottom: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Radio size={24} color="#10b981" />
                    <h2 style={{ margin: 0, color: 'white', fontSize: '1.25rem' }}>
                        Rastreo en Vivo
                    </h2>
                    <span style={{
                        background: '#10b981',
                        color: 'white',
                        padding: '4px 10px',
                        borderRadius: 12,
                        fontSize: '0.8rem'
                    }}>
                        {driverList.length} activo{driverList.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: '#334155',
                        border: 'none',
                        color: 'white',
                        padding: '8px 16px',
                        borderRadius: 8,
                        cursor: 'pointer'
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
                    background: '#1e293b',
                    borderRight: '1px solid #334155',
                    overflowY: 'auto',
                    padding: 16
                }}>
                    <h3 style={{ color: '#94a3b8', margin: '0 0 16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8 }}>
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
                                    background: selectedDriver === driver.driverId ? '#334155' : 'transparent',
                                    borderRadius: 8,
                                    marginBottom: 8,
                                    cursor: 'pointer',
                                    border: selectedDriver === driver.driverId ? '1px solid #10b981' : '1px solid transparent'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: '50%',
                                        background: '#10b981',
                                        boxShadow: '0 0 8px #10b981'
                                    }} />
                                    <div>
                                        <span style={{ color: 'white', fontWeight: 500, display: 'block' }}>
                                            {resolveDriverInfo(driver.driverId).name}
                                        </span>
                                        {resolveDriverInfo(driver.driverId).cuadrilla && (
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4, display: 'inline-block', marginTop: 2 }}>
                                                {resolveDriverInfo(driver.driverId).cuadrilla}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, color: '#94a3b8', fontSize: '0.8rem' }}>
                                    <MapPin size={12} />
                                    <span>{driver.lat?.toFixed(5)}, {driver.lng?.toFixed(5)}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, color: '#64748b', fontSize: '0.75rem' }}>
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
