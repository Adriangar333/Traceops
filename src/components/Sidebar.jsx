import React, { useState, useEffect, useRef } from 'react';
import { Navigation, Search, Bot, X, Zap, Clock, Route, Upload, Send, Trash2, Users, Save, FolderOpen, BarChart3, Check, MapPin, Home, Flag, ChevronDown, ChevronUp, Settings, Play, Menu, Info } from 'lucide-react';
import { geocodeAddress, searchAddressSuggestions, reverseGeocode, geocodeByPlaceId, searchPlaces } from '../utils/geocodingService';
import { sendToGemini } from '../utils/geminiService';
import { fetchRouteWithStats, generateRouteOptions } from '../utils/osrmService';
import { getGoogleRoute, generateGoogleRouteOptions } from '../utils/googleDirectionsService';

const Sidebar = ({
    waypoints, setWaypoints,
    fixedStart, setFixedStart,
    fixedEnd, setFixedEnd,
    returnToStart, setReturnToStart,
    agents, selectedAgent, setSelectedAgent,
    savedRoutes, onSaveRoute, onLoadRoute, onDeleteRoute,
    onAssign, isSubmitting, onOpenAgents, onOpenDashboard,
    onPreviewRoute, onApplyRoute
}) => {
    // Core states
    const [addressInput, setAddressInput] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [routeStats, setRouteStats] = useState(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [routeOptions, setRouteOptions] = useState([]);
    const [showRouteOptions, setShowRouteOptions] = useState(false);
    const [selectedRouteOption, setSelectedRouteOption] = useState(null);
    const [expandedInfo, setExpandedInfo] = useState(null);

    // Panel states
    const [activePanel, setActivePanel] = useState(null); // 'config', 'routes', 'import', 'ai'
    const [mobileCollapsed, setMobileCollapsed] = useState(true); // For mobile view

    const [configInput, setConfigInput] = useState('');
    const [configType, setConfigType] = useState(null);
    const [configSuggestions, setConfigSuggestions] = useState([]);
    const [showConfigSuggestions, setShowConfigSuggestions] = useState(false);

    // AI Chat
    const [chatInput, setChatInput] = useState('');
    const [chatMessages, setChatMessages] = useState([
        { role: 'assistant', content: '¡Hola! Soy RouteBot 🤖\nPuedo agregar direcciones, coordenadas y optimizar rutas.' }
    ]);
    const [isAiThinking, setIsAiThinking] = useState(false);

    // Routes
    const [routeName, setRouteName] = useState('');
    const [bulkInput, setBulkInput] = useState('');

    const searchTimeout = useRef(null);

    // Fetch route stats
    useEffect(() => {
        const getStats = async () => {
            if (waypoints.length < 2) { setRouteStats(null); return; }
            const result = await fetchRouteWithStats(waypoints);
            if (result?.success) setRouteStats(result);
        };
        getStats();
    }, [waypoints]);

    // Autocomplete
    useEffect(() => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (addressInput.length < 3) { setSuggestions([]); return; }

        searchTimeout.current = setTimeout(async () => {
            const results = await searchAddressSuggestions(addressInput, 5);
            setSuggestions(results);
            setShowSuggestions(results.length > 0);
        }, 400);

        return () => clearTimeout(searchTimeout.current);
    }, [addressInput]);

    // Autocomplete for Config
    useEffect(() => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (configInput.length < 3) { setConfigSuggestions([]); return; }

        searchTimeout.current = setTimeout(async () => {
            const results = await searchAddressSuggestions(configInput, 5);
            setConfigSuggestions(results);
            setShowConfigSuggestions(results.length > 0);
        }, 400);

        return () => clearTimeout(searchTimeout.current);
    }, [configInput]);

    const handleSelectSuggestion = async (suggestion) => {
        setShowSuggestions(false);
        setSuggestions([]);
        setAddressInput('');

        // Google Places provides placeId, need to geocode to get coordinates
        if (suggestion.placeId) {
            const result = await geocodeByPlaceId(suggestion.placeId);
            if (result.success) {
                setWaypoints(prev => [...prev, { lng: result.lng, lat: result.lat, address: suggestion.shortName }]);
            }
        } else if (suggestion.lat && suggestion.lng) {
            // Fallback for other providers
            setWaypoints(prev => [...prev, { lng: suggestion.lng, lat: suggestion.lat, address: suggestion.shortName }]);
        }
    };

    const handleAddAddress = async () => {
        if (!addressInput.trim()) return;
        setIsGeocoding(true);
        setShowSuggestions(false);
        const result = await geocodeAddress(addressInput);
        setIsGeocoding(false);
        if (result.success) {
            setWaypoints(prev => [...prev, { lng: result.lng, lat: result.lat, address: result.displayName.split(',').slice(0, 2).join(', ') }]);
            setAddressInput('');
        }
    };

    const handleSelectConfigSuggestion = async (suggestion) => {
        setShowConfigSuggestions(false);
        setConfigSuggestions([]);
        setConfigInput(''); // Clear input, but value is set in fixedStart/End
        setIsGeocoding(true);

        let point = null;
        if (suggestion.placeId) {
            const result = await geocodeByPlaceId(suggestion.placeId);
            if (result.success) point = { lat: result.lat, lng: result.lng, address: suggestion.shortName };
        } else if (suggestion.lat && suggestion.lng) {
            point = { lat: suggestion.lat, lng: suggestion.lng, address: suggestion.shortName };
        }

        setIsGeocoding(false);

        if (point) {
            if (configType === 'start') setFixedStart(point);
            else if (configType === 'end') setFixedEnd(point);
            setConfigType(null);
        }
    };

    const handleSetConfig = async () => {
        if (!configInput.trim()) return;
        setIsGeocoding(true);
        const result = await geocodeAddress(configInput);
        setIsGeocoding(false);

        if (result.success) {
            const point = { lat: result.lat, lng: result.lng, address: result.displayName.split(',').slice(0, 2).join(', ') };
            if (configType === 'start') setFixedStart(point);
            else if (configType === 'end') setFixedEnd(point);
            setConfigInput('');
            setConfigType(null);
        }
    };

    const handleOptimize = async () => {
        if (waypoints.length < 2) return;
        setIsOptimizing(true);

        let allWaypoints = [...waypoints];
        if (fixedStart) allWaypoints = [fixedStart, ...allWaypoints.filter(wp => wp.lat !== fixedStart.lat)];
        if (returnToStart && fixedStart) allWaypoints = [...allWaypoints, fixedStart];
        else if (fixedEnd) allWaypoints = [...allWaypoints.filter(wp => wp.lat !== fixedEnd.lat), fixedEnd];

        // Pass route configuration to optimization algorithms
        const routeConfig = {
            fixedStart: !!fixedStart,
            fixedEnd: !!fixedEnd,
            returnToStart: returnToStart
        };

        // Try Google Directions first (has traffic data)
        let result = await generateGoogleRouteOptions(allWaypoints, routeConfig);

        // Fallback to OSRM if Google fails
        if (!result?.success || !result.options?.length) {
            console.log('Google Directions failed, using OSRM fallback');
            result = await generateRouteOptions(allWaypoints);
        }

        setIsOptimizing(false);

        if (result?.success && result.options) {
            setRouteOptions(result.options);
            setShowRouteOptions(true);
        }
    };

    // When user clicks an option, show PREVIEW first (don't apply yet)
    const handlePreviewRouteOption = (option) => {
        if (onPreviewRoute) {
            onPreviewRoute(option);
        }
        setSelectedRouteOption(option);
    };

    // When user confirms the preview, apply the route
    const handleApplySelectedRoute = () => {
        if (selectedRouteOption && onApplyRoute) {
            onApplyRoute(selectedRouteOption);

            const duration = selectedRouteOption.durationInTrafficFormatted || selectedRouteOption.durationFormatted;
            setRouteStats({
                distanceKm: selectedRouteOption.distanceKm,
                durationFormatted: duration,
                hasTraffic: selectedRouteOption.hasTrafficData,
                success: true
            });
        }
        setShowRouteOptions(false);
        setSelectedRouteOption(null);
    };

    const handleBulkImport = async () => {
        if (!bulkInput.trim()) return;
        const lines = bulkInput.split('\n').filter(l => l.trim());
        setIsGeocoding(true);
        const newWaypoints = [];
        for (const line of lines) {
            const result = await geocodeAddress(line.trim());
            if (result.success) newWaypoints.push({ lng: result.lng, lat: result.lat, address: result.displayName.split(',').slice(0, 2).join(', ') });
            await new Promise(r => setTimeout(r, 200));
        }
        setIsGeocoding(false);
        setWaypoints(prev => [...prev, ...newWaypoints]);
        setBulkInput('');
        setActivePanel(null);
    };

    const handleSendChat = async () => {
        if (!chatInput.trim()) return;
        setChatMessages(prev => [...prev, { role: 'user', content: chatInput }]);
        const userMsg = chatInput;
        setChatInput('');
        setIsAiThinking(true);

        const result = await sendToGemini(userMsg, `Paradas: ${waypoints.length}`);
        setIsAiThinking(false);

        if (result.success && result.action) {
            const { action } = result;
            if (action.action === 'chat') {
                setChatMessages(prev => [...prev, { role: 'assistant', content: action.response || 'Entendido.' }]);

            } else if (action.action === 'search_places' && action.query) {
                // Try to geocode the query (Google Geocoding API handles "restaurant", "gas station" etc. if near user)
                setChatMessages(prev => [...prev, { role: 'assistant', content: `🔎 Buscando "${action.query}"...` }]);
                const geo = await searchPlaces(action.query, 5);

                if (geo.success && geo.places && geo.places.length > 0) {
                    setChatMessages(prev => [...prev, {
                        role: 'assistant',
                        type: 'places',
                        content: `✅ Encontré ${geo.places.length} opciones para "${action.query}":`,
                        places: geo.places
                    }]);
                } else {
                    setChatMessages(prev => [...prev, { role: 'assistant', content: `❌ No encontré lugares para "${action.query}".` }]);
                }

            } else if (action.action === 'add_coordinates' && action.coordinates) {
                const newWps = [];
                for (const c of action.coordinates) {
                    const rev = await reverseGeocode(c.lat, c.lng);
                    newWps.push({ lat: c.lat, lng: c.lng, address: rev.success ? rev.shortAddress : `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}` });
                }
                setWaypoints(prev => [...prev, ...newWps]);
                setChatMessages(prev => [...prev, { role: 'assistant', content: `✅ ${newWps.length} puntos agregados. ${action.optimize ? 'Optimizando...' : ''}` }]);
                if (action.optimize) setTimeout(() => handleOptimize(), 500);

            } else if (action.action === 'add_address' && action.address) {
                const geo = await geocodeAddress(action.address);
                if (geo.success) {
                    setWaypoints(prev => [...prev, { lng: geo.lng, lat: geo.lat, address: geo.displayName.split(',')[0] }]);
                    setChatMessages(prev => [...prev, { role: 'assistant', content: `✅ Agregado: ${geo.displayName.split(',')[0]}` }]);
                } else {
                    setChatMessages(prev => [...prev, { role: 'assistant', content: `❌ No pude encontrar la dirección: ${action.address}` }]);
                }

            } else if (action.action === 'optimize') {
                handleOptimize();
                setChatMessages(prev => [...prev, { role: 'assistant', content: '⚡ Optimizando ruta...' }]);

            } else if (action.action === 'clear_route') {
                setWaypoints([]);
                setChatMessages(prev => [...prev, { role: 'assistant', content: '🗑️ Ruta eliminada.' }]);
            }
        }
    };

    // Styles
    const styles = {
        sidebar: {
            position: 'absolute', top: 16, left: 16, zIndex: 100, width: 380,
            maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
            background: '#ffffff', // White corporate background
            borderRadius: 16, boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1)', // Softer shadow
            border: '1px solid #e2e8f0', fontFamily: 'Inter, system-ui', color: '#0f172a',
            transition: 'all 0.3s ease'
        },
        header: {
            padding: isMobile ? 'calc(env(safe-area-inset-top) + 12px) 16px 12px' : '20px 24px',
            background: isMobile ? (mobileCollapsed ? 'transparent' : '#ffffff') : '#ffffff',
            borderBottom: isMobile && mobileCollapsed ? 'none' : '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pointerEvents: 'auto'
        },
        section: { padding: '16px 20px', borderBottom: '1px solid #f1f5f9' },
        input: {
            width: '100%', padding: '12px 16px', background: '#f8fafc',
            border: '1px solid #e2e8f0', borderRadius: 12,
            fontSize: 14, color: '#0f172a', outline: 'none', boxSizing: 'border-box',
            transition: 'border-color 0.2s',
        },
        btn: {
            padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s'
        },
        primaryBtn: { background: '#9DBD39', color: 'white', boxShadow: '0 2px 5px rgba(157, 189, 57, 0.3)' }, // ISES Green
        secondaryBtn: { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' },
        successBtn: { background: '#9DBD39', color: 'white' },
        iconBtn: { width: 40, height: 40, borderRadius: 12, border: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
        stat: { flex: 1, padding: '14px 16px', background: '#f8fafc', borderRadius: 14, textAlign: 'center', border: '1px solid #e2e8f0' },
        waypoint: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'white', border: '1px solid #f1f5f9', borderRadius: 10, marginBottom: 6 },
        badge: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600 }
    };

    const togglePanel = (panel) => setActivePanel(activePanel === panel ? null : panel);

    const isCarouselMode = isMobile && showRouteOptions;

    return (
        <div className={`admin-sidebar ${mobileCollapsed && !isCarouselMode ? 'collapsed' : ''}`}
            style={isCarouselMode ? { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100 } : styles.sidebar}>

            {/* Standard Sidebar Content - Hide in Carousel Mode */}
            {!isCarouselMode && (
                <>
                    {/* Header */}
                    <div style={styles.header}>
                        {/* Mobile Toggle Button */}
                        <button
                            className="mobile-toggle-btn"
                            onClick={() => setMobileCollapsed(!mobileCollapsed)}
                            style={{
                                display: 'none', // Hidden by default, shown via CSS on mobile
                                position: 'absolute', top: 16, right: 16,
                                width: 40, height: 40, borderRadius: 12, border: 'none',
                                background: 'rgba(59,130,246,0.2)', cursor: 'pointer',
                                alignItems: 'center', justifyContent: 'center'
                            }}
                        >
                            {mobileCollapsed ? <Menu size={20} color="#3b82f6" /> : <X size={20} color="#3b82f6" />}
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 44, height: 44, background: '#9DBD39', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(157,189,57,0.3)' }}>
                                    <img
                                        src="https://ises-sas.com/wp-content/uploads/2021/08/logo-ises-sas.png"
                                        alt="ISES"
                                        style={{ width: '80%', height: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
                                        onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'block'; }}
                                    />
                                    <div style={{ display: 'none', color: 'white' }}><Navigation size={22} /></div>
                                </div>
                                <div>
                                    <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>ISES Rutas</h1>
                                    <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>Soluciones Especializadas</p>
                                </div>
                            </div>
                        </div>

                        {/* Quick Actions */}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => togglePanel('config')} style={{ ...styles.iconBtn, background: activePanel === 'config' ? '#9DBD39' : 'white', boxShadow: activePanel === 'config' ? '0 4px 10px rgba(157,189,57,0.4)' : 'none' }} title="Configuración"><Settings size={18} color={activePanel === 'config' ? 'white' : '#64748b'} /></button>
                            <button onClick={() => togglePanel('routes')} style={{ ...styles.iconBtn, background: activePanel === 'routes' ? '#3b82f6' : 'white' }} title="Rutas guardadas"><FolderOpen size={18} color={activePanel === 'routes' ? 'white' : '#64748b'} /></button>
                            <button onClick={() => togglePanel('import')} style={{ ...styles.iconBtn, background: activePanel === 'import' ? '#f59e0b' : 'white' }} title="Importar"><Upload size={18} color={activePanel === 'import' ? 'white' : '#64748b'} /></button>
                            <button onClick={onOpenAgents} style={{ ...styles.iconBtn, background: 'white' }} title="Agentes"><Users size={18} color="#9DBD39" /></button>
                            <button onClick={onOpenDashboard} style={{ ...styles.iconBtn, background: 'white' }} title="Dashboard"><BarChart3 size={18} color="#9DBD39" /></button>
                        </div>
                    </div>

                    {activePanel === 'config' && (
                        <div className="panel-modal" style={{ ...styles.section, background: 'rgba(16,185,129,0.05)' }}>
                            <div className="panel-modal-header">
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#10b981', display: 'flex', alignItems: 'center', gap: 8 }}><Home size={18} /> Mi Negocio</h3>
                                <button className="panel-modal-close" onClick={() => setActivePanel(null)}><X size={20} /></button>
                            </div>

                            {/* Start Point */}
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontSize: 11, color: '#64748b', marginBottom: 6, display: 'block' }}>Punto de inicio</label>
                                {fixedStart ? (
                                    <div style={{ ...styles.badge, background: '#ecfdf5', color: '#10b981', justifyContent: 'space-between', width: '100%' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Home size={14} /> {fixedStart.address}</span>
                                        <button onClick={() => setFixedStart(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><X size={14} /></button>
                                    </div>
                                ) : configType === 'start' ? (
                                    <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
                                        <input
                                            value={configInput}
                                            onChange={e => setConfigInput(e.target.value)}
                                            onFocus={() => configSuggestions.length > 0 && setShowConfigSuggestions(true)}
                                            onBlur={() => setTimeout(() => setShowConfigSuggestions(false), 200)}
                                            placeholder="Buscar dirección..."
                                            style={{ ...styles.input, flex: 1 }}
                                            onKeyDown={e => e.key === 'Enter' && handleSetConfig()}
                                        />
                                        <button onClick={handleSetConfig} style={{ ...styles.btn, ...styles.successBtn }}><Check size={16} /></button>

                                        {/* Config Suggestions Dropdown */}
                                        {showConfigSuggestions && configSuggestions.length > 0 && configType === 'start' && (
                                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', borderRadius: '0 0 12px 12px', border: '1px solid #e2e8f0', maxHeight: 200, overflowY: 'auto', zIndex: 50, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                                {configSuggestions.map((s, i) => (
                                                    <div key={i} onMouseDown={e => { e.preventDefault(); handleSelectConfigSuggestion(s); }} style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }} onMouseEnter={e => e.currentTarget.style.background = '#ecfdf5'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                        <Home size={16} color="#10b981" />
                                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                                            <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{s.shortName}</div>
                                                            <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.displayName}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <button onClick={() => setConfigType('start')} style={{ ...styles.btn, ...styles.secondaryBtn, width: '100%', justifyContent: 'center' }}><Home size={14} /> Configurar inicio</button>
                                )}
                            </div>

                            {/* End Point */}
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontSize: 11, color: '#64748b', marginBottom: 6, display: 'block' }}>Punto de fin</label>
                                {fixedEnd && !returnToStart ? (
                                    <div style={{ ...styles.badge, background: '#fffbeb', color: '#f59e0b', justifyContent: 'space-between', width: '100%' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Flag size={14} /> {fixedEnd.address}</span>
                                        <button onClick={() => setFixedEnd(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><X size={14} /></button>
                                    </div>
                                ) : configType === 'end' ? (
                                    <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
                                        <input
                                            value={configInput}
                                            onChange={e => setConfigInput(e.target.value)}
                                            onFocus={() => configSuggestions.length > 0 && setShowConfigSuggestions(true)}
                                            onBlur={() => setTimeout(() => setShowConfigSuggestions(false), 200)}
                                            placeholder="Buscar dirección..."
                                            style={{ ...styles.input, flex: 1 }}
                                            onKeyDown={e => e.key === 'Enter' && handleSetConfig()}
                                        />
                                        <button onClick={handleSetConfig} style={{ ...styles.btn, background: '#f59e0b', color: 'white' }}><Check size={16} /></button>

                                        {/* Config Suggestions Dropdown */}
                                        {showConfigSuggestions && configSuggestions.length > 0 && configType === 'end' && (
                                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', borderRadius: '0 0 12px 12px', border: '1px solid #e2e8f0', maxHeight: 200, overflowY: 'auto', zIndex: 50, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                                {configSuggestions.map((s, i) => (
                                                    <div key={i} onMouseDown={e => { e.preventDefault(); handleSelectConfigSuggestion(s); }} style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }} onMouseEnter={e => e.currentTarget.style.background = '#fffbeb'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                        <Flag size={16} color="#f59e0b" />
                                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                                            <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{s.shortName}</div>
                                                            <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.displayName}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : !returnToStart && (
                                    <button onClick={() => setConfigType('end')} style={{ ...styles.btn, ...styles.secondaryBtn, width: '100%', justifyContent: 'center' }}><Flag size={14} /> Configurar fin</button>
                                )}
                            </div>

                            {/* Round Trip */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(0,0,0,0.02)', borderRadius: 10, cursor: 'pointer' }}>
                                <input type="checkbox" checked={returnToStart} onChange={e => { setReturnToStart(e.target.checked); if (e.target.checked) setFixedEnd(null); }} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                                <span style={{ fontSize: 13, color: '#0f172a' }}>🔄 Regresar al punto de inicio</span>
                            </label>
                        </div>
                    )}

                    {activePanel === 'routes' && (
                        <div className="panel-modal" style={{ ...styles.section, background: 'rgba(99,102,241,0.05)' }}>
                            <div className="panel-modal-header">
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#6366f1' }}>📁 Rutas Guardadas</h3>
                                <button className="panel-modal-close" onClick={() => setActivePanel(null)}><X size={20} /></button>
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                <input value={routeName} onChange={e => setRouteName(e.target.value)} placeholder="Nombre de la ruta" style={{ ...styles.input, flex: 1 }} />
                                <button onClick={() => { onSaveRoute(routeName); setRouteName(''); }} style={{ ...styles.btn, ...styles.primaryBtn }}><Save size={16} /></button>
                            </div>
                            <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                                {savedRoutes.length === 0 ? (
                                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', margin: '20px 0' }}>No hay rutas guardadas</p>
                                ) : savedRoutes.map(r => (
                                    <div key={r.id} style={{ ...styles.waypoint, justifyContent: 'space-between' }}>
                                        <span onClick={() => onLoadRoute(r)} style={{ cursor: 'pointer', flex: 1, fontSize: 13 }}>{r.name} <span style={{ color: 'rgba(255,255,255,0.4)' }}>({r.waypoints.length})</span></span>
                                        <button onClick={() => onDeleteRoute(r.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activePanel === 'import' && (
                        <div className="panel-modal" style={{ ...styles.section, background: 'rgba(245,158,11,0.05)' }}>
                            <div className="panel-modal-header">
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#f59e0b' }}>📋 Importar Direcciones</h3>
                                <button className="panel-modal-close" onClick={() => setActivePanel(null)}><X size={20} /></button>
                            </div>
                            <textarea value={bulkInput} onChange={e => setBulkInput(e.target.value)} placeholder="Una dirección por línea..." style={{ ...styles.input, height: 100, resize: 'none' }} />
                            <button onClick={handleBulkImport} disabled={isGeocoding} style={{ ...styles.btn, ...styles.primaryBtn, width: '100%', justifyContent: 'center', marginTop: 10 }}>
                                {isGeocoding ? 'Procesando...' : 'Importar todas'}
                            </button>
                        </div>
                    )}



                    {/* Route Options - Desktop List / Mobile Logic */}
                    {!isMobile && showRouteOptions && (
                        <div style={{ ...styles.section, background: 'rgba(16,185,129,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#10b981' }}>⚡ Elige una Ruta</h3>
                                <button onClick={() => { setShowRouteOptions(false); setSelectedRouteOption(null); onPreviewRoute?.(null); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={16} /></button>
                            </div>
                            <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 10px' }}>👁️ Haz clic para ver preview en el mapa</p>
                            {routeOptions.map((opt, i) => (
                                <button
                                    key={i}
                                    onClick={() => handlePreviewRouteOption(opt)}
                                    style={{
                                        width: '100%',
                                        position: 'relative',
                                        padding: '16px',
                                        marginBottom: 12,
                                        background: selectedRouteOption === opt
                                            ? '#f0fdf4'  // Green-50 for selected
                                            : '#ffffff', // White for unselected
                                        border: selectedRouteOption === opt ? '1px solid #10b981' : '1px solid #e2e8f0',
                                        borderRadius: 16,
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        color: '#0f172a',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        transform: selectedRouteOption === opt ? 'scale(1.02)' : 'scale(1)',
                                        boxShadow: selectedRouteOption === opt ? '0 10px 20px -5px rgba(16,185,129,0.15)' : '0 2px 4px rgba(0,0,0,0.02)',
                                        overflow: 'hidden'
                                    }}
                                    onMouseEnter={e => { if (selectedRouteOption !== opt) e.currentTarget.style.borderColor = '#cbd5e1'; }}
                                    onMouseLeave={e => { if (selectedRouteOption !== opt) e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                >
                                    {/* Abstract decorative circle - clearer for light theme */}
                                    <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, background: 'radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)', borderRadius: '50%' }} />

                                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: selectedRouteOption === opt ? '#15803d' : '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            {selectedRouteOption === opt ? <Check size={16} /> : (i === 0 ? <Zap size={16} color="#eab308" /> : <Route size={16} color="#94a3b8" />)}
                                            {opt.name}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            {opt.hasTrafficData && (
                                                <span style={{ fontSize: 10, padding: '2px 8px', background: '#eff6ff', color: '#3b82f6', borderRadius: 10, fontWeight: 600 }}>Trafico Real</span>
                                            )}
                                            <div
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setExpandedInfo(expandedInfo === i ? null : i);
                                                }}
                                                style={{ padding: 4, cursor: 'pointer', opacity: 0.7, zIndex: 10 }}
                                                onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                                                onMouseLeave={(e) => e.currentTarget.style.opacity = 0.7}
                                                title="Ver detalles del algoritmo"
                                            >
                                                <Info size={16} color="#3b82f6" />
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Clock size={14} color="#64748b" />
                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{opt.durationInTrafficFormatted || opt.durationFormatted}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <MapPin size={14} color="#64748b" />
                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>{opt.distanceKm} km</span>
                                        </div>
                                    </div>

                                    <div style={{ fontSize: 11, lineHeight: 1.4, color: '#64748b', paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                                        {opt.description}
                                    </div>

                                    {expandedInfo === i && (
                                        <div style={{ marginTop: 12, padding: '10px', background: '#eff6ff', borderRadius: 8, borderLeft: '3px solid #3b82f6', animation: 'fadeIn 0.2s' }} onClick={e => e.stopPropagation()}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Info size={12} /> ¿Cómo funciona?
                                            </div>
                                            <div style={{ fontSize: 11, color: '#1e40af', lineHeight: 1.5 }}>
                                                {opt.longDescription}
                                            </div>
                                        </div>
                                    )}
                                </button>
                            ))}
                            {/* Apply Button */}
                            {
                                selectedRouteOption && (
                                    <button
                                        onClick={handleApplySelectedRoute}
                                        style={{ ...styles.btn, ...styles.successBtn, width: '100%', justifyContent: 'center', marginTop: 8 }}
                                    >
                                        ✓ Aplicar esta ruta
                                    </button>
                                )
                            }
                        </div >
                    )}

                    {/* Stats */}
                    {
                        routeStats && (
                            <div style={{ ...styles.section, display: 'flex', gap: 12 }}>
                                <div style={styles.stat}>
                                    <Route size={20} color="#3b82f6" style={{ marginBottom: 4 }} />
                                    <div style={{ fontSize: 22, fontWeight: 700 }}>{routeStats.distanceKm}</div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>kilómetros</div>
                                </div>
                                <div style={styles.stat}>
                                    <Clock size={20} color="#8b5cf6" style={{ marginBottom: 4 }} />
                                    <div style={{ fontSize: 22, fontWeight: 700 }}>{routeStats.durationFormatted}</div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>tiempo estimado</div>
                                </div>
                            </div>
                        )
                    }

                    {/* Search */}
                    <div style={{ ...styles.section, position: 'relative' }}>
                        <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#64748b' }}>🔍 Agregar Entrega</h3>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input value={addressInput} onChange={e => setAddressInput(e.target.value)} onFocus={() => suggestions.length > 0 && setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} placeholder="Buscar dirección..." style={{ ...styles.input, flex: 1 }} onKeyDown={e => e.key === 'Enter' && handleAddAddress()} />
                            <button onClick={handleAddAddress} disabled={isGeocoding} style={{ ...styles.btn, ...styles.primaryBtn }}>{isGeocoding ? '...' : <Search size={18} />}</button>
                        </div>

                        {showSuggestions && suggestions.length > 0 && (
                            <div style={{ position: 'absolute', top: '100%', left: 20, right: 20, background: '#ffffff', borderRadius: '0 0 12px 12px', border: '1px solid #e2e8f0', maxHeight: 200, overflowY: 'auto', zIndex: 10, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
                                {suggestions.map((s, i) => (
                                    <div key={i} onMouseDown={e => { e.preventDefault(); handleSelectSuggestion(s); }} style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <MapPin size={16} color="#3b82f6" />
                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{s.shortName}</div>
                                            <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.displayName}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Waypoints List */}
                    <div style={styles.section}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#64748b' }}>📦 Entregas ({waypoints.length})</h3>
                            {waypoints.length > 0 && (
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => setWaypoints([])} style={{ ...styles.btn, background: '#fef2f2', color: '#ef4444', padding: '8px 10px' }} title="Borrar todo">
                                        <Trash2 size={14} />
                                    </button>
                                    {waypoints.length >= 2 && (
                                        <button onClick={handleOptimize} disabled={isOptimizing} style={{ ...styles.btn, ...styles.successBtn, padding: '8px 14px' }}>
                                            <Zap size={14} /> {isOptimizing ? '...' : 'Optimizar'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {fixedStart && (
                            <div style={{ ...styles.badge, background: 'rgba(16,185,129,0.1)', color: '#10b981', marginBottom: 8, width: '100%', justifyContent: 'flex-start' }}>
                                <Home size={14} /> <span style={{ fontWeight: 600 }}>INICIO:</span> {fixedStart.address}
                            </div>
                        )}

                        <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                            {waypoints.length === 0 ? (
                                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', margin: '20px 0' }}>Agrega direcciones de entrega</p>
                            ) : waypoints.map((wp, i) => (
                                <div key={i} style={styles.waypoint}>
                                    <span style={{ width: 24, height: 24, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                                    <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wp.address || `${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}`}</span>
                                    <button onClick={() => setWaypoints(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}><Trash2 size={14} /></button>
                                </div>
                            ))}
                        </div>

                        {(fixedEnd || returnToStart) && (
                            <div style={{ ...styles.badge, background: returnToStart ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: returnToStart ? '#10b981' : '#f59e0b', marginTop: 8, width: '100%', justifyContent: 'flex-start' }}>
                                {returnToStart ? <Home size={14} /> : <Flag size={14} />} <span style={{ fontWeight: 600 }}>FIN:</span> {returnToStart ? fixedStart?.address : fixedEnd?.address}
                            </div>
                        )}
                    </div>

                    {/* Assign */}
                    <div style={{ ...styles.section, borderBottom: 'none' }}>
                        <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#64748b' }}>👤 Asignar Ruta</h3>
                        {agents.length === 0 ? (
                            <button onClick={onOpenAgents} style={{ ...styles.btn, ...styles.secondaryBtn, width: '100%', justifyContent: 'center' }}><Users size={16} /> Crear agente</button>
                        ) : (
                            <>
                                <select value={selectedAgent?.id || ''} onChange={e => setSelectedAgent(agents.find(a => a.id == e.target.value) || null)} style={{ ...styles.input, cursor: 'pointer', marginBottom: 12, backgroundColor: '#ffffff', color: '#0f172a' }}>
                                    <option value="" style={{ background: '#ffffff', color: '#0f172a' }}>Selecciona un agente...</option>
                                    {agents.map(a => <option key={a.id} value={a.id} style={{ background: '#ffffff', color: '#0f172a' }}>{a.name}</option>)}
                                </select>
                                <button onClick={onAssign} disabled={isSubmitting || !selectedAgent || waypoints.length === 0} style={{ ...styles.btn, ...styles.primaryBtn, width: '100%', justifyContent: 'center', opacity: (!selectedAgent || isSubmitting || waypoints.length === 0) ? 0.5 : 1 }}>
                                    <Play size={16} /> {isSubmitting ? 'Enviando...' : 'INICIAR RUTA'}
                                </button>
                            </>
                        )}
                    </div>
                </>
            )}

            {/* Mobile Route Carousel (Fixed Bottom) */}
            {
                isCarouselMode && (
                    <div style={{
                        position: 'fixed',
                        bottom: 'calc(20px + env(safe-area-inset-bottom))',
                        left: 0,
                        right: 0,
                        zIndex: 2000,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                        padding: '0 10px',
                        pointerEvents: 'auto' // Ensure clicks work
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                            <button
                                onClick={() => { setShowRouteOptions(false); setSelectedRouteOption(null); onPreviewRoute?.(null); }}
                                style={{
                                    width: 40, height: 40, borderRadius: '50%', border: 'none',
                                    background: 'rgba(239, 68, 68, 0.9)', color: 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)', cursor: 'pointer'
                                }}
                            >
                                <X size={20} />
                            </button>
                            <button
                                onClick={handleApplySelectedRoute}
                                disabled={!selectedRouteOption}
                                style={{
                                    background: selectedRouteOption ? '#10b981' : '#334155',
                                    color: 'white',
                                    border: 'none',
                                    padding: '10px 24px',
                                    borderRadius: 30,
                                    fontWeight: 600,
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                    opacity: selectedRouteOption ? 1 : 0.6,
                                    transform: selectedRouteOption ? 'scale(1.05)' : 'scale(1)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {selectedRouteOption ? '✅ Aplicar Ruta Seleccionada' : 'Selecciona una ruta abajo 👇'}
                            </button>
                        </div>

                        <div style={{
                            display: 'flex',
                            gap: 12,
                            overflowX: 'auto',
                            padding: '4px 10px 14px',
                            scrollSnapType: 'x mandatory',
                            WebkitOverflowScrolling: 'touch'
                        }}>
                            {routeOptions.map((opt, i) => (
                                <div
                                    key={i}
                                    onClick={() => handlePreviewRouteOption(opt)}
                                    style={{
                                        minWidth: '260px',
                                        background: selectedRouteOption === opt ? '#ffffff' : 'rgba(255, 255, 255, 0.95)',
                                        border: selectedRouteOption === opt ? '2px solid #10b981' : '1px solid #e2e8f0',
                                        borderRadius: 16,
                                        padding: 16,
                                        scrollSnapAlign: 'center',
                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                                        backdropFilter: 'blur(10px)',
                                        cursor: 'pointer',
                                        position: 'relative'
                                    }}
                                >
                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {selectedRouteOption === opt && <span style={{ color: '#10b981' }}>●</span>}
                                        {opt.name.split(' (')[0]}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>
                                        {opt.distanceKm} km • {opt.durationInTrafficFormatted || opt.durationFormatted}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.3 }}>
                                        {opt.description.substring(0, 50)}...
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default Sidebar;
