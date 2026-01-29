import React, { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import MapComponent from './MapComponent';
import Sidebar from './Sidebar';
import AgentsPanel from './AgentsPanel';
import Dashboard from './Dashboard';
import { sendToN8N, transformCoordinates, notifyDriverAssignment } from '../utils/n8nService';
import { recordRouteCreated } from '../utils/metricsService';
import { getGoogleRoute } from '../utils/googleDirectionsService';

function AdminDashboard() {
    const [waypoints, setWaypoints] = useState([]);
    const [agents, setAgents] = useState(() => {
        const saved = localStorage.getItem('logisticsAgents');
        return saved ? JSON.parse(saved) : [];
    });
    const [selectedAgent, setSelectedAgent] = useState(null);
    const [savedRoutes, setSavedRoutes] = useState(() => {
        const saved = localStorage.getItem('logisticsRoutes');
        return saved ? JSON.parse(saved) : [];
    });
    const [showAgentsPanel, setShowAgentsPanel] = useState(false);
    const [showDashboard, setShowDashboard] = useState(false);
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

    // Save agents to localStorage
    useEffect(() => {
        localStorage.setItem('logisticsAgents', JSON.stringify(agents));
    }, [agents]);

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

    const handleAddAgent = (agent) => {
        const newAgent = { ...agent, id: Date.now(), assignedRoutes: [] };
        setAgents(prev => [...prev, newAgent]);
        toast.success(`Agente ${agent.name} agregado`);
    };

    const handleDeleteAgent = (agentId) => {
        setAgents(prev => prev.filter(a => a.id !== agentId));
        if (selectedAgent?.id === agentId) setSelectedAgent(null);
        toast.info('Agente eliminado');
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

            // Get route stats (using Google Directions) - Use optimize: false to respect current order
            const stats = await getGoogleRoute(allPoints, { optimize: false });

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
            const driverLink = `${baseUrl}/driver/${routeId}?data=${encodedData}`;

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
                // We still save to localStorage for Admin view persistence/debugging
                const savedRoutes = JSON.parse(localStorage.getItem('logisticsRoutes') || '[]');
                const routeToSave = {
                    ...route,
                    waypoints: waypoints,
                    fixedStart,
                    fixedEnd,
                    returnToStart,
                    assignedAgent: selectedAgent,
                    createdAt: new Date().toISOString()
                };
                savedRoutes.push(routeToSave);
                localStorage.setItem('logisticsRoutes', JSON.stringify(savedRoutes));

                // Update agent's assigned routes
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
        <div style={{ width: '100%', height: '100vh', overflow: 'hidden', position: 'relative', fontFamily: 'system-ui', background: '#0f172a' }}>
            <Toaster position="top-right" richColors />

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
        </div>
    );
}

export default AdminDashboard;
