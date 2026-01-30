import React, { useState, useEffect, useRef } from 'react';
import { Navigation, CheckCircle, Radio, Camera, Wifi, WifiOff, CloudOff, RefreshCw } from 'lucide-react';
import { io } from 'socket.io-client';
import { Toaster, toast } from 'sonner';
import { TrackingService } from '../utils/trackingService';
import { getDriverRoutes, getDrivers } from '../utils/backendService';
import { initAutoSync, getPendingCount, syncPending, onSyncEvent, isOnline } from '../utils/offlineSyncService';
import PODModal from './PODModal';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const DriverView = ({ params }) => {
    const { routeId } = params;
    const [route, setRoute] = useState(null);
    const [availableRoutes, setAvailableRoutes] = useState([]); // Multiple routes fallback
    const [driversList, setDriversList] = useState([]); // For Login Screen
    const [loading, setLoading] = useState(true);
    const [completedStops, setCompletedStops] = useState([]);
    const [isTracking, setIsTracking] = useState(false);
    const [mapStyle, setMapStyle] = useState('https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json');
    const mapContainer = useRef(null);
    const map = useRef(null);
    const driverMarkerRef = useRef(null);
    const [viewMode, setViewMode] = useState('map'); // 'map' or 'list'

    // GPS Status for debugging (especially iOS)
    const [gpsPings, setGpsPings] = useState(0);
    const [lastGpsError, setLastGpsError] = useState(null);

    // POD Modal state
    const [podModal, setPodModal] = useState({ isOpen: false, waypointIndex: null });

    // Offline sync state
    const [pendingCount, setPendingCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const [networkStatus, setNetworkStatus] = useState(navigator.onLine);

    // Get driverId from URL params or generate one
    const searchParams = new URLSearchParams(window.location.search);
    const driverId = searchParams.get('driverId');

    // Check if we are native
    const isNative = window.Capacitor && window.Capacitor.isNative;

    useEffect(() => {
        const load = async () => {
            setLoading(true);

            // 1. Try URL query 'data' (Stateless mode for mobile)
            const searchParams = new URLSearchParams(window.location.search);
            const dataParam = searchParams.get('data');

            if (dataParam) {
                try {
                    const decodedData = JSON.parse(decodeURIComponent(dataParam));
                    setRoute(decodedData);
                    setLoading(false);
                    return;
                } catch (e) {
                    console.error('Error parsing route data from URL:', e);
                    toast.error('Error al leer datos de la ruta');
                }
            }

            // 2. Try fetching Active Routes for Driver ID (Persistent Link)
            // If we have a driverId (from URL or LocalStorage fallback/check)
            // Note: We don't check localStorage for ID here because we want to force Login if URL is clean
            // BUT for better UX, we could check localStorage 'traceops_driver_id'

            let effectiveDriverId = driverId;
            if (!effectiveDriverId) {
                effectiveDriverId = localStorage.getItem('traceops_driver_id');
            }

            if (effectiveDriverId && !routeId) {
                try {
                    const routes = await getDriverRoutes(effectiveDriverId);
                    if (routes && routes.length > 0) {
                        if (routes.length === 1) {
                            setRoute(routes[0]);
                        } else {
                            setAvailableRoutes(routes);
                        }
                        setLoading(false);
                        return;
                    }
                    // If ID exists but no routes, we might still want to show "No routes assigned" for specific driver
                    // or allow changing driver. For now, let's just fall through.
                } catch (e) {
                    console.error('Error fetching driver routes:', e);
                }
            }

            // 3. Fallback: Try localStorage Route (Works only on same device as Admin/Legacy)
            const savedRoutes = JSON.parse(localStorage.getItem('logisticsRoutes') || '[]');
            const foundRoute = savedRoutes.find(r => r.id.toString() === routeId);

            if (foundRoute) {
                setRoute(foundRoute);
            } else {
                // If we are here: No Route URL, No Driver ID (or no routes for it), No Legacy Route
                // Fetch drivers list to show Login Screen
                if (!effectiveDriverId && !dataParam && !routeId) {
                    try {
                        const drivers = await getDrivers();
                        setDriversList(drivers);
                    } catch (e) {
                        console.error('Error fetching drivers for login:', e);
                    }
                }
            }
            setLoading(false);
        };
        load();
    }, [routeId]);

    // Initialize offline sync and listen for events
    useEffect(() => {
        initAutoSync();
        setPendingCount(getPendingCount());

        // Listen for sync events
        const unsubscribe = onSyncEvent((event) => {
            if (event.type === 'queued') {
                setPendingCount(event.count);
                toast.info(`📦 Entrega guardada (${event.count} pendientes)`);
            } else if (event.type === 'syncing') {
                setIsSyncing(true);
                toast.loading(`Sincronizando ${event.count} entregas...`);
            } else if (event.type === 'complete') {
                setIsSyncing(false);
                setPendingCount(event.remaining);
                toast.dismiss();
                if (event.synced > 0) {
                    toast.success(`✅ ${event.synced} entregas sincronizadas`);
                }
                if (event.failed > 0) {
                    toast.warning(`⚠️ ${event.failed} entregas fallaron`);
                }
            } else if (event.type === 'offline') {
                setNetworkStatus(false);
            }
        });

        // Listen for online/offline changes
        const handleOnline = () => {
            setNetworkStatus(true);
            toast.success('📶 Conexión restaurada!');
        };
        const handleOffline = () => {
            setNetworkStatus(false);
            toast.warning('📵 Sin conexión - Las entregas se guardarán localmente');
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            unsubscribe();
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const handleDriverLogin = (selectedId) => {
        if (!selectedId) return;
        localStorage.setItem('traceops_driver_id', selectedId);
        // Reload with driverId param to trigger flow
        window.location.replace(`/driver?driverId=${selectedId}`);
    };

    // Initialize Map
    useEffect(() => {
        if (!mapContainer.current || !route || loading) return;
        if (map.current) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: mapStyle, // Default dark
            center: [-74.8061, 10.9961], // Barranquilla default
            zoom: 12,
            attributionControl: false
        });

        map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

        // Add Geolocation Control
        const geolocateControl = new maplibregl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
            showUserHeading: true
        });
        map.current.addControl(geolocateControl, 'top-right');


        map.current.on('load', () => {
            // Add Route Line
            if (route.waypoints && route.waypoints.length > 1) {
                const coordinates = route.waypoints.map(wp => [wp.lng, wp.lat]);

                // Fit bounds
                const bounds = new maplibregl.LngLatBounds();
                coordinates.forEach(coord => bounds.extend(coord));
                map.current.fitBounds(bounds, { padding: 50 });

                map.current.addSource('route', {
                    'type': 'geojson',
                    'data': {
                        'type': 'Feature',
                        'properties': {},
                        'geometry': {
                            'type': 'LineString',
                            'coordinates': coordinates
                        }
                    }
                });

                map.current.addLayer({
                    'id': 'route',
                    'type': 'line',
                    'source': 'route',
                    'layout': {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    'paint': {
                        'line-color': '#3b82f6',
                        'line-width': 4
                    }
                });

                // Add Waypoint Markers
                route.waypoints.forEach((wp, index) => {
                    const el = document.createElement('div');
                    el.className = 'waypoint-marker';
                    el.innerHTML = `<div style="background: #3b82f6; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; border: 2px solid white;">${index + 1}</div>`;

                    new maplibregl.Marker({ element: el })
                        .setLngLat([wp.lng, wp.lat])
                        .setPopup(new maplibregl.Popup().setHTML(`<b>Parada ${index + 1}</b><br>${wp.address || ''}`))
                        .addTo(map.current);
                });
            }
        });

        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, [route, loading]);

    // Update Map Style
    useEffect(() => {
        if (map.current) {
            map.current.setStyle(mapStyle);
            // Re-add layers after style change would be needed in a real robust impl, 
            // usually better to add sources/layers on 'style.load' event. 
            // For simplicity in this quick impl, we might lose layers on switch or need to reload.
            // A quick fix is to persist layers or just warn. 
            // Better approach:
            map.current.once('style.load', () => {
                if (route && route.waypoints && route.waypoints.length > 1) {
                    const coordinates = route.waypoints.map(wp => [wp.lng, wp.lat]);
                    if (!map.current.getSource('route')) {
                        map.current.addSource('route', {
                            'type': 'geojson',
                            'data': {
                                'type': 'Feature',
                                'properties': {},
                                'geometry': {
                                    'type': 'LineString',
                                    'coordinates': coordinates
                                }
                            }
                        });
                        map.current.addLayer({
                            'id': 'route',
                            'type': 'line',
                            'source': 'route',
                            'layout': { 'line-join': 'round', 'line-cap': 'round' },
                            'paint': { 'line-color': '#3b82f6', 'line-width': 4 }
                        });
                    }
                }
            });
        }
    }, [mapStyle]);


    const toggleTracking = async () => {
        if (isTracking) {
            await TrackingService.stopTracking();
            setIsTracking(false);
            setGpsPings(0);
            setLastGpsError(null);
            toast.info('Rastreo detenido');
        } else {
            toast.loading('Solicitando permiso de ubicación...');
            const success = await TrackingService.startTracking((location, error) => {
                if (error) {
                    // Capture error for display (especially useful for iOS debugging)
                    setLastGpsError(error.message || 'Error de GPS');
                    console.error('🚫 GPS Error:', error);
                    return;
                }

                if (location) {
                    // Clear any previous error
                    setLastGpsError(null);

                    // Increment ping counter for visual feedback
                    setGpsPings(prev => prev + 1);

                    // Send to Production Backend
                    if (!window.socket) {
                        window.socket = io('https://dashboard-backend.zvkdyr.easypanel.host');
                    }

                    const payload = {
                        driverId: driverId, // Dynamic driver ID from URL
                        lat: location.latitude,
                        lng: location.longitude,
                        speed: location.speed,
                        heading: location.heading || 0
                    };

                    console.log('📡 Sending to Global Backend:', payload);
                    window.socket.emit('driver:location', payload);

                    // Update local user marker on map
                    if (map.current) {
                        if (!driverMarkerRef.current) {
                            const el = document.createElement('div');
                            el.innerHTML = '<div style="background: #10b981; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(16,185,129,0.5);"></div>';
                            driverMarkerRef.current = new maplibregl.Marker({ element: el })
                                .setLngLat([location.longitude, location.latitude])
                                .addTo(map.current);
                        } else {
                            driverMarkerRef.current.setLngLat([location.longitude, location.latitude]);
                        }
                    }
                }
            });

            toast.dismiss();
            if (success) {
                setIsTracking(true);
                toast.success('📡 GPS activo - Compartiendo ubicación');
            } else {
                setLastGpsError('Permiso denegado o GPS no disponible');
                toast.error('No se pudo activar el GPS. Verifica los permisos.');
            }
        }
    };


    // Open POD modal for delivery
    const openPODModal = (index) => {
        setPodModal({ isOpen: true, waypointIndex: index });
    };

    const closePODModal = () => {
        setPodModal({ isOpen: false, waypointIndex: null });
    };

    const handleDeliveryComplete = (index) => {
        const newCompleted = [...completedStops, index];
        setCompletedStops(newCompleted);
        closePODModal();
        toast.success('¡Entrega completada con prueba!');

        // Try to sync with localStorage (Works if Admin is on same browser)
        try {
            const savedRoutes = JSON.parse(localStorage.getItem('logisticsRoutes') || '[]');
            const updatedRoutes = savedRoutes.map(r => {
                if (r.id.toString() === routeId) {
                    return { ...r, lastUpdate: Date.now(), completedCount: newCompleted.length };
                }
                return r;
            });
            localStorage.setItem('logisticsRoutes', JSON.stringify(updatedRoutes));
            window.dispatchEvent(new Event('storage'));
        } catch (e) {
            console.error('Sync error:', e);
        }
    };

    const openNavigation = (lat, lng) => {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
    };

    if (loading) return (
        <div style={{ background: '#020617', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ width: 40, height: 40, border: '3px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                <p>Cargando ruta...</p>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    if (!route) {
        if (availableRoutes.length > 0) {
            return (
                <div style={{ background: '#020617', minHeight: '100dvh', padding: 20, color: '#e2e8f0', fontFamily: 'system-ui' }}>
                    <Toaster position="top-center" richColors />
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 20, textAlign: 'center' }}>
                        Tus Rutas Asignadas 📦
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {availableRoutes.map(r => (
                            <div
                                key={r.id}
                                onClick={() => setRoute(r)}
                                style={{
                                    background: '#1e293b',
                                    borderRadius: 16,
                                    padding: '16px 20px',
                                    cursor: 'pointer',
                                    border: '1px solid #334155',
                                    transition: 'transform 0.2s',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'white' }}>{r.name || 'Ruta sin nombre'}</h3>
                                    <span style={{ background: '#3b82f6', fontSize: '0.75rem', padding: '4px 8px', borderRadius: 999, color: 'white' }}>
                                        Activa
                                    </span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>
                                    📅 {new Date(r.created_at || Date.now()).toLocaleDateString()}
                                </p>
                                <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#cbd5e1' }}>
                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                                        {(r.waypoints?.length || 0)} Paradas
                                    </div>
                                    {r.distance_km > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#cbd5e1' }}>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />
                                            {Number(r.distance_km).toFixed(1)} km
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        if (driversList.length > 0) {
            return (
                <div style={{ background: '#020617', minHeight: '100dvh', padding: 20, color: '#e2e8f0', fontFamily: 'system-ui' }}>
                    <Toaster position="top-center" richColors />
                    <div style={{ textAlign: 'center', marginBottom: 30, paddingTop: 20 }}>
                        <div style={{ fontSize: 40, marginBottom: 10 }}>👋</div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Bienvenido a TraceOps</h2>
                        <p style={{ color: '#94a3b8', marginTop: 8 }}>Selecciona tu perfil para continuar</p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {driversList.map(d => (
                            <div
                                key={d.id}
                                onClick={() => handleDriverLogin(d.id)}
                                style={{
                                    background: '#1e293b',
                                    borderRadius: 16,
                                    padding: '16px',
                                    cursor: 'pointer',
                                    border: '1px solid #334155',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 16,
                                    transition: 'transform 0.2s'
                                }}
                            >
                                <div style={{
                                    width: 44, height: 44,
                                    borderRadius: '50%',
                                    background: '#3b82f6',
                                    color: 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 'bold', fontSize: '1.1rem'
                                }}>
                                    {d.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h3 style={{ margin: 0, fontSize: '1rem', color: 'white' }}>{d.name}</h3>
                                    {d.cuadrilla && (
                                        <div style={{ fontSize: '0.8rem', color: '#fbbf24', marginTop: 2 }}>
                                            {d.cuadrilla}
                                        </div>
                                    )}
                                </div>
                                <div style={{ color: '#64748b' }}>➜</div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        return (
            <div style={{ background: '#020617', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', padding: 20, textAlign: 'center' }}>
                <div>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
                    <h2 style={{ margin: '0 0 8px' }}>Ruta no encontrada</h2>
                    <p style={{ color: '#94a3b8', margin: 0 }}>El enlace puede haber expirado o la ruta fue eliminada.</p>
                </div>
            </div>
        );
    }

    const completedCount = completedStops.length;
    const totalStops = route.waypoints.length;
    const progress = (completedCount / totalStops) * 100;

    return (
        <div style={{ background: '#020617', height: '100dvh', display: 'flex', flexDirection: 'column', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <Toaster position="top-center" richColors />

            {/* Header */}
            <div style={{
                padding: '12px 16px',
                background: '#0f172a',
                zIndex: 50,
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                flexShrink: 0
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                        <h1 style={{ fontSize: '1rem', fontWeight: '700', margin: 0, color: 'white' }}>{route.name}</h1>
                        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '2px 0 0' }}>
                            {completedCount}/{totalStops} paradas • {route.distanceKm || 0} km
                        </p>
                    </div>

                    {/* GPS Status Indicator */}
                    {isTracking && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            background: lastGpsError ? '#dc2626' : '#10b981',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: 6,
                            fontSize: '0.7rem',
                            fontWeight: 600
                        }}>
                            {lastGpsError ? <WifiOff size={12} /> : <Wifi size={12} />}
                            {lastGpsError ? '⚠️' : `📡 ${gpsPings}`}
                        </div>
                    )}

                    <button
                        onClick={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
                        style={{ background: '#334155', color: 'white', border: 'none', padding: '8px 12px', borderRadius: 8, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                        {viewMode === 'map' ? 'Ver Lista' : 'Ver Mapa'}
                    </button>
                </div>
                {/* Progress Bar */}
                <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 999, height: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: '#10b981', transition: 'width 0.5s ease' }} />
                </div>

                {/* Pending Deliveries Banner */}
                {pendingCount > 0 && (
                    <div
                        onClick={async () => {
                            if (networkStatus && !isSyncing) {
                                setIsSyncing(true);
                                await syncPending();
                                setPendingCount(getPendingCount());
                                setIsSyncing(false);
                            }
                        }}
                        style={{
                            marginTop: 8,
                            padding: '8px 12px',
                            background: networkStatus ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            border: `1px solid ${networkStatus ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: networkStatus ? 'pointer' : 'default'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {networkStatus ? <CloudOff size={16} style={{ color: '#f59e0b' }} /> : <WifiOff size={16} style={{ color: '#ef4444' }} />}
                            <span style={{ fontSize: '0.8rem', color: networkStatus ? '#f59e0b' : '#ef4444' }}>
                                {pendingCount} entrega{pendingCount > 1 ? 's' : ''} pendiente{pendingCount > 1 ? 's' : ''}
                            </span>
                        </div>
                        {networkStatus && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: '#f59e0b' }}>
                                <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                                {isSyncing ? 'Sincronizando...' : 'Toca para sincronizar'}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

                {/* MAP VIEW */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    visibility: viewMode === 'map' ? 'visible' : 'hidden',
                    display: 'flex', flexDirection: 'column'
                }}>
                    <div ref={mapContainer} style={{ flex: 1, width: '100%' }} />

                    {/* Map Controls Overlay */}
                    <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <select
                            onChange={(e) => setMapStyle(e.target.value)}
                            style={{ background: 'rgba(15, 23, 42, 0.9)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '6px', borderRadius: 8, fontSize: '0.8rem' }}
                        >
                            <option value="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json">🌙 Oscuro</option>
                            <option value="https://api.maptiler.com/maps/hybrid/style.json?key=get_your_own_OpIi9ZULNHzrESv6T2vL">🛰️ Satélite (Demo)</option>
                            {/* Note: Google Satellite/Terrain requires Raster source which is tricky in pure Vector MapLibre without API Keys often. 
                                Using Carto/OSM standard styles for stability unless we have keys. 
                                For "Terrain" specifically, often needs a specific style URL. */}
                            <option value="https://demotiles.maplibre.org/style.json">⛰️ Terreno (Demo)</option>
                        </select>
                    </div>

                    <div style={{ position: 'absolute', bottom: 20, left: 20, right: 20 }}>
                        <button
                            onClick={toggleTracking}
                            style={{
                                width: '100%',
                                padding: '14px',
                                background: isTracking ? '#ef4444' : '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: 12,
                                fontWeight: 'bold',
                                fontSize: '1rem',
                                boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                            }}
                        >
                            <Radio size={20} className={isTracking ? "animate-pulse" : ""} />
                            {isTracking ? 'DETENER RASTREO' : 'INICIAR RUTA'}
                        </button>
                    </div>
                </div>

                {/* LIST VIEW (Already existing logic, just wrapped) */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    overflowY: 'auto', padding: '16px',
                    visibility: viewMode === 'list' ? 'visible' : 'hidden',
                    background: '#020617'
                }}>
                    {route.waypoints.map((wp, i) => {
                        const isCompleted = completedStops.includes(i);
                        return (
                            <div key={i} style={{
                                background: isCompleted ? 'rgba(16, 185, 129, 0.08)' : '#1e293b',
                                borderRadius: 12, padding: 16, marginBottom: 12,
                                border: isCompleted ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                                opacity: isCompleted ? 0.7 : 1
                            }}>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <div style={{
                                        width: 32, height: 32, borderRadius: 8,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: isCompleted ? '#10b981' : '#334155',
                                        color: 'white', fontWeight: 'bold'
                                    }}>
                                        {isCompleted ? <CheckCircle size={18} /> : i + 1}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <p style={{ margin: '0 0 4px', fontSize: '0.9rem', color: isCompleted ? '#94a3b8' : 'white' }}>
                                            {wp.address || `${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}`}
                                        </p>
                                        {!isCompleted && (
                                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                                <button onClick={() => openNavigation(wp.lat, wp.lng)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: '#334155', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
                                                    <Navigation size={16} /> Navegar
                                                </button>
                                                <button onClick={() => openPODModal(i)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
                                                    <Camera size={16} /> Entregar
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

            </div>

            {/* POD Modal */}
            {route && podModal.waypointIndex !== null && (
                <PODModal
                    isOpen={podModal.isOpen}
                    onClose={closePODModal}
                    onComplete={handleDeliveryComplete}
                    waypoint={route.waypoints[podModal.waypointIndex]}
                    waypointIndex={podModal.waypointIndex}
                    routeId={routeId}
                    driverId={driverId}
                />
            )}
        </div>
    );
};

export default DriverView;
