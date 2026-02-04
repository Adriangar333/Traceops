import React, { useState, useEffect, useRef } from 'react';
import { Users, Radio, MapPin, Clock, RefreshCw, Calendar, Route, Bell } from 'lucide-react';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getDriverHistory, optimizeRoutePath, getDriverRoutes } from '../utils/backendService';

// Vehicle Icons (SVG Strings)
// Vehicle Icons (SVG Strings)
const VEHICLE_ICONS = {
    // Moto (Cuadrilla Liviana)
    liviana: (initials) => `
        <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
            <div style="background:linear-gradient(135deg, #10b981 0%, #059669 100%);border:2px solid white;border-radius:50%;width:36px;height:36px;box-shadow:0 4px 12px rgba(16, 185, 129, 0.4);display:flex;align-items:center;justify-content:center;z-index:2;">
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>
            </div>
            <div style="position:absolute;bottom:-8px;background:linear-gradient(to right, #064e3b, #047857);color:white;font-size:10px;padding:2px 6px;border-radius:10px;font-weight:bold;z-index:3;white-space:nowrap;border:1px solid rgba(255,255,255,0.3);box-shadow:0 2px 4px rgba(0,0,0,0.3);">${initials}</div>
             <div style="position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #059669; z-index: 1;"></div>
        </div>`,

    // Camioneta/Pickup (Cuadrilla Mediana)
    mediana: (initials) => `
         <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
            <div style="background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%);border:2px solid white;border-radius:50%;width:36px;height:36px;box-shadow:0 4px 12px rgba(245, 158, 11, 0.4);display:flex;align-items:center;justify-content:center;z-index:2;">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>
            </div>
            <div style="position:absolute;bottom:-8px;background:linear-gradient(to right, #78350f, #92400e);color:white;font-size:10px;padding:2px 6px;border-radius:10px;font-weight:bold;z-index:3;white-space:nowrap;border:1px solid rgba(255,255,255,0.3);box-shadow:0 2px 4px rgba(0,0,0,0.3);">${initials}</div>
            <div style="position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #d97706; z-index: 1;"></div>
        </div>`,

    // Camión Canastilla (Cuadrilla Pesada)
    pesada: (initials) => `
         <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
             <div style="background:linear-gradient(135deg, #ef4444 0%, #dc2626 100%);border:2px solid white;border-radius:50%;width:36px;height:36px;box-shadow:0 4px 12px rgba(239, 68, 68, 0.4);display:flex;align-items:center;justify-content:center;z-index:2;">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            </div>
            <div style="position:absolute;top:-8px;right:-4px;background:#1e293b;color:#fbbf24;font-size:10px;padding:2px;border-radius:50%;border:1px solid white;z-index:4;box-shadow: 0 2px 4px rgba(0,0,0,0.3);">⚡</div>
            <div style="position:absolute;bottom:-8px;background:linear-gradient(to right, #7f1d1d, #991b1b);color:white;font-size:10px;padding:2px 6px;border-radius:10px;font-weight:bold;z-index:3;white-space:nowrap;border:1px solid rgba(255,255,255,0.3);box-shadow:0 2px 4px rgba(0,0,0,0.3);">${initials}</div>
             <div style="position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #dc2626; z-index: 1;"></div>
        </div>`,

    // Default (Generic Driver)
    default: (initials) => `
        <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
            <div style="
                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                width: 36px;
                height: 36px;
                border-radius: 50%;
                border: 2px solid white;
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 12px;
                font-weight: bold;
                color: white;
                text-transform: uppercase;
                z-index: 2;
            ">
                ${initials}
            </div>
             <div style="position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #2563eb; z-index: 1;"></div>
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
    const [mapStyle, setMapStyle] = useState('dark');
    const [showStylePicker, setShowStylePicker] = useState(false);
    const mapContainer = useRef(null);
    const map = useRef(null);
    const markers = useRef({});
    const historyLayerRef = useRef(null);
    const socketRef = useRef(null);
    const driversListRef = useRef(driversList);
    const [panicDrivers, setPanicDrivers] = useState({});

    // Keep ref synced with prop to avoid stale closures in socket listeners
    useEffect(() => {
        driversListRef.current = driversList;
    }, [driversList]);

    // Map style options
    const MAP_STYLES = {
        dark: { name: '🌙 Oscuro', url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' },
        streets: { name: '🗺️ Calles', url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json' },
        light: { name: '☀️ Claro', url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json' },
        terrain: { name: '⛰️ Terreno', url: 'https://demotiles.maplibre.org/style.json' }
    };

    // Resolve driver name and cuadrilla
    const resolveDriverInfo = (driverId) => {
        const list = driversListRef.current;
        if (!list || !list.length) return { name: driverId, cuadrilla: '' };

        // Handle various ID formats (123, "123", "driver-123")
        const cleanId = driverId.toString().replace('driver-', '');

        const agent = list.find(a =>
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
            style: MAP_STYLES[mapStyle].url,
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

    // Update map style when changed
    useEffect(() => {
        if (map.current && MAP_STYLES[mapStyle]) {
            map.current.setStyle(MAP_STYLES[mapStyle].url);
        }
    }, [mapStyle]);

    // Socket connection for real-time updates
    useEffect(() => {
        if (!isOpen) return;

        // Initialize Socket
        const socket = io(BACKEND_URL, { transports: ['websocket'] });
        socketRef.current = socket;
        socketRef.current.on('connect', () => {
            console.log('📡 Connected to tracking server');
        });

        socketRef.current.on('admin:driver-update', (data) => {
            // console.log('🚗 Driver update:', data);
            setActiveDrivers(prev => ({
                ...prev,
                [data.driverId]: {
                    ...data,
                    lastUpdate: new Date()
                }
            }));

            // Update marker on map
            // updateDriverMarker(data); // Removed: renderMarkers depends on activeDrivers change
        });

        // Listen for arrival notifications
        socketRef.current.on('driver:arrived', (data) => {
            // console.log('🚩 Arrival:', data);
            setArrivals(prev => [data, ...prev].slice(0, 10)); // Keep last 10
        });

        // Listen for Panic Alerts
        socketRef.current.on('admin:panic-alert', (data) => {
            console.error('🚨 PANIC ALERT RECEIVED:', data);

            // Determine Alert Type FIRST (before using it)
            const alertType = data.type || 'SOS';

            // Resolve Driver Name using Ref to get fresh data
            const info = resolveDriverInfo(String(data.driverId));
            const driverName = info.name && info.name !== String(data.driverId) ? info.name : `Conductor ${data.driverId}`;

            // Set global panic state for this driver
            setPanicDrivers(prev => ({ ...prev, [data.driverId]: true }));

            // 1. Flash Marker immediately if it exists on map
            const alertClass = (alertType === 'Imposibilidad' || alertType === 'Falla Mecánica')
                ? 'panic-active-warning'
                : (alertType === 'Predio Cerrado')
                    ? 'panic-active-info'
                    : 'panic-active'; // SOS / Default Red

            if (markers.current[data.driverId]) {
                const markerEl = markers.current[data.driverId].getElement();
                // Try to find inner wrapper, or fallback to element itself
                const target = markerEl.querySelector('.driver-marker-inner') || markerEl;

                // Remove all potential panic classes first (in case type changes)
                target.classList.remove('panic-active', 'panic-active-warning', 'panic-active-info');

                target.classList.add(alertClass);
            }

            // 2. Determine Toast Style based on Type
            let toastStyle = {
                background: '#dc2626',
                color: 'white',
                border: '2px solid white',
                fontSize: '1.2rem',
                fontWeight: 'bold'
            };
            let title = 'ALERTA SOS';
            let icon = '🚨';
            let duration = Infinity;

            if (alertType === 'Imposibilidad') {
                toastStyle.background = '#f59e0b'; // Amber/Orange
                title = 'Reporte de Imposibilidad';
                icon = '⚠️';
                duration = 10000; // Auto dismiss after 10s
            } else if (alertType === 'Predio Cerrado') {
                toastStyle.background = '#3b82f6'; // Blue
                title = 'Predio Cerrado';
                icon = '🏠';
                duration = 8000;
            } else if (alertType === 'Cliente Agresivo') {
                title = 'CLIENTE AGRESIVO';
                icon = '🤬';
                // Keep Red
            } else if (alertType === 'Falla Mecánica') {
                toastStyle.background = '#ea580c'; // Dark Orange
                title = 'Falla Mecánica';
                icon = '🔧';
                duration = 15000;
            }

            // 2. Show Critical Toast
            toast.error(`${icon} ${title}: ${driverName}`, {
                duration: duration,
                style: toastStyle,
                description: `Tipo: ${alertType} - Hora: ${new Date().toLocaleTimeString()}`
            });
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

            // Attempt optimization (Snap to Road)
            toast.promise(optimizeRoutePath(data.route), {
                loading: 'Suavizando ruta con IA...',
                success: (optimized) => {
                    if (optimized) {
                        drawHistoryRoute({ type: 'LineString', coordinates: optimized });
                        return '✅ Ruta ajustada a calles';
                    }
                    throw new Error('No optimization');
                },
                error: 'ℹ️ Mostrando ruta original (GPS)'
            });
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

    // Cluster drivers based on screen distance
    const getClusters = () => {
        if (!map.current) return [];
        const drivers = Object.values(activeDrivers);
        const clusters = [];
        const processed = new Set();
        const CLUSTER_RADIUS = 50; // pixels

        drivers.forEach(d1 => {
            if (processed.has(d1.driverId)) return;

            const p1 = map.current.project([d1.lng, d1.lat]);
            const cluster = [d1];
            processed.add(d1.driverId);

            drivers.forEach(d2 => {
                if (d1.driverId === d2.driverId || processed.has(d2.driverId)) return;
                const p2 = map.current.project([d2.lng, d2.lat]);
                const dist = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);

                if (dist < CLUSTER_RADIUS) {
                    cluster.push(d2);
                    processed.add(d2.driverId);
                }
            });

            clusters.push(cluster);
        });

        return clusters;
    };

    // Render Markers (Clusters & Single Drivers)
    const renderMarkers = () => {
        if (!map.current) return;

        const clusters = getClusters();
        const currentMarkers = markers.current; // Existing markers Map
        const newMarkers = {}; // New markers Map

        // Colors for brigades
        const COLORS = {
            liviana: '#10b981', // Emerald
            mediana: '#f59e0b', // Amber
            pesada: '#ef4444',  // Red
            default: '#3b82f6'  // Blue
        };

        clusters.forEach(cluster => {
            if (cluster.length > 1) {
                // RENDER CLUSTER
                const clusterId = `cluster-${cluster.map(d => d.driverId).sort().join('-')}`;

                // Calculate centroid
                const lng = cluster.reduce((sum, d) => sum + d.lng, 0) / cluster.length;
                const lat = cluster.reduce((sum, d) => sum + d.lat, 0) / cluster.length;
                const hasPanic = cluster.some(d => panicDrivers[d.driverId]);

                // Calculate Pie Chart Segments
                const counts = { liviana: 0, mediana: 0, pesada: 0, default: 0 };
                cluster.forEach(d => {
                    const info = resolveDriverInfo(d.driverId);
                    const type = (info.cuadrilla || '').toLowerCase();
                    if (type.includes('liviana') || type.includes('moto')) counts.liviana++;
                    else if (type.includes('mediana') || type.includes('camioneta')) counts.mediana++;
                    else if (type.includes('pesada') || type.includes('camion')) counts.pesada++;
                    else counts.default++;
                });

                // Generate Conic Gradient
                let gradientSegments = [];
                let currentDeg = 0;
                const total = cluster.length;

                Object.entries(counts).forEach(([type, count]) => {
                    if (count > 0) {
                        const deg = (count / total) * 360;
                        gradientSegments.push(`${COLORS[type]} ${currentDeg}deg ${currentDeg + deg}deg`);
                        currentDeg += deg;
                    }
                });

                const backgroundStyle = gradientSegments.length > 1
                    ? `conic-gradient(${gradientSegments.join(', ')})`
                    : (gradientSegments[0] ? gradientSegments[0].split(' ')[0] : COLORS.default); // Fallback to solid color if only one type

                // Create Cluster Element
                if (currentMarkers[clusterId]) {
                    // Reuse existing cluster marker
                    currentMarkers[clusterId].setLngLat([lng, lat]);
                    const el = currentMarkers[clusterId].getElement();
                    el.style.background = backgroundStyle; // Update background for dynamic changes

                    if (hasPanic) el.classList.add('panic-active');
                    else el.classList.remove('panic-active');

                    // Update count if changed
                    const span = el.querySelector('span');
                    if (span) span.innerText = total;

                    newMarkers[clusterId] = currentMarkers[clusterId];
                    delete currentMarkers[clusterId];
                } else {
                    const el = document.createElement('div');
                    el.className = 'driver-cluster-marker' + (hasPanic ? ' panic-active' : '');
                    el.style.width = '44px';
                    el.style.height = '44px';
                    el.style.background = backgroundStyle;
                    el.style.borderRadius = '50%';
                    el.style.color = 'white';
                    el.style.display = 'flex';
                    el.style.alignItems = 'center';
                    el.style.justifyContent = 'center';
                    el.style.fontWeight = 'bold';
                    el.style.fontSize = '14px';
                    el.style.border = '2px solid white';
                    el.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
                    el.style.cursor = 'pointer';
                    el.style.zIndex = '50';

                    // Inner circle for text to make it readable against the pie chart
                    el.innerHTML = `<div style="
                        width: 24px; 
                        height: 24px; 
                        background: rgba(15, 23, 42, 0.8); 
                        border-radius: 50%; 
                        display: flex; 
                        align-items: center; 
                        justify-content: center;
                        backdrop-filter: blur(2px);
                    "><span>${total}</span></div>`;

                    const marker = new maplibregl.Marker({ element: el })
                        .setLngLat([lng, lat])
                        .addTo(map.current);

                    // Cluster Click Handler
                    el.addEventListener('click', () => {
                        const currentZoom = map.current.getZoom();
                        if (currentZoom < 18) {
                            // Zoom In
                            map.current.flyTo({ center: [lng, lat], zoom: currentZoom + 3 });
                        } else {
                            // Spiderfy / Spread UI
                            const names = cluster.map(d => {
                                const info = resolveDriverInfo(d.driverId);
                                return `${info.name} (${info.cuadrilla || 'Gen'})`;
                            }).join(', ');
                            toast.info(`Conductores: ${names}`, { duration: 5000 });
                        }
                    });

                    newMarkers[clusterId] = marker;
                }
            } else {
                // RENDER SINGLE DRIVER (Unchanged logic, just ensure existing markers are preserved)
                const driver = cluster[0];
                const markerId = driver.driverId;

                if (currentMarkers[markerId]) {
                    // Reuse
                    currentMarkers[markerId].setLngLat([driver.lng, driver.lat]);

                    // Update Panic Class
                    const el = currentMarkers[markerId].getElement();
                    const inner = el.querySelector('.driver-marker-inner') || el;
                    if (panicDrivers[driver.driverId]) inner.classList.add('panic-active');
                    else inner.classList.remove('panic-active');

                    newMarkers[markerId] = currentMarkers[markerId];
                    delete currentMarkers[markerId];
                } else {
                    // Create New
                    const el = document.createElement('div');
                    el.className = 'driver-marker-container';

                    const inner = document.createElement('div');
                    inner.className = 'driver-marker-inner';
                    inner.style.display = 'flex';
                    inner.style.alignItems = 'center';
                    inner.style.justifyContent = 'center';

                    const info = resolveDriverInfo(driver.driverId);
                    const initials = info.name === driver.driverId
                        ? (typeof driver.driverId === 'string' ? driver.driverId.substring(0, 2) : 'D')
                        : info.name.split(' ').map(n => n[0]).join('').substring(0, 2);

                    if (panicDrivers[driver.driverId]) inner.classList.add('panic-active');

                    const cuadrillaType = (info.cuadrilla || '').toLowerCase();
                    let iconHtml = VEHICLE_ICONS.default(initials);
                    if (cuadrillaType.includes('liviana')) iconHtml = VEHICLE_ICONS.liviana(initials);
                    else if (cuadrillaType.includes('mediana')) iconHtml = VEHICLE_ICONS.mediana(initials);
                    else if (cuadrillaType.includes('pesada')) iconHtml = VEHICLE_ICONS.pesada(initials);

                    inner.innerHTML = iconHtml;
                    el.appendChild(inner);

                    const marker = new maplibregl.Marker({ element: el })
                        .setLngLat([driver.lng, driver.lat])
                        .addTo(map.current);

                    el.addEventListener('click', async () => {
                        setSelectedDriver(driver.driverId);
                        map.current.flyTo({ center: [driver.lng, driver.lat], zoom: 16 });
                        try {
                            const routes = await getDriverRoutes(driver.driverId);
                            const activeRoute = routes?.find(r => r.status === 'in_progress' || r.status === 'assigned') || routes?.[0];

                            if (activeRoute?.waypoints) {
                                let coordinates = [];
                                try {
                                    // Safely handle specific waypoints format (string or object)
                                    const waypointsData = typeof activeRoute.waypoints === 'string'
                                        ? JSON.parse(activeRoute.waypoints)
                                        : activeRoute.waypoints;

                                    if (Array.isArray(waypointsData)) {
                                        coordinates = waypointsData.map(wp => [wp.lng, wp.lat]);
                                        drawHistoryRoute({ type: 'LineString', coordinates });
                                        toast.success(`Ruta: ${activeRoute.name}`);
                                    }
                                } catch (parseError) {
                                    console.error('Error parsing waypoints:', parseError);
                                }
                            } else {
                                toast.info('Sin ruta activa');
                            }
                        } catch (e) {
                            console.error('Error loading route:', e);
                            toast.error('Error cargando ruta');
                        }
                    });

                    newMarkers[markerId] = marker;
                }
            }
        });

        // Remove stale markers 
        Object.values(currentMarkers).forEach(m => m.remove());
        markers.current = newMarkers;
    };

    // Re-render markers on updates
    useEffect(() => {
        if (!map.current) return;
        renderMarkers();

        // Also listen to move/zoom (throttled would be better but direct is OK for small N)
        const handleMove = () => renderMarkers();
        map.current.on('move', handleMove);
        map.current.on('zoom', handleMove);

        return () => {
            if (map.current) {
                map.current.off('move', handleMove);
                map.current.off('zoom', handleMove);
            }
        };
    }, [activeDrivers, panicDrivers]); // Re-run when data changes

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
            {/* Header - Premium Traceops Branding */}
            <div style={{
                padding: '12px 20px',
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                borderBottom: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 42,
                        height: 42,
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        borderRadius: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)'
                    }}>
                        <Radio size={22} color="white" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                            Traceops Live
                        </h2>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Rastreo en tiempo real</p>
                    </div>
                    <span style={{
                        background: driverList.length > 0 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#475569',
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: 20,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        marginLeft: 8,
                        boxShadow: driverList.length > 0 ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none'
                    }}>
                        {driverList.length} activo{driverList.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        color: '#e2e8f0',
                        padding: '8px 16px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 500,
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                >
                    Cerrar
                </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
                {/* Floating Driver Panel - Glassmorphism */}
                <div style={{
                    position: 'absolute',
                    top: 16,
                    left: 16,
                    width: 300,
                    maxHeight: 'calc(100% - 32px)',
                    background: 'rgba(15, 23, 42, 0.95)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderRadius: 16,
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                    overflowY: 'auto',
                    padding: 16,
                    zIndex: 500
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <h3 style={{ color: '#e2e8f0', margin: 0, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                            <Users size={16} color="#10b981" />
                            Conductores
                        </h3>
                        <span style={{
                            background: 'rgba(16, 185, 129, 0.2)',
                            color: '#10b981',
                            padding: '2px 8px',
                            borderRadius: 10,
                            fontSize: '0.7rem',
                            fontWeight: 600
                        }}>
                            {driverList.length} en línea
                        </span>
                    </div>

                    {driverList.length === 0 ? (
                        <div style={{
                            padding: 24,
                            textAlign: 'center',
                            color: '#64748b'
                        }}>
                            <div style={{
                                width: 48,
                                height: 48,
                                background: 'rgba(100, 116, 139, 0.2)',
                                borderRadius: 12,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 12px'
                            }}>
                                <RefreshCw size={24} style={{ opacity: 0.5 }} />
                            </div>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                                Sin conductores activos
                            </p>
                            <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                                Aparecerán al iniciar ruta
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {driverList.map(driver => (
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
                                        background: selectedDriver === driver.driverId
                                            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.1) 100%)'
                                            : 'rgba(255, 255, 255, 0.05)',
                                        borderRadius: 12,
                                        cursor: 'pointer',
                                        border: selectedDriver === driver.driverId
                                            ? '1px solid rgba(16, 185, 129, 0.5)'
                                            : '1px solid rgba(255, 255, 255, 0.08)',
                                        transition: 'all 0.2s ease'
                                    }}
                                    onMouseEnter={e => {
                                        if (selectedDriver !== driver.driverId) {
                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                                        }
                                    }}
                                    onMouseLeave={e => {
                                        if (selectedDriver !== driver.driverId) {
                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                                        }
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: '50%',
                                            background: '#10b981',
                                            boxShadow: '0 0 10px rgba(16, 185, 129, 0.6)',
                                            animation: 'pulse 2s infinite'
                                        }} />
                                        <div style={{ flex: 1 }}>
                                            <span style={{ color: '#f1f5f9', fontWeight: 600, display: 'block', fontSize: '0.9rem' }}>
                                                {resolveDriverInfo(driver.driverId).name}
                                            </span>
                                            {resolveDriverInfo(driver.driverId).cuadrilla && (
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    color: '#f59e0b',
                                                    background: 'rgba(245, 158, 11, 0.15)',
                                                    padding: '2px 6px',
                                                    borderRadius: 4,
                                                    display: 'inline-block',
                                                    marginTop: 4
                                                }}>
                                                    {resolveDriverInfo(driver.driverId).cuadrilla}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, color: '#64748b', fontSize: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Clock size={12} />
                                            <span>{formatLastUpdate(driver.lastUpdate)}</span>
                                        </div>
                                        {driver.speed && (
                                            <span style={{ color: '#10b981', fontWeight: 500 }}>
                                                {Math.round(driver.speed * 3.6)} km/h
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Map */}
                <div style={{ flex: 1, position: 'relative' }}>
                    <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

                    {/* Map Style Picker */}
                    <div style={{
                        position: 'absolute',
                        top: 16,
                        right: 60,
                        zIndex: 50
                    }}>
                        <button
                            onClick={() => setShowStylePicker(!showStylePicker)}
                            style={{
                                background: 'rgba(15, 23, 42, 0.9)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: 10,
                                padding: '10px 14px',
                                color: '#e2e8f0',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: '0.85rem',
                                fontWeight: 500,
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                            }}
                        >
                            🌐 Estilo de Mapa
                        </button>
                        {showStylePicker && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: 8,
                                background: 'rgba(15, 23, 42, 0.95)',
                                backdropFilter: 'blur(12px)',
                                WebkitBackdropFilter: 'blur(12px)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: 12,
                                padding: 8,
                                minWidth: 160,
                                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
                            }}>
                                {Object.entries(MAP_STYLES).map(([key, style]) => (
                                    <button
                                        key={key}
                                        onClick={() => { setMapStyle(key); setShowStylePicker(false); }}
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            padding: '10px 14px',
                                            background: mapStyle === key
                                                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                                : 'transparent',
                                            border: 'none',
                                            borderRadius: 8,
                                            color: mapStyle === key ? 'white' : '#94a3b8',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            fontSize: '0.85rem',
                                            fontWeight: mapStyle === key ? 600 : 400,
                                            marginBottom: 4,
                                            transition: 'all 0.15s'
                                        }}
                                        onMouseEnter={e => { if (mapStyle !== key) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                                        onMouseLeave={e => { if (mapStyle !== key) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        {style.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

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
