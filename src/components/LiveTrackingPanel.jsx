import React, { useState, useEffect, useRef } from 'react';
import { Users, Radio, MapPin, Clock, RefreshCw } from 'lucide-react';
import { io } from 'socket.io-client';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const BACKEND_URL = 'https://dashboard-backend.zvkdyr.easypanel.host';

const LiveTrackingPanel = ({ isOpen, onClose }) => {
    const [activeDrivers, setActiveDrivers] = useState({});
    const [selectedDriver, setSelectedDriver] = useState(null);
    const mapContainer = useRef(null);
    const map = useRef(null);
    const markers = useRef({});
    const socketRef = useRef(null);

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

        socketRef.current.on('driver:update', (data) => {
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

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [isOpen]);

    const updateDriverMarker = (driver) => {
        if (!map.current) return;

        const markerId = driver.driverId;

        if (markers.current[markerId]) {
            // Update existing marker
            markers.current[markerId].setLngLat([driver.lng, driver.lat]);
        } else {
            // Create new marker
            const el = document.createElement('div');
            el.innerHTML = `
                <div style="
                    background: linear-gradient(135deg, #10b981, #059669);
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                ">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                    </svg>
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
                                    <span style={{ color: 'white', fontWeight: 500 }}>
                                        {driver.driverId}
                                    </span>
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
                </div>
            </div>
        </div>
    );
};

export default LiveTrackingPanel;
