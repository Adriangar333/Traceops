
import React, { useState, useEffect, useRef } from 'react';
import { Navigation, CheckCircle, Radio, Camera, Wifi, WifiOff, CloudOff, RefreshCw, AlertTriangle, AlertOctagon, Lock, XCircle, Search, Siren } from 'lucide-react';
import { io } from 'socket.io-client';
import { Toaster, toast } from 'sonner';
import { TrackingService } from '../utils/trackingService';
import { getRouteStatus, getDriverHistory, validateGeofence, getDrivers, getDriverById } from '../utils/backendService';
import { initAutoSync, getPendingCount, syncPending, onSyncEvent, isOnline } from '../utils/offlineSyncService';
import { PushService } from '../utils/pushService';
import PODModal from './PODModal';
import maplibregl from 'maplibre-gl';


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
    const [showPanicMenu, setShowPanicMenu] = useState(false);
    const [driverName, setDriverName] = useState(''); // Driver name for watermark

    // Get driverId from URL params or generate one
    const searchParams = new URLSearchParams(window.location.search);
    const driverId = searchParams.get('driverId');

    // Check if we are native
    const isNative = window.Capacitor && window.Capacitor.isNative;

    // --- DEEP LINK REDIRECT ---
    // If user opens a link like https://domain/driver/123 on mobile, try to open the App
    useEffect(() => {
        const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
        if (routeId && !isNative && isMobile) {
            console.log('🔗 Attempting to open native app via custom scheme...');
            // Give the browser a moment to render, then try to switch
            const timer = setTimeout(() => {
                window.location.href = `traceops://driver/routes/${routeId}`;
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [routeId, isNative]);

    const handlePanicOption = (type) => {
        const typeConfig = {
            'sos': { label: 'ALERTA SOS', msg: '🚨 ALERTA SOS ENVIADA 🚨' },
            'aggressive': { label: 'Cliente Agresivo', msg: '🤬 Alerta: Cliente Agresivo' },
            'closed': { label: 'Predio Cerrado', msg: '⛔ Alerta: Predio Cerrado' },
            'impossible': { label: 'Imposibilidad', msg: '🚧 Alerta: Imposibilidad de Entrega' }
        };

        const config = typeConfig[type] || typeConfig['sos'];

        if (window.confirm(`¿Enviar reporte de: ${config.label}?`)) {
            try {
                const socket = window.socket || io('https://dashboard-backend.zvkdyr.easypanel.host', { transports: ['websocket'] });
                const activeDriverId = driverId || localStorage.getItem('traceops_driver_id');

                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const payload = {
                            driverId: activeDriverId,
                            routeId: routeId,
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude,
                            type: config.label, // Send specific type (SOS, Imposibilidad, etc.)
                            subtype: type,
                            details: config.label,
                            timestamp: new Date().toISOString()
                        };
                        console.log(`🚨 Sending ${type} Alert:`, payload);
                        socket.emit('driver:panic', payload);
                        toast.error(config.msg, { duration: 5000 });
                        setShowPanicMenu(false);
                    },
                    (err) => {
                        console.warn('Location failed, sending basic alert', err);
                        socket.emit('driver:panic', {
                            driverId: activeDriverId,
                            routeId,
                            type: config.label, // FIX: Use correct alert type even without GPS
                            subtype: type,
                            details: config.label,
                            error: 'No GPS'
                        });
                        toast.error(`${config.msg} (Sin GPS)`, { duration: 5000 });
                        setShowPanicMenu(false);
                    },
                    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                );
            } catch (error) {
                console.error('Alert error:', error);
                toast.error('Error al enviar alerta');
            }
        }
    };

    const handlePanic_OLD = () => {
        if (window.confirm("🚨 ¿ESTÁS SEGURO? \n\nSe enviará una ALERTA DE PÁNICO inmediata al administrador con tu ubicación.")) {
            try {
                const socket = window.socket || io('https://dashboard-backend.zvkdyr.easypanel.host');

                // Resolve ID locally since effectiveDriverId is not in scope
                const activeDriverId = driverId || localStorage.getItem('traceops_driver_id');

                // Try to get precise location immediately
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const payload = {
                            driverId: activeDriverId,
                            routeId: routeId,
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude,
                            type: 'panic',
                            timestamp: new Date().toISOString()
                        };
                        console.log('🚨 Sending Panic Alert:', payload);
                        socket.emit('driver:panic', payload);
                        toast.error("🚨 ALERTA SOS ENVIADA 🚨", { duration: 5000 });
                    },
                    (err) => {
                        console.warn('Panic location failed, sending basic alert', err);
                        // Send basic alert without precise location
                        socket.emit('driver:panic', {
                            driverId: activeDriverId,
                            routeId,
                            type: 'panic',
                            error: 'No GPS'
                        });
                        toast.error("🚨 ALERTA ENVIADA (Sin GPS preciso) 🚨", { duration: 5000 });
                    },
                    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                );
            } catch (error) {
                console.error('Panic button error:', error);
                toast.error('Error al enviar alerta');
            }
        }
    };

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


            // 4. Fetch Driver Name for Watermark
            if (effectiveDriverId) {
                try {
                    // Try fetching specific driver first
                    const driverData = await getDriverById(effectiveDriverId);
                    if (driverData && driverData.name) {
                        setDriverName(driverData.name);
                    } else {
                        // Fallback to list if specific fetch fails (legacy)
                        const allDrivers = await getDrivers();
                        const currentDriver = allDrivers.find(d => d.id.toString() === effectiveDriverId.toString());
                        if (currentDriver) {
                            setDriverName(currentDriver.name);
                        }
                    }
                } catch (e) {
                    console.error('Error fetching driver details:', e);
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

    const handleDriverLogin = async (selectedId) => {
        if (!selectedId) return;

        try {
            // 1. Save driver ID to localStorage
            localStorage.setItem('traceops_driver_id', selectedId.toString());
            console.log('🔐 Driver logged in:', selectedId);

            // 2. Initialize push notifications (native only)
            if (window.Capacitor?.isNative) {
                console.log('📱 Initializing push notifications...');
                const fcmToken = await PushService.initialize(selectedId);
                if (fcmToken) {
                    toast.success('🔔 Notificaciones activadas');
                }
            }

            // 3. Load driver's routes
            const routes = await getDriverRoutes(selectedId);
            if (routes && routes.length > 0) {
                setAvailableRoutes(routes);
                const driver = driversList.find(d => d.id.toString() === selectedId.toString());
                if (driver) setDriverName(driver.name);
                setDriversList([]); // Exit login mode
            } else {
                // No routes - still set driver name and exit login
                const driver = driversList.find(d => d.id.toString() === selectedId.toString());
                if (driver) setDriverName(driver.name);
                setDriversList([]); // Exit login mode
                toast.info('No tienes rutas asignadas actualmente');
            }

        } catch (error) {
            console.error('Login error:', error);
            toast.error('Error al iniciar sesión');
            // Fallback: reload
            window.location.replace(`/driver?driverId=${selectedId}`);
        }
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
                // Use actual route geometry if available (from optimized route), otherwise fallback to straight lines
                // Robust Geometry Extraction
                let routeCoordinates = null;
                const geom = route.route_geometry || route.routeGeometry || route.geometry;

                if (geom) {
                    if (Array.isArray(geom)) {
                        // Case 1: Raw Array [[lng, lat], ...]
                        routeCoordinates = geom;
                    } else if (geom.coordinates && Array.isArray(geom.coordinates)) {
                        // Case 2: GeoJSON Object { type: 'LineString', coordinates: [...] }
                        routeCoordinates = geom.coordinates;
                    } else if (typeof geom === 'string') {
                        try {
                            const parsed = JSON.parse(geom);
                            routeCoordinates = Array.isArray(parsed) ? parsed : parsed.coordinates;
                        } catch (e) { console.error('Error parsing geometry string', e); }
                    }
                }

                // Fallback to straight lines if extraction failed
                if (!routeCoordinates || routeCoordinates.length === 0) {
                    console.warn('Using fallback straight lines (No valid geometry found)');
                    routeCoordinates = route.waypoints.map(wp => [wp.lng, wp.lat]);
                    // DEBUG TOAST FOR USER
                    toast.info(`⚠️ Ruta: Geometría no encontrada. Usando modo simple. (ID: ${route.id})`, { duration: 8000 });
                } else {
                    // DEBUG SUCCESS
                    // toast.success(`✅ Ruta cargada: ${routeCoordinates.length} puntos`, { duration: 3000 });
                }

                // Fit bounds
                const bounds = new maplibregl.LngLatBounds();
                routeCoordinates.forEach(coord => bounds.extend(coord));
                map.current.fitBounds(bounds, { padding: 50 });

                map.current.addSource('route', {
                    'type': 'geojson',
                    'data': {
                        'type': 'Feature',
                        'properties': {},
                        'geometry': {
                            'type': 'LineString',
                            'coordinates': routeCoordinates
                        }
                    }
                });

                // Route glow effect layer (behind main line)
                map.current.addLayer({
                    'id': 'route-glow',
                    'type': 'line',
                    'source': 'route',
                    'layout': {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    'paint': {
                        'line-color': '#3b82f6',
                        'line-width': 10,
                        'line-opacity': 0.3
                    }
                });

                // Main route line
                map.current.addLayer({
                    'id': 'route',
                    'type': 'line',
                    'source': 'route',
                    'layout': {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    'paint': {
                        'line-color': '#60a5fa',
                        'line-width': 4
                    }
                });

                // Add Waypoint Markers - Premium styling
                route.waypoints.forEach((wp, index) => {
                    const isFirst = index === 0;
                    const isLast = index === route.waypoints.length - 1;
                    const el = document.createElement('div');
                    el.className = 'waypoint-marker';

                    // Premium marker with gradient background and shadow
                    const bgColor = isFirst ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                        : isLast ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                            : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
                    const shadowColor = isFirst ? 'rgba(16, 185, 129, 0.5)'
                        : isLast ? 'rgba(239, 68, 68, 0.5)'
                            : 'rgba(59, 130, 246, 0.5)';

                    el.innerHTML = `
                        <div style="
                            position: relative;
                            width: 32px;
                            height: 32px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        ">
                            <div style="
                                background: ${bgColor};
                                color: white;
                                border-radius: 50%;
                                width: 28px;
                                height: 28px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-weight: 700;
                                font-size: 12px;
                                border: 2px solid white;
                                box-shadow: 0 4px 12px ${shadowColor};
                                position: relative;
                                z-index: 2;
                            ">
                                ${isFirst ? '🏠' : isLast ? '🏁' : index + 1}
                            </div>
                            <div style="
                                position: absolute;
                                bottom: -4px;
                                left: 50%;
                                transform: translateX(-50%);
                                width: 0;
                                height: 0;
                                border-left: 6px solid transparent;
                                border-right: 6px solid transparent;
                                border-top: 8px solid ${isFirst ? '#059669' : isLast ? '#dc2626' : '#2563eb'};
                            "></div>
                        </div>`;

                    new maplibregl.Marker({ element: el, anchor: 'bottom' })
                        .setLngLat([wp.lng, wp.lat])
                        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`
                            <div style="padding: 4px; min-width: 120px;">
                                <b style="color: #0f172a;">Parada ${index + 1}</b>
                                <p style="margin: 4px 0 0; font-size: 12px; color: #64748b;">${wp.address || ''}</p>
                            </div>
                        `))
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
                    // Same robust logic as initial load
                    let coordinates = null;
                    const geom = route.route_geometry || route.routeGeometry || route.geometry;

                    if (geom) {
                        if (Array.isArray(geom)) coordinates = geom;
                        else if (geom.coordinates && Array.isArray(geom.coordinates)) coordinates = geom.coordinates;
                        else if (typeof geom === 'string') {
                            try { const parsed = JSON.parse(geom); coordinates = Array.isArray(parsed) ? parsed : parsed.coordinates; } catch (e) { }
                        }
                    }

                    if (!coordinates || coordinates.length === 0) {
                        coordinates = route.waypoints.map(wp => [wp.lng, wp.lat]);
                    }
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
            const toastId = toast.loading('Solicitando permiso de ubicación...');

            // Safety timeout to ensure toast is dismissed even if permission hangs
            setTimeout(() => toast.dismiss(toastId), 8000);

            try {
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

                        console.log('📡 (GPS Active)'); // Reduced noise
                        // console.log('📡 Sending to Global Backend:', payload);
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

                if (success) {
                    setIsTracking(true);
                    toast.success('📡 GPS activo - Compartiendo ubicación');
                } else {
                    setLastGpsError('Permiso denegado o GPS no disponible');
                    toast.error('No se pudo activar el GPS. Verifica los permisos.');
                }
            } catch (err) {
                console.error('Error starting tracking:', err);
                setLastGpsError('Error al iniciar rastreo');
                toast.error('Error al iniciar el rastreo GPS');
            } finally {
                // ALWAYS dismiss the loading toast
                toast.dismiss(toastId);
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
        <div style={{ background: '#f8fafc', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ width: 40, height: 40, border: '3px solid #9DBD39', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                <p style={{ color: '#64748b' }}>Cargando ruta...</p>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    if (!route) {
        if (availableRoutes.length > 0) {
            return (
                <div style={{ background: '#f8fafc', minHeight: '100dvh', padding: 20, color: '#0f172a', fontFamily: 'Inter, system-ui' }}>
                    <Toaster position="top-center" richColors />
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 20, textAlign: 'center', color: '#0f172a' }}>
                        Tus Rutas Asignadas 📦
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {availableRoutes.map(r => (
                            <div
                                key={r.id}
                                onClick={() => setRoute(r)}
                                style={{
                                    background: '#ffffff',
                                    borderRadius: 16,
                                    padding: '16px 20px',
                                    cursor: 'pointer',
                                    border: '1px solid #e2e8f0',
                                    transition: 'transform 0.2s',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>{r.name || 'Ruta sin nombre'}</h3>
                                    <span style={{ background: '#9DBD39', fontSize: '0.75rem', padding: '4px 8px', borderRadius: 999, color: 'white' }}>
                                        Activa
                                    </span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>
                                    📅 {new Date(r.created_at || Date.now()).toLocaleDateString()}
                                </p>
                                <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#64748b' }}>
                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                                        {(r.waypoints?.length || 0)} Paradas
                                    </div>
                                    {r.distance_km > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#64748b' }}>
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
            const [searchTerm, setSearchTerm] = useState("");
            const filteredDrivers = driversList.filter(d =>
                d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (d.cuadrilla && d.cuadrilla.toLowerCase().includes(searchTerm.toLowerCase()))
            );

            return (
                <div style={{ background: '#f8fafc', minHeight: '100dvh', padding: 20, color: '#0f172a', fontFamily: 'Inter, system-ui' }}>
                    <Toaster position="top-center" richColors />
                    <div style={{ textAlign: 'center', marginBottom: 20, paddingTop: 20 }}>
                        <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(16,185,129,0.3)' }}>
                            <Navigation size={32} color="white" />
                        </div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: '#0f172a', letterSpacing: '-0.02em' }}>Bienvenido Técnico</h2>
                        <p style={{ color: '#64748b', marginTop: 4, fontSize: '0.9rem' }}>Selecciona tu perfil para ingresar</p>
                    </div>

                    {/* Search Bar */}
                    <div style={{ position: 'relative', marginBottom: 20 }}>
                        <Search size={20} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '12px 12px 12px 44px',
                                borderRadius: 12,
                                border: '1px solid #e2e8f0',
                                fontSize: '1rem',
                                outline: 'none',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                transition: 'all 0.2s'
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {filteredDrivers.map(d => (
                            <div
                                key={d.id}
                                onClick={() => handleDriverLogin(d.id)}
                                style={{
                                    background: '#ffffff',
                                    borderRadius: 16,
                                    padding: '16px',
                                    cursor: 'pointer',
                                    border: '1px solid #e2e8f0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 16,
                                    transition: 'transform 0.2s',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                }}
                            >
                                <div style={{
                                    width: 44, height: 44,
                                    borderRadius: '50%',
                                    background: '#9DBD39',
                                    color: 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 'bold', fontSize: '1.1rem'
                                }}>
                                    {d.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>{d.name}</h3>
                                    {d.cuadrilla && (
                                        <div style={{ fontSize: '0.8rem', color: '#f59e0b', marginTop: 2 }}>
                                            {d.cuadrilla}
                                        </div>
                                    )}
                                </div>
                                <div style={{ color: '#94a3b8' }}>➜</div>
                            </div>
                        ))}
                        {filteredDrivers.length === 0 && (
                            <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>
                                No se encontraron técnicos
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return (
            <div style={{ background: '#f8fafc', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a', padding: 20, textAlign: 'center' }}>
                <div>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
                    <h2 style={{ margin: '0 0 8px' }}>Ruta no encontrada</h2>
                    <p style={{ color: '#64748b', margin: 0 }}>El enlace puede haber expirado o la ruta fue eliminada.</p>
                </div>
            </div>
        );
    }

    const completedCount = completedStops.length;
    const totalStops = route.waypoints.length;
    const progress = (completedCount / totalStops) * 100;

    return (
        <div style={{ background: '#f8fafc', height: '100dvh', display: 'flex', flexDirection: 'column', color: '#0f172a', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
            <Toaster position="top-center" richColors />

            {/* SOS / Panic Button - Hidden in list mode and during tracking */}
            {viewMode !== 'list' && isTracking && (
                <>
                    <button
                        onClick={() => setShowPanicMenu(!showPanicMenu)}
                        style={{
                            position: 'fixed',
                            bottom: 180,
                            right: 16,
                            width: 56,
                            height: 56,
                            borderRadius: '50%',
                            background: '#ef4444',
                            color: 'white',
                            border: '4px solid rgba(255,255,255,0.2)',
                            boxShadow: '0 4px 20px rgba(220, 38, 38, 0.6)',
                            zIndex: 9999,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            outline: 'none',
                            animation: 'pulse-red 2s infinite',
                            transform: showPanicMenu ? 'rotate(45deg)' : 'none',
                            transition: 'transform 0.3s ease'
                        }}
                        aria-label="Menú de Alertas"
                    >
                        {showPanicMenu ? <XCircle size={28} /> : <AlertTriangle size={28} strokeWidth={3} />}
                    </button>

                    {/* Alert Menu Overlay */}
                    {showPanicMenu && (
                        <div style={{
                            position: 'fixed',
                            bottom: 250,
                            right: 16,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                            zIndex: 9998,
                            animation: 'slide-up 0.3s ease-out'
                        }}>
                            <button onClick={() => handlePanicOption('sos')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, border: 'none', background: '#dc2626', color: 'white', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', cursor: 'pointer' }}>
                                <Siren size={20} /> SOS / EMERGENCIA
                            </button>
                            <button onClick={() => handlePanicOption('aggressive')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, border: 'none', background: '#ea580c', color: 'white', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', cursor: 'pointer' }}>
                                <AlertOctagon size={20} /> Cliente Agresivo
                            </button>
                            <button onClick={() => handlePanicOption('closed')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, border: 'none', background: '#f59e0b', color: 'black', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', cursor: 'pointer' }}>
                                <Lock size={20} /> Predio Cerrado
                            </button>
                            <button onClick={() => handlePanicOption('impossible')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, border: 'none', background: '#eab308', color: 'black', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', cursor: 'pointer' }}>
                                <XCircle size={20} /> Imposibilidad
                            </button>
                            <style>{`@keyframes slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`}</style>
                        </div>
                    )}
                    <style>{`
                    @keyframes pulse-red {
                        0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
                        70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
                        100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                    }
                `}</style>
                </>
            )}

            {/* Header */}
            <div style={{
                padding: '12px 16px',
                background: '#ffffff',
                zIndex: 50,
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                borderBottom: '1px solid #e2e8f0',
                flexShrink: 0
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                        <h1 style={{ fontSize: '1rem', fontWeight: '700', margin: 0, color: '#0f172a' }}>{route.name}</h1>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 0' }}>
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
                            {lastGpsError ? (
                                <>
                                    <WifiOff size={14} /> <span style={{ fontSize: '0.75rem' }}>Error GPS</span>
                                </>
                            ) : (
                                <>
                                    <div style={{ width: 8, height: 8, background: 'white', borderRadius: '50%', animation: 'pulse 1s infinite' }} />
                                    <span style={{ fontSize: '0.75rem' }}>GPS ACTIVO</span>
                                    <style>{`@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }`}</style>
                                </>
                            )}
                        </div>
                    )}

                    <button
                        onClick={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
                        style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: 8, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                        {viewMode === 'map' ? 'Ver Lista' : 'Ver Mapa'}
                    </button>
                </div>
                {/* Progress Bar */}
                <div style={{ background: '#e2e8f0', borderRadius: 999, height: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: '#9DBD39', transition: 'width 0.5s ease' }} />
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
                            <option value="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json">☀️ Claro</option>
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
                                background: isTracking ? '#ef4444' : '#9DBD39',
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
                    background: '#f8fafc'
                }}>
                    {route.waypoints.map((wp, i) => {
                        const isCompleted = completedStops.includes(i);
                        return (
                            <div key={i} style={{
                                background: isCompleted ? 'rgba(157, 189, 57, 0.1)' : '#ffffff',
                                borderRadius: 12, padding: 16, marginBottom: 12,
                                border: isCompleted ? '1px solid #9DBD39' : '1px solid #e2e8f0',
                                opacity: isCompleted ? 0.7 : 1,
                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                            }}>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <div style={{
                                        width: 32, height: 32, borderRadius: 8,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: isCompleted ? '#9DBD39' : '#f1f5f9',
                                        color: isCompleted ? 'white' : '#64748b', fontWeight: 'bold',
                                        border: isCompleted ? 'none' : '1px solid #e2e8f0'
                                    }}>
                                        {isCompleted ? <CheckCircle size={18} /> : i + 1}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <p style={{ margin: '0 0 4px', fontSize: '0.9rem', color: isCompleted ? '#64748b' : '#0f172a' }}>
                                            {wp.address || `${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}`}
                                        </p>
                                        {!isCompleted && (
                                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                                <button onClick={() => openNavigation(wp.lat, wp.lng)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
                                                    <Navigation size={16} /> Navegar
                                                </button>
                                                <button onClick={() => openPODModal(i)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: '#9DBD39', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
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
                    driverName={driverName} // Pass driver name
                    operationType={route?.name?.toUpperCase().includes('CORTE') ? 'Corte' : route?.name?.toUpperCase().includes('RECONEXION') ? 'Reconexión' : 'Entrega'}
                />
            )}
        </div>
    );
};

export default DriverView;
