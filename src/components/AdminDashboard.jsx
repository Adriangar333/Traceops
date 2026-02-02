import React, { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { X, FileText, Users } from 'lucide-react';
import MapComponent from './MapComponent';
import Sidebar from './Sidebar';
import AgentsPanel from './AgentsPanel';
import Dashboard from './Dashboard';
import LiveTrackingPanel from './LiveTrackingPanel';
import DataIngestion from './DataIngestion';
import SCRCOrdersPanel from './SCRCOrdersPanel';
import WorkforcePanel from './WorkforcePanel';
// Restoration of n8n service
import { sendToN8N, transformCoordinates } from '../utils/n8nService';
// import { recordRouteCreated } from '../utils/metricsService'; // Keep commented if not needed
// import { getGoogleRoute } from '../utils/googleDirectionsService';
import { fetchRouteWithStats } from '../utils/osrmService';
import { getDrivers, createDriver, deleteDriver, assignRouteToDriver, createRoute, getBrigades, getVehicles } from '../utils/backendService';
import { io } from 'socket.io-client'; // Import Socket.IO

function AdminDashboard() {
    const [waypoints, setWaypoints] = useState([]);
    const [agents, setAgents] = useState([]);
    const [selectedAgent, setSelectedAgent] = useState(null);
    const [savedRoutes, setSavedRoutes] = useState(() => {
        const saved = localStorage.getItem('logisticsRoutes');
        return saved ? JSON.parse(saved) : [];
    });
    const [showAgentsPanel, setShowAgentsPanel] = useState(false);
    const [showDashboard, setShowDashboard] = useState(false);
    const [showTracking, setShowTracking] = useState(false);
    const [showIngestion, setShowIngestion] = useState(false);
    const [showOrdersPanel, setShowOrdersPanel] = useState(false);
    const [showWorkforcePanel, setShowWorkforcePanel] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [previewRoute, setPreviewRoute] = useState(null);

    // Filters
    const [brigades, setBrigades] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [filterBrigade, setFilterBrigade] = useState('');
    const [filterVehicle, setFilterVehicle] = useState('');

    const [fixedStart, setFixedStart] = useState(() => {
        const saved = localStorage.getItem('fixedStart');
        return saved ? JSON.parse(saved) : null;
    });
    const [fixedEnd, setFixedEnd] = useState(() => {
        const saved = localStorage.getItem('fixedEnd');
        return saved ? JSON.parse(saved) : null;
    });
    const [returnToStart, setReturnToStart] = useState(() => localStorage.getItem('returnToStart') === 'true');

    // Socket.IO Listener for Real-time Updates (Cancellation)
    useEffect(() => {
        const socket = io(import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host');

        socket.on('connect', () => {
            console.log('🔌 Socket Connected to Backend');
        });

        socket.on('scrc:orders-cancelled', (data) => {
            console.log('⚡ Real-time Cancellation Received:', data);
            toast.warning(`⚠️ ${data.count} Orden(es) Cancelada(s) por Pago!`);

            // Logic to remove cancelling orders from waypoints if they exist
            if (data.cancelled_orders && data.cancelled_orders.length > 0) {
                const cancelledNics = data.cancelled_orders.map(o => o.nic);

                setWaypoints(current => {
                    // Filter logic: Check if waypoint description/address contains NIC (heuristic)
                    // Or if we had a proper ID structure. 
                    // For now, we assume waypoints might not have NIC explicitly, 
                    // but if this dashboard is used for SCRC, they should.
                    // If simply showing notification, that is step 1.
                    return current;
                });
            }
        });

        return () => {
            socket.off('scrc:orders-cancelled');
            socket.disconnect();
        };
    }, []);

    // Save configuration to localStorage
    useEffect(() => {
        if (fixedStart) localStorage.setItem('fixedStart', JSON.stringify(fixedStart));
        else localStorage.removeItem('fixedStart');
    }, [fixedStart]);

    useEffect(() => {
        if (fixedEnd) localStorage.setItem('fixedEnd', JSON.stringify(fixedEnd));
        else localStorage.removeItem('fixedEnd');
    }, [fixedEnd]);

    useEffect(() => {
        localStorage.setItem('returnToStart', returnToStart);
    }, [returnToStart]);

    // Load agents from Backend
    useEffect(() => {
        const loadData = async () => {
            const [driversData, brigadesData, vehiclesData] = await Promise.all([
                getDrivers(),
                getBrigades(),
                getVehicles()
            ]);
            setAgents(driversData);
            setBrigades(brigadesData);
            setVehicles(vehiclesData);
        };
        loadData();
    }, []);

    // Save routes to localStorage
    useEffect(() => {
        localStorage.setItem('logisticsRoutes', JSON.stringify(savedRoutes));
    }, [savedRoutes]);

    // Listen for cross-tab updates (Sync with DriverView on same device)
    useEffect(() => {
        const handleStorageChange = () => {
            const freshRoutes = localStorage.getItem('logisticsRoutes');
            if (freshRoutes) {
                console.log('Syncing routes from storage...');
                setSavedRoutes(JSON.parse(freshRoutes));
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    // Combine waypoints for Map display
    const displayWaypoints = [
        ...(fixedStart ? [fixedStart] : []),
        ...waypoints,
        ...(fixedEnd && !returnToStart ? [fixedEnd] : []),
        ...(returnToStart && fixedStart ? [fixedStart] : [])
    ];

    const filteredAgents = agents.filter(agent => {
        // Filter by Brigade
        if (filterBrigade) {
            const brigade = brigades.find(b => b.id.toString() === filterBrigade);
            if (!brigade?.members?.some(m => m.id === agent.id)) {
                return false;
            }
        }
        // Filter by Vehicle
        if (filterVehicle) {
            const vehicle = vehicles.find(v => v.id.toString() === filterVehicle);
            if (vehicle?.assigned_technician_id !== agent.id) {
                return false;
            }
        }
        return true;
    });

    const handleAddAgent = async (agent) => {
        try {
            const newAgent = await createDriver(agent);
            setAgents(prev => [newAgent, ...prev]);
            toast.success(`Agente ${agent.name} agregado`);
        } catch (error) {
            toast.error('Error al guardar agente');
        }
    };

    const handleDeleteAgent = async (agentId) => {
        try {
            await deleteDriver(agentId);
            setAgents(prev => prev.filter(a => a.id !== agentId));
            if (selectedAgent?.id === agentId) setSelectedAgent(null);
            toast.info('Agente eliminado');
        } catch (error) {
            toast.error('Error al eliminar agente');
        }
    };

    const handleSaveRoute = async (routeName) => {
        // Use all points for calculation
        const allPoints = [
            ...(fixedStart ? [fixedStart] : []),
            ...waypoints,
            ...(fixedEnd && !returnToStart ? [fixedEnd] : []),
            ...(returnToStart && fixedStart ? [fixedStart] : [])
        ];

        if (allPoints.length < 2) {
            toast.error('Necesitas al menos 2 puntos');
            return;
        }

        // Get route stats (using OSRM service)
        const stats = await fetchRouteWithStats(allPoints);

        const newRoute = {
            id: Date.now(),
            name: routeName || `Ruta ${savedRoutes.length + 1}`,
            waypoints: [...waypoints], // Save just intermediates? Or generic structure?
            // Ideally we save the configuration too using specific fields, but for now lets keep compat
            fixedStart,
            fixedEnd,
            returnToStart,
            createdAt: new Date().toISOString(),
            distanceKm: stats?.distanceKm || 0,
            duration: stats?.duration || 0
        };

        setSavedRoutes(prev => [...prev, newRoute]);

        // Record metrics
        recordRouteCreated(newRoute, allPoints, stats);

        toast.success('Ruta guardada');
    };

    const handleLoadRoute = (route) => {
        setWaypoints(route.waypoints || []);
        setFixedStart(route.fixedStart || null);
        setFixedEnd(route.fixedEnd || null);
        setReturnToStart(route.returnToStart || false);

        // If route has geometry, show it nicely
        if (route.geometry && route.geometry.coordinates) {
            setPreviewRoute({
                ...route,
                coordinates: route.geometry.coordinates,
                distanceKm: route.distanceKm,
                durationFormatted: route.durationFormatted || (route.duration ? Math.round(route.duration / 60) + ' min' : '')
            });
        } else if (route.route_geometry && route.route_geometry.coordinates) {
            setPreviewRoute({
                ...route,
                coordinates: route.route_geometry.coordinates,
                distanceKm: route.distanceKm,
                durationFormatted: route.durationFormatted
            });
        }

        toast.info(`Ruta "${route.name}" cargada`);
    };

    const handleDeleteRoute = (routeId) => {
        setSavedRoutes(prev => prev.filter(r => r.id !== routeId));
        toast.info('Ruta eliminada');
    };

    const handleAssignRoute = async () => {
        const allPoints = [
            ...(fixedStart ? [fixedStart] : []),
            ...waypoints,
            ...(fixedEnd && !returnToStart ? [fixedEnd] : []),
            ...(returnToStart && fixedStart ? [fixedStart] : [])
        ];

        if (allPoints.length < 2) {
            toast.error('Selecciona al menos 2 puntos');
            return;
        }

        if (!selectedAgent) {
            toast.error('Selecciona un agente primero');
            return;
        }

        setIsSubmitting(true);
        const toastId = toast.loading('Asignando ruta al agente...');

        try {
            const routeId = Date.now();
            const formattedWaypoints = allPoints.map(transformCoordinates);

            // 1. Check if we already have a calculated route in preview (The "WYSIWYG" fix)
            // If the user sees curves on screen, send THOSE curves.
            let stats = null;
            if (previewRoute && previewRoute.coordinates && previewRoute.coordinates.length > 0) {
                console.log('Using geometry from Preview Route (WYSIWYG)');
                stats = {
                    success: true,
                    distance: 0, // Not critical for geometry
                    distanceKm: previewRoute.distanceKm,
                    duration: previewRoute.duration || 0,
                    coordinates: previewRoute.coordinates
                };
            }

            // 2. If not found in preview, calculate fresh using Google Directions
            if (!stats) {
                stats = await getGoogleRoute(allPoints, { optimize: false });
            }

            // Fallback to OSRM if Google fails to provide geometry
            if (!stats || !stats.success || !stats.coordinates || stats.coordinates.length === 0) {
                console.warn('Google Directions failed to return geometry in assignment. Attempting OSRM fallback...');
                try {
                    const osrmStats = await fetchRouteWithStats(allPoints);
                    if (osrmStats && osrmStats.success && osrmStats.coordinates && osrmStats.coordinates.length > 0) {
                        console.log('OSRM Fallback successful');
                        // Merge OSRM stats, preferring OSRM geometry but keeping basic info if needed
                        stats = {
                            ...(stats || {}),
                            ...osrmStats,
                            // Ensure we use the OSRM geometry
                            coordinates: osrmStats.coordinates
                        };
                    } else {
                        console.warn('OSRM Fallback also failed or returned no geometry');
                    }
                } catch (fallbackError) {
                    console.error('OSRM Fallback error:', fallbackError);
                }
            }

            const route = {
                id: routeId,
                name: `RUTA - ${new Date().toLocaleDateString()}`,
                type: 'optimized',
                distanceKm: stats?.distanceKm || 0,
                duration: stats?.duration || 0
            };

            // Build stateless driver link
            // ALWAYS use the production URL so links work for drivers anywhere
            const baseUrl = 'https://dashboard-frontend.zvkdyr.easypanel.host';

            // Minimal data for URL to keep length down
            const routeDataForUrl = {
                id: route.id,
                name: route.name,
                distanceKm: route.distanceKm,
                waypoints: allPoints.map(wp => ({
                    lat: Number(wp.lat.toFixed(5)), // Reduce precision to save space
                    lng: Number(wp.lng.toFixed(5)),
                    address: wp.address ? wp.address.substring(0, 40) : undefined // Truncate address
                }))
            };

            const encodedData = encodeURIComponent(JSON.stringify(routeDataForUrl));
            // Use query param 'data' so we don't rely on localStorage
            const driverLink = `${baseUrl}/driver/${routeId}?driverId=${selectedAgent.id}&data=${encodedData}`;

            const payload = {
                route: {
                    ...route,
                    params: { waypoints: formattedWaypoints }
                },
                assignedAgent: {
                    id: selectedAgent.id,
                    name: selectedAgent.name,
                    email: selectedAgent.email,
                    phone: selectedAgent.phone,
                    assignedRouteIds: [routeId]
                },
                driverLink: driverLink  // Include the stateless link
            };

            // Send to n8n (this will trigger the email automatically)
            const result = await sendToN8N(payload);

            if (result.success) {
                // Update Backend (Persistent Route)
                await createRoute({
                    id: routeId,
                    name: route.name,
                    driverId: selectedAgent.id,
                    waypoints: allPoints,
                    distanceKm: stats?.distanceKm || 0,
                    duration: stats?.duration || 0,
                    geometry: { type: 'LineString', coordinates: stats?.coordinates || [] } // Send geometry
                });

                // We still save to localStorage for Admin view persistence/debugging
                const savedRoutes = JSON.parse(localStorage.getItem('logisticsRoutes') || '[]');
                const routeToSave = {
                    ...route,
                    waypoints: waypoints,
                    fixedStart,
                    fixedEnd,
                    returnToStart,
                    assignedAgent: selectedAgent,
                    geometry: { type: 'LineString', coordinates: stats?.coordinates || [] }, // Save geometry locally too
                    createdAt: new Date().toISOString()
                };
                savedRoutes.push(routeToSave);
                localStorage.setItem('logisticsRoutes', JSON.stringify(savedRoutes));

                // Update agent's assigned routes locally
                setAgents(prev => prev.map(a =>
                    a.id === selectedAgent.id
                        ? { ...a, assignedRoutes: [...(a.assignedRoutes || []), routeId] }
                        : a
                ));

                // Record metrics
                recordRouteCreated(route, allPoints, stats);

                toast.success(`¡Ruta asignada a ${selectedAgent.name}! Se envió notificación por email.`, { id: toastId });
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            toast.error(`Error: ${error.message}`, { id: toastId });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={{ width: '100%', height: '100vh', overflow: 'hidden', position: 'relative', fontFamily: 'Inter, system-ui', background: '#f8fafc' }}>
            <Toaster position="top-right" richColors />

            {/* --- Stats HUD (Top Right - below selectors) --- */}
            <div style={{
                position: 'absolute', top: 80, right: 20, zIndex: 90,
                display: 'flex', gap: 12, pointerEvents: 'none'
            }}>
                <div style={{ pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.92)', backdropFilter: 'blur(12px)', padding: '12px 20px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 110 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>RUTAS HOY</span>
                    <span style={{ fontSize: 24, fontWeight: 800, color: '#10b981' }}>{savedRoutes.length}</span>
                </div>
                <div style={{ pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.92)', backdropFilter: 'blur(12px)', padding: '12px 20px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 110 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>CONDUCTORES</span>
                    <span style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b' }}>{agents.length}</span>
                </div>
                <div style={{ pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.92)', backdropFilter: 'blur(12px)', padding: '12px 20px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 110 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>ALERTAS</span>
                    <span style={{ fontSize: 24, fontWeight: 800, color: '#6366f1' }}>0</span>
                </div>
                {/* SCRC Orders Button */}
                <button
                    onClick={() => setShowOrdersPanel(true)}
                    style={{
                        pointerEvents: 'auto',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        padding: '12px 20px',
                        borderRadius: 14,
                        border: 'none',
                        boxShadow: '0 8px 32px rgba(16, 185, 129, 0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        minWidth: 110,
                        cursor: 'pointer',
                        transition: 'transform 0.2s'
                    }}
                    onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <FileText size={18} style={{ color: 'white', marginBottom: 4 }} />
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.9)', fontWeight: 700, letterSpacing: '0.05em' }}>ÓRDENES</span>
                </button>
                {/* Workforce Button */}
                <button
                    onClick={() => setShowWorkforcePanel(true)}
                    style={{
                        pointerEvents: 'auto',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                        padding: '12px 20px',
                        borderRadius: 14,
                        border: 'none',
                        boxShadow: '0 8px 32px rgba(59, 130, 246, 0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        minWidth: 110,
                        cursor: 'pointer',
                        transition: 'transform 0.2s'
                    }}
                    onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <Users size={18} style={{ color: 'white', marginBottom: 4 }} />
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.9)', fontWeight: 700, letterSpacing: '0.05em' }}>PERSONAL</span>
                </button>
            </div>

            <Sidebar
                waypoints={waypoints}
                setWaypoints={setWaypoints}
                fixedStart={fixedStart}
                setFixedStart={setFixedStart}
                fixedEnd={fixedEnd}
                setFixedEnd={setFixedEnd}
                returnToStart={returnToStart}
                setReturnToStart={setReturnToStart}
                agents={agents}
                selectedAgent={selectedAgent}
                setSelectedAgent={setSelectedAgent}
                savedRoutes={savedRoutes}
                onSaveRoute={handleSaveRoute}
                onLoadRoute={handleLoadRoute}
                onDeleteRoute={handleDeleteRoute}
                onAssign={handleAssignRoute}
                isSubmitting={isSubmitting}
                onOpenAgents={() => setShowAgentsPanel(true)}
                onOpenDashboard={() => setShowDashboard(true)}
                onOpenIngestion={() => setShowIngestion(true)}
                onPreviewRoute={setPreviewRoute}
                onApplyRoute={(route) => {
                    if (route?.optimizedWaypoints) {
                        // When optimizing, we usually get back the FULL route including start/ends.
                        // We need to parse this back to fixedStart/End if they exist, or just put everything in waypoints if not valid?
                        // For simplicity, if we have fixed points, we trust they kept their place (or we enforce it).
                        // If optimization changed order, we update 'waypoints' with the INTERMEDIATE points.

                        let newWaypoints = [...route.optimizedWaypoints];

                        // If we had fixed start, assume first point is start
                        if (fixedStart) newWaypoints.shift();

                        // If we had fixed end, assume last point is end
                        if (fixedEnd && !returnToStart) newWaypoints.pop();
                        if (returnToStart && fixedStart) newWaypoints.pop(); // Remove the return-to-start point

                        setWaypoints(newWaypoints);
                    }
                    setPreviewRoute(null);
                }}

            />

            {/* Top Filter Bar */}
            <div style={{
                position: 'fixed', // Fixed to stay visible
                top: 16,
                right: 320, // Left of AgentsPanel trigger
                zIndex: 40,
                display: 'flex',
                gap: 8,
                background: 'rgba(15, 23, 42, 0.8)',
                padding: 8,
                borderRadius: 12,
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.1)'
            }}>
                <select
                    value={filterBrigade}
                    onChange={e => setFilterBrigade(e.target.value)}
                    style={{ background: '#1e293b', color: 'white', padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', fontSize: 13 }}
                >
                    <option value="">Todas Brigadas</option>
                    {brigades.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>

                <select
                    value={filterVehicle}
                    onChange={e => setFilterVehicle(e.target.value)}
                    style={{ background: '#1e293b', color: 'white', padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', fontSize: 13 }}
                >
                    <option value="">Todos Vehículos</option>
                    {vehicles.map(v => (
                        <option key={v.id} value={v.id}>{v.plate} ({v.type})</option>
                    ))}
                </select>

                {(filterBrigade || filterVehicle) && (
                    <button onClick={() => { setFilterBrigade(''); setFilterVehicle(''); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}>
                        <X size={16} />
                    </button>
                )}
            </div>

            <MapComponent
                waypoints={displayWaypoints}
                previewRoute={previewRoute}
                onClearPreview={() => setPreviewRoute(null)}

                onAddWaypoint={(newPoint) => {
                    setWaypoints(prev => [...prev, newPoint]);
                }}
                fixedStartConfigured={!!fixedStart}
                fixedEndConfigured={!!fixedEnd || returnToStart}
                returnToStart={returnToStart}
                onClearRoute={() => {
                    setWaypoints([]);
                }}
            />

            {showAgentsPanel && (
                <AgentsPanel
                    agents={filteredAgents}
                    onAddAgent={handleAddAgent}
                    onDeleteAgent={handleDeleteAgent}
                    onClose={() => setShowAgentsPanel(false)}
                />
            )}

            {showDashboard && (
                <Dashboard
                    agents={filteredAgents}
                    onClose={() => setShowDashboard(false)}
                />
            )}

            {/* Live Tracking Panel */}
            <LiveTrackingPanel
                isOpen={showTracking}
                onClose={() => setShowTracking(false)}
                driversList={filteredAgents}
            />

            {/* Data Ingestion Overlay */}
            {showIngestion && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{ width: '100%', maxWidth: 800, height: '80vh', background: '#0f172a', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', position: 'relative' }}>
                        <button
                            onClick={() => setShowIngestion(false)}
                            style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                        >
                            <X />
                        </button>
                        <DataIngestion />
                    </div>
                </div>
            )}

            {/* Floating Tracking Button */}
            <button
                onClick={() => setShowTracking(true)}
                style={{
                    position: 'fixed',
                    bottom: 20,
                    right: 20,
                    background: '#9DBD39',
                    border: 'none',
                    borderRadius: 50,
                    padding: '14px 20px',
                    color: 'white',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 4px 10px rgba(157, 189, 57, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    zIndex: 100
                }}
            >
                <span style={{ fontSize: '1.2rem' }}>📡</span> Rastreo en Vivo
            </button>

            {/* SCRC Orders Panel */}
            {showOrdersPanel && (
                <div style={{
                    position: 'fixed',
                    top: 80,
                    left: 440,
                    right: 20,
                    bottom: 80,
                    zIndex: 200,
                }}>
                    <SCRCOrdersPanel
                        brigades={brigades}
                        onClose={() => setShowOrdersPanel(false)}
                        onSelectOrders={(selectedWaypoints) => {
                            // Add selected orders to waypoints
                            setWaypoints(prev => [...prev, ...selectedWaypoints]);
                            toast.success(`${selectedWaypoints.length} órdenes agregadas como puntos de ruta`);
                        }}
                    />
                </div>
            )}

            {/* Workforce Panel */}
            {showWorkforcePanel && (
                <div style={{
                    position: 'fixed',
                    top: 80,
                    left: 440,
                    right: 20,
                    bottom: 80,
                    zIndex: 200,
                }}>
                    <WorkforcePanel
                        onClose={() => setShowWorkforcePanel(false)}
                    />
                </div>
            )}
        </div>
    );
}

export default AdminDashboard;
