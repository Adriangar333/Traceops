import React, { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import MapComponent from './MapComponent';
import Sidebar from './Sidebar';
import AgentsPanel from './AgentsPanel';
import Dashboard from './Dashboard';
import LiveTrackingPanel from './LiveTrackingPanel';
import { sendToN8N, transformCoordinates, notifyDriverAssignment } from '../utils/n8nService';
import { recordRouteCreated } from '../utils/metricsService';
import { getGoogleRoute } from '../utils/googleDirectionsService';
import { fetchRouteWithStats } from '../utils/osrmService';
import { getDrivers, createDriver, deleteDriver, assignRouteToDriver, createRoute } from '../utils/backendService';

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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewRoute, setPreviewRoute] = useState(null);

    const [fixedStart, setFixedStart] = useState(() => {
        const saved = localStorage.getItem('fixedStart');
        return saved ? JSON.parse(saved) : null;
    });
    const [fixedEnd, setFixedEnd] = useState(() => {
        const saved = localStorage.getItem('fixedEnd');
        return saved ? JSON.parse(saved) : null;
    });
    const [returnToStart, setReturnToStart] = useState(() => localStorage.getItem('returnToStart') === 'true');

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
        const loadAgents = async () => {
            const data = await getDrivers();
            setAgents(data);
        };
        loadAgents();
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

        // Get route stats (using Google Directions) - Use optimize: false to respect current order
        const stats = await getGoogleRoute(allPoints, { optimize: false });

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

            {/* --- Stats HUD (Top Center - pushed right of sidebar) --- */}
            <div style={{
                position: 'absolute', top: 25, left: 420, zIndex: 90,
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
                    agents={agents}
                    onAddAgent={handleAddAgent}
                    onDeleteAgent={handleDeleteAgent}
                    onClose={() => setShowAgentsPanel(false)}
                />
            )}

            {showDashboard && (
                <Dashboard
                    agents={agents}
                    onClose={() => setShowDashboard(false)}
                />
            )}

            {/* Live Tracking Panel */}
            <LiveTrackingPanel
                isOpen={showTracking}
                onClose={() => setShowTracking(false)}
                driversList={agents}
            />

            {/* Floating Tracking Button - Hide when tracking panel is open */}
            {!showTracking && (
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
            )}
        </div>
    );
}

export default AdminDashboard;
