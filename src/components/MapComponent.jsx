import React, { useState, useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { io } from 'socket.io-client';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getGoogleRoute } from '../utils/googleDirectionsService';
import { reverseGeocode, setUserLocation } from '../utils/geocodingService';
import { Plus, Minus, Maximize, LocateFixed, Layers, MapPin, Hand, Compass, Box, Car, Trash2 } from 'lucide-react';

const MAP_STYLES = {
    dark: { name: 'Oscuro', url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', icon: '🌙', type: 'vector' },
    google_standard: { name: 'Google Maps', url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', icon: '🗺️', type: 'raster' },
    google_satellite: { name: 'Satélite', url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', icon: '🛰️', type: 'raster' },
    google_hybrid: { name: 'Híbrido', url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', icon: '🌍', type: 'raster' },
    google_terrain: { name: 'Terreno', url: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', icon: '⛰️', type: 'raster' }
};

const MapComponent = ({ waypoints, setWaypoints, onAddWaypoint, previewRoute, onClearPreview, onClearRoute, fixedStartConfigured, fixedEndConfigured, returnToStart, travelMode = 'driving' }) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const markersRef = useRef([]);
    const previewMarkersRef = useRef([]);
    const userMarkerRef = useRef(null);
    const currentRouteCoords = useRef([]);
    const previewRouteCoords = useRef([]);
    const driverMarkersRef = useRef({}); // New ref for driver markers { driverId: marker }

    // Socket.io Connection for Driver Tracking
    useEffect(() => {
        // Connect to the Production Backend
        const socket = io('https://dashboard-backend.zvkdyr.easypanel.host', { transports: ['websocket'] });

        socket.on('connect', () => {
            console.log('🗺️ Map connected to backend tracking');
        });

        socket.on('admin:driver-update', (data) => {
            // console.log('📍 Driver Update:', data);
            const { driverId, location } = data;

            if (!map.current || !location) return;

            // Update or Create Marker
            if (driverMarkersRef.current[driverId]) {
                // Animate to new position
                driverMarkersRef.current[driverId].setLngLat([location.lng, location.lat]);
            } else {
                // Create new marker
                const el = document.createElement('div');
                el.className = 'driver-marker';
                el.innerHTML = `
                    <div style="background: #10b981; border: 2px solid white; border-radius: 50%; width: 24px; height: 24px; box-shadow: 0 0 10px rgba(16,185,129,0.5); display: flex; align-items: center; justify-content: center;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>
                    </div>
                `;

                // Add label popup logic if needed, for now just the icon
                driverMarkersRef.current[driverId] = new maplibregl.Marker({ element: el })
                    .setLngLat([location.lng, location.lat])
                    .addTo(map.current);
            }
        });

        return () => {
            if (socket) socket.disconnect();
        };
    }, []);

    const [mapReady, setMapReady] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const [currentStyle, setCurrentStyle] = useState('dark');
    const [showStylePicker, setShowStylePicker] = useState(false);
    const [addPointMode, setAddPointMode] = useState(false);
    const [is3D, setIs3D] = useState(false);
    const [showTraffic, setShowTraffic] = useState(false);

    // Robust layer addition
    const addRouteLayers = useCallback(() => {
        if (!map.current || !map.current.isStyleLoaded()) return;

        const styleKey = currentStyle;
        const isSatellite = styleKey === 'google_satellite' || styleKey === 'google_hybrid';

        // Traffic layer
        if (showTraffic) {
            if (!map.current.getSource('traffic')) {
                map.current.addSource('traffic', {
                    type: 'raster',
                    tiles: ['https://mt0.google.com/vt?lyrs=h,traffic&x={x}&y={y}&z={z}'],
                    tileSize: 256
                });
            }
            if (!map.current.getLayer('traffic-layer')) {
                map.current.addLayer({
                    id: 'traffic-layer',
                    type: 'raster',
                    source: 'traffic',
                    paint: { 'raster-opacity': 0.8 }
                });
            }
        } else {
            if (map.current.getLayer('traffic-layer')) map.current.removeLayer('traffic-layer');
            if (map.current.getSource('traffic')) map.current.removeSource('traffic');
        }

        // Main Route
        if (!map.current.getSource('route')) {
            map.current.addSource('route', {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: currentRouteCoords.current.length > 0 ? currentRouteCoords.current : [] }
                }
            });
        }
        if (!map.current.getLayer('route-line')) {
            // Define route colors based on travel mode
            const routeColors = {
                driving: '#3b82f6',   // Blue for driving
                walking: '#f59e0b',   // Orange for walking
                bicycle: '#10b981'    // Green for bicycle
            };
            const routeColor = isSatellite ? '#ffffff' : (routeColors[travelMode] || '#3b82f6');

            map.current.addLayer({
                id: 'route-line',
                type: 'line',
                source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': routeColor,
                    'line-width': travelMode === 'walking' ? 5 : 6, // Slightly thinner for walking
                    'line-opacity': 0.9,
                    'line-dasharray': travelMode === 'walking' ? [3, 2] : [1, 0] // Dashed for walking
                }
            });
        }

        // Preview Route
        if (!map.current.getSource('preview-route')) {
            map.current.addSource('preview-route', {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: previewRouteCoords.current.length > 0 ? previewRouteCoords.current : [] }
                }
            });
        }
        if (!map.current.getLayer('preview-route-line')) {
            map.current.addLayer({
                id: 'preview-route-line',
                type: 'line',
                source: 'preview-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#10b981',
                    'line-width': 5,
                    'line-opacity': 0.8,
                    'line-dasharray': [2, 2]
                }
            });
        }
    }, [currentStyle, showTraffic]);

    // Update route color when travel mode changes
    useEffect(() => {
        if (!map.current || !mapReady) return;
        if (!map.current.getLayer('route-line')) return;

        const routeColors = {
            driving: '#3b82f6',   // Blue for driving
            walking: '#f59e0b',   // Orange for walking  
            bicycle: '#10b981'    // Green for bicycle
        };
        const routeColor = routeColors[travelMode] || '#3b82f6';

        map.current.setPaintProperty('route-line', 'line-color', routeColor);
        map.current.setPaintProperty('route-line', 'line-width', travelMode === 'walking' ? 5 : 6);
        map.current.setPaintProperty('route-line', 'line-dasharray', travelMode === 'walking' ? [3, 2] : [1, 0]);
    }, [travelMode, mapReady]);

    // Handle map initialization
    useEffect(() => {
        if (map.current) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: MAP_STYLES.dark.url,
            center: [-74.7813, 10.9685],
            zoom: 12,
        });

        map.current.on('load', () => {
            setMapReady(true);
        });


        // Automatic geolocation removed by user request. 
        // Use the "My Location" button (handleLocateUser) instead.

        return () => {
            // Cleanup on unmount only
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, []); // Run once

    // Handle Style Data Listener (Separated to avoid stale closures)
    useEffect(() => {
        if (!map.current) return;

        const handleStyleData = () => {
            if (map.current.isStyleLoaded()) {
                addRouteLayers();
            }
        };

        map.current.on('styledata', handleStyleData);

        // Initial call in case we missed the load event or are re-attaching
        if (map.current.isStyleLoaded()) {
            addRouteLayers();
        }

        return () => {
            map.current?.off('styledata', handleStyleData);
        };
    }, [addRouteLayers]); // Re-attach when dependency changes

    // Update Route
    useEffect(() => {
        if (!map.current || !mapReady) return;

        const update = async () => {
            if (waypoints.length < 2) {
                currentRouteCoords.current = [];
                if (map.current.getSource('route')) {
                    map.current.getSource('route').setData({
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates: [] }
                    });
                }
                return;
            }

            // Use Google Directions instead of OSRM (Google is "Gold Standard") - Default to original order (non-optimized)
            const result = await getGoogleRoute(waypoints, { optimize: false, travelMode: 'driving' });

            if (result?.success && result.coordinates) {
                currentRouteCoords.current = result.coordinates;

                // Ensure source exists (in case style changed or layer wasn't added yet)
                if (!map.current.getSource('route')) {
                    addRouteLayers();
                }

                // Double check if source exists now
                if (map.current.getSource('route')) {
                    map.current.getSource('route').setData({
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates: result.coordinates }
                    });

                    const bounds = new maplibregl.LngLatBounds();
                    waypoints.forEach(wp => bounds.extend([wp.lng, wp.lat]));
                    map.current.fitBounds(bounds, { padding: 80 });
                }
            }
        };
        update();
    }, [waypoints, mapReady, addRouteLayers]); // Re-added addRouteLayers dependency safely

    // Map Click Handler for Adding Points
    useEffect(() => {
        if (!map.current) return;

        const handleMapClick = async (e) => {
            if (!addPointMode) return;

            const { lng, lat } = e.lngLat;

            // Visual feedback (temporary marker)
            const el = document.createElement('div');
            el.innerHTML = '<div style="width:12px;height:12px;background:#3b82f6;border-radius:50%;opacity:0.6;animation:ping 1s cubic-bezier(0,0,0.2,1) infinite;"></div>';
            const tempMarker = new maplibregl.Marker({ element: el })
                .setLngLat([lng, lat])
                .addTo(map.current);

            try {
                const result = await reverseGeocode(lat, lng);
                if (result.success) {
                    const newPoint = { lng, lat, address: result.shortAddress };
                    if (onAddWaypoint) {
                        onAddWaypoint(newPoint);
                    } else if (setWaypoints) {
                        setWaypoints(prev => [...prev, newPoint]);
                    }
                    // Keep mode active for multiple points
                }
            } catch (error) {
                console.error("Error adding point:", error);
            } finally {
                tempMarker.remove();
            }
        };

        map.current.on('click', handleMapClick);

        // Update cursor
        map.current.getCanvas().style.cursor = addPointMode ? 'crosshair' : 'grab';

        return () => {
            map.current?.off('click', handleMapClick);
            if (map.current) map.current.getCanvas().style.cursor = 'grab';
        };
    }, [addPointMode, setWaypoints, onAddWaypoint]);

    // Update Markers
    useEffect(() => {
        if (!map.current) return;
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];

        waypoints.forEach((wp, i) => {
            const el = document.createElement('div');
            const isStart = fixedStartConfigured && i === 0;
            const isEnd = fixedEndConfigured && waypoints.length > 1 && i === waypoints.length - 1;

            if (returnToStart && isEnd) return;

            const isRoundTripStart = returnToStart && isStart;
            let innerHTML = '';

            if (isRoundTripStart) {
                // Combined Start/End Marker (Split Green/Red)
                innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:44px;height:44px;background:linear-gradient(135deg, #22c55e 50%, #ef4444 50%);color:white;border-radius:50%;border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.4);font-weight:bold;cursor:pointer;z-index:15;" title="Inicio y Fin de Ruta">
                    <div style="display:flex; gap:2px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                    </div>
                </div>`;
            } else if (isStart) {
                // Green Marker for Start
                innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:linear-gradient(135deg,#22c55e,#16a34a);color:white;border-radius:50%;border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-weight:bold;font-size:16px;cursor:pointer;z-index:10;" title="Punto de Inicio">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                </div>`;
            } else if (isEnd) {
                // Red Marker for End
                innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:linear-gradient(135deg,#ef4444,#dc2626);color:white;border-radius:50%;border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-weight:bold;font-size:16px;cursor:pointer;z-index:10;" title="Punto Final">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
                </div>`;
            } else {
                // Blue Marker for Intermediates
                innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:linear-gradient(135deg,#3b82f6,#6366f1);color:white;border-radius:50%;border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-weight:700;font-size:14px;cursor:pointer;" title="Parada ${i + 1}">${i + (fixedStartConfigured ? 0 : 1)}</div>`;
            }

            el.innerHTML = innerHTML;
            el.onclick = (e) => {
                e.stopPropagation(); // Prevent map click
            };

            const marker = new maplibregl.Marker({ element: el })
                .setLngLat([wp.lng, wp.lat])
                .addTo(map.current);

            markersRef.current.push(marker);
        });
    }, [waypoints, fixedStartConfigured, fixedEndConfigured, returnToStart]);

    // Handle Preview
    useEffect(() => {
        if (!map.current || !mapReady) return;

        if (previewRoute?.coordinates) {
            previewRouteCoords.current = previewRoute.coordinates;

            // Ensure source exists
            if (!map.current.getSource('preview-route')) {
                addRouteLayers();
            }

            if (map.current.getSource('preview-route')) {
                map.current.getSource('preview-route').setData({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: previewRoute.coordinates }
                });
            }
            // Fit bounds
            const bounds = new maplibregl.LngLatBounds();
            previewRoute.coordinates.forEach(c => bounds.extend(c));
            map.current.fitBounds(bounds, { padding: 200, maxZoom: 15 });
        } else {
            previewRouteCoords.current = [];
            if (map.current.getSource('preview-route')) {
                map.current.getSource('preview-route').setData({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: [] }
                });
            }
        }
    }, [previewRoute, mapReady, addRouteLayers]);

    // Locate user
    const handleLocateUser = () => {
        if (!navigator.geolocation) return;
        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { longitude, latitude } = pos.coords;
                if (userMarkerRef.current) userMarkerRef.current.remove();
                const el = document.createElement('div');
                el.style.cssText = 'width:18px;height:18px;background:#22c55e;border:3px solid white;border-radius:50%;box-shadow:0 0 0 8px rgba(34,197,94,0.3)';
                userMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([longitude, latitude]).addTo(map.current);
                map.current.flyTo({ center: [longitude, latitude], zoom: 16 });
                setUserLocation(latitude, longitude);
                setIsLocating(false);
            },
            () => setIsLocating(false),
            { enableHighAccuracy: true }
        );
    };

    const changeStyle = (styleKey) => {
        if (!map.current || styleKey === currentStyle) return;
        const config = MAP_STYLES[styleKey];

        if (config.type === 'raster') {
            map.current.setStyle({
                version: 8,
                sources: {
                    'google-tiles': {
                        type: 'raster',
                        tiles: [config.url],
                        tileSize: 256,
                        attribution: 'Google Maps'
                    }
                },
                layers: [
                    {
                        id: 'google-layer',
                        type: 'raster',
                        source: 'google-tiles',
                        minzoom: 0,
                        maxzoom: 22
                    }
                ],
                glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf"
            }, { diff: false });
        } else {
            map.current.setStyle(config.url, { diff: false });
        }
        setCurrentStyle(styleKey);
        setShowStylePicker(false);

        // Force re-add layers after a short delay to ensure they appear
        // even if styledata fires too early or late
        setTimeout(() => {
            if (map.current && map.current.isStyleLoaded()) {
                addRouteLayers();
            }
        }, 500);
    };

    const btnStyle = { width: '40px', height: '40px', background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' };

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

            {/* Mode indicators */}
            {addPointMode && (
                <div style={{ position: 'absolute', top: 110, left: '50%', transform: 'translateX(-50%)', background: 'rgba(59,130,246,0.9)', color: 'white', padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, zIndex: 1100, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MapPin size={16} /> Modo Agregar Puntos
                </div>
            )}

            {/* Preview mode indicator */}
            {previewRoute && (
                <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(16,185,129,0.95)', color: 'white', padding: '10px 20px', borderRadius: 20, fontSize: 13, fontWeight: 600, zIndex: 20, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                    <span>👁️ Vista Previa: {previewRoute.name}</span>
                    <span style={{ opacity: 0.8 }}>|</span>
                    <span>{previewRoute.distanceKm} km · {previewRoute.durationInTrafficFormatted || previewRoute.durationFormatted}</span>
                    {onClearPreview && (
                        <button onClick={onClearPreview} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '4px 10px', color: 'white', cursor: 'pointer', fontSize: 12 }}>✕ Cerrar</button>
                    )}
                </div>
            )}

            {/* Controls */}
            <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 10 }}>
                <button onClick={() => map.current?.zoomIn()} style={btnStyle} title="Acercar"><Plus size={20} /></button>
                <button onClick={() => map.current?.zoomOut()} style={btnStyle} title="Alejar"><Minus size={20} /></button>
                <button onClick={() => setShowTraffic(!showTraffic)} style={{ ...btnStyle, background: showTraffic ? '#ea580c' : 'rgba(15,23,42,0.9)' }} title="Tráfico"><Car size={20} /></button>
                <button onClick={() => setAddPointMode(!addPointMode)} style={{ ...btnStyle, background: addPointMode ? '#3b82f6' : 'rgba(15,23,42,0.9)' }} title="Agregar puntos"><MapPin size={20} /></button>

                {waypoints.length > 0 && (
                    <button
                        onClick={() => onClearRoute ? onClearRoute() : setWaypoints([])}
                        style={{ ...btnStyle, background: 'rgba(239,68,68,0.9)', borderColor: '#ef4444' }}
                        title="Limpiar Ruta"
                    >
                        <Trash2 size={20} />
                    </button>
                )}

                <button onClick={() => setShowStylePicker(!showStylePicker)} style={{ ...btnStyle, background: showStylePicker ? '#6366f1' : 'rgba(15,23,42,0.9)' }} title="Estilos"><Layers size={20} /></button>
                <button onClick={() => { setIs3D(!is3D); map.current?.easeTo({ pitch: !is3D ? 60 : 0, bearing: !is3D ? -20 : 0, duration: 500 }); }} style={{ ...btnStyle, background: is3D ? '#10b981' : 'rgba(15,23,42,0.9)' }} title="3D"><Box size={20} /></button>
                <button onClick={() => map.current?.easeTo({ bearing: 0, duration: 300 })} style={btnStyle} title="Norte"><Compass size={20} /></button>
                <button onClick={() => mapContainer.current?.requestFullscreen?.()} style={btnStyle} title="Fullscreen"><Maximize size={20} /></button>
                <button onClick={handleLocateUser} style={{ ...btnStyle, background: isLocating ? 'rgba(34,197,94,0.8)' : 'rgba(15,23,42,0.9)' }} title="Mi ubicación"><LocateFixed size={20} /></button>
            </div>

            {/* Style Picker */}
            {showStylePicker && (
                <div style={{ position: 'absolute', top: 16, right: 70, background: 'rgba(15,23,42,0.95)', borderRadius: 12, padding: 12, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 4 }}>Estilo de Mapa</div>
                    {Object.entries(MAP_STYLES).map(([key, style]) => (
                        <button key={key} onClick={() => changeStyle(key)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: currentStyle === key ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.05)', border: currentStyle === key ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white', cursor: 'pointer', fontSize: 13 }}>
                            <span>{style.icon}</span> {style.name}
                        </button>
                    ))}
                </div>
            )}

        </div>
    );
};

export default MapComponent;
