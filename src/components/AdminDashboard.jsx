import React, { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { X, FileText, Users, Map, ChevronLeft, ChevronRight, Navigation, Upload } from 'lucide-react';
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

// View Toggle Button Component
const ViewToggle = ({ icon: Icon, label, active, onClick }) => (
    <button
        onClick={onClick}
        style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: 10,
            border: 'none',
            background: active
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'rgba(255,255,255,0.05)',
            color: active ? 'white' : '#94a3b8',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: active ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none'
        }}
    >
        <Icon size={16} />
        {label}
    </button>
);

function AdminDashboard() {
    const [waypoints, setWaypoints] = useState([]);
    const [agents, setAgents] = useState([]);
    const [selectedAgent, setSelectedAgent] = useState(null);
    const [savedRoutes, setSavedRoutes] = useState(() => {
        const saved = localStorage.getItem('logisticsRoutes');
        return saved ? JSON.parse(saved) : [];
    });

    // Panel states - for modals/overlays only
    const [showAgentsPanel, setShowAgentsPanel] = useState(false);
    const [showDashboard, setShowDashboard] = useState(false);
    const [showTracking, setShowTracking] = useState(false);
    const [showIngestion, setShowIngestion] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Main content view: 'map' | 'orders' | 'workforce'
    const [activeView, setActiveView] = useState('map');

    // Sidebar collapse state
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

    useEffect(() => {
        localStorage.setItem('logisticsRoutes', JSON.stringify(savedRoutes));
    }, [savedRoutes]);

    // Load agents/drivers from backend
    useEffect(() => {
        const loadData = async () => {
            try {
                const drivers = await getDrivers();
                setAgents(drivers || []);
                const brigadesData = await getBrigades();
                setBrigades(brigadesData || []);
                const vehiclesData = await getVehicles();
                setVehicles(vehiclesData || []);
            } catch (error) {
                console.error('Error loading data:', error);
            }
        };
        loadData();
    }, []);

    // Filter agents based on selected brigade/vehicle
    const filteredAgents = agents.filter(agent => {
        if (filterBrigade && agent.brigade_id !== filterBrigade) return false;
        if (filterVehicle && agent.vehicle_id !== filterVehicle) return false;
        return true;
    });

    // Route handlers
    const handleSaveRoute = (name) => {
        if (!name || waypoints.length === 0) return;
        const newRoute = {
            id: Date.now(),
            name,
            waypoints,
            fixedStart,
            fixedEnd,
            returnToStart,
            createdAt: new Date().toISOString()
        };
        setSavedRoutes([...savedRoutes, newRoute]);
        toast.success(`Ruta "${name}" guardada`);
    };

    const handleLoadRoute = (route) => {
        setWaypoints(route.waypoints);
        if (route.fixedStart) setFixedStart(route.fixedStart);
        if (route.fixedEnd) setFixedEnd(route.fixedEnd);
        if (route.returnToStart !== undefined) setReturnToStart(route.returnToStart);
        toast.success(`Ruta "${route.name}" cargada`);
    };

    const handleDeleteRoute = (routeId) => {
        setSavedRoutes(savedRoutes.filter(r => r.id !== routeId));
        toast.success('Ruta eliminada');
    };

    const handleAddAgent = async (name, email, phone) => {
        const result = await createDriver(name, email, phone);
        if (result) {
            setAgents([...agents, result]);
            toast.success(`Conductor ${name} agregado`);
        }
    };

    const handleDeleteAgent = async (agentId) => {
        const success = await deleteDriver(agentId);
        if (success) {
            setAgents(agents.filter(a => a.id !== agentId));
            toast.success('Conductor eliminado');
        }
    };

    const handleAssignRoute = async () => {
        if (!selectedAgent || waypoints.length === 0) {
            toast.error('Selecciona un conductor y agrega puntos de ruta');
            return;
        }

        setIsSubmitting(true);
        const toastId = toast.loading('Asignando ruta...');

        try {
            // Get route with stats
            const routeData = await fetchRouteWithStats(waypoints, fixedStart, fixedEnd, returnToStart);

            // Create persistent route in database
            const routeResult = await createRoute({
                name: `Ruta ${new Date().toLocaleDateString('es-CO')} - ${selectedAgent.name}`,
                driver_id: selectedAgent.id,
                waypoints: waypoints.map((wp, idx) => ({
                    ...wp,
                    sequence: idx + 1,
                    status: 'pending'
                })),
                fixed_start: fixedStart,
                fixed_end: fixedEnd,
                return_to_start: returnToStart,
                estimated_distance: routeData?.distance || null,
                estimated_duration: routeData?.duration || null
            });

            if (!routeResult || routeResult.error) {
                throw new Error(routeResult?.error || 'Error creando ruta');
            }

            // Assign to driver (sends notification)
            const result = await assignRouteToDriver(selectedAgent.id, waypoints, routeResult.id);

            if (result.success) {
                // Send to n8n for logging
                await sendToN8N(waypoints, transformCoordinates(waypoints));
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

    // Calculate sidebar width based on collapse state
    const sidebarWidth = sidebarCollapsed ? 0 : 420;

    return (
        <div style={{
            width: '100%',
            height: '100vh',
            overflow: 'hidden',
            position: 'relative',
            fontFamily: 'Inter, system-ui',
            background: '#0f172a',
            display: 'flex',
            flexDirection: 'column' // Changed to column for Top Bar + Body
        }}>
            <Toaster position="top-right" richColors />

            {/* === GLOBAL TOP BAR === */}
            <div style={{
                height: 60,
                width: '100%',
                background: 'rgba(15, 23, 42, 0.98)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 20px',
                zIndex: 60, // Higher than sidebar
                flexShrink: 0
            }}>
                {/* Brand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        width: 32, height: 32,
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)'
                    }}>
                        <Navigation size={18} color="white" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.02em' }}>Traceops</h1>
                        <p style={{ margin: 0, fontSize: 10, color: '#64748b' }}>Logistics Intelligence</p>
                    </div>
                </div>

                {/* View Toggles (Center) */}
                <div style={{ display: 'flex', gap: 8 }}>
                    <ViewToggle
                        icon={Map}
                        label="Mapa"
                        active={activeView === 'map'}
                        onClick={() => setActiveView('map')}
                    />
                    <ViewToggle
                        icon={FileText}
                        label="Órdenes SCRC"
                        active={activeView === 'orders'}
                        onClick={() => setActiveView('orders')}
                    />
                    <ViewToggle
                        icon={Users}
                        label="Personal"
                        active={activeView === 'workforce'}
                        onClick={() => setActiveView('workforce')}
                    />
                </div>

                {/* Right Actions & Stats */}
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <button
                        onClick={() => setShowIngestion(true)}
                        style={{
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.2)',
                            color: '#fbbf24',
                            borderRadius: 8,
                            padding: '8px 12px',
                            display: 'flex', alignItems: 'center', gap: 6,
                            fontSize: 12, fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        <Upload size={14} /> Importar Excel
                    </button>

                    <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />

                    <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1 }}>
                            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>RUTAS</span>
                            <span style={{ fontSize: 15, fontWeight: 800, color: '#10b981' }}>{savedRoutes.length}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1 }}>
                            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>CONDUCTORES</span>
                            <span style={{ fontSize: 15, fontWeight: 800, color: '#f59e0b' }}>{agents.length}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* === MAIN BODY (Sidebar + Content) === */}
            <div style={{
                flex: 1,
                display: 'flex',
                overflow: 'hidden',
                position: 'relative'
            }}>
                {/* Left Sidebar */}
                {!sidebarCollapsed && activeView === 'map' && ( // Only show route planner sidebar in Map view? Or always? Let's keep it consistent but conditionally render content if needed.
                    <div style={{
                        width: sidebarWidth,
                        height: '100%',
                        flexShrink: 0,
                        position: 'relative',
                        zIndex: 50,
                        borderRight: '1px solid rgba(255,255,255,0.05)',
                        background: 'rgba(15, 23, 42, 0.4)'
                    }}>
                        <Sidebar
                            embedded={true} // Enable embedded mode!
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
                                    setWaypoints(route.optimizedWaypoints);
                                }
                            }}
                        />
                    </div>
                )}

                {/* Sidebar Toggle Button - Adjusted position */}
                {activeView === 'map' && (
                    <button
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        style={{
                            position: 'absolute',
                            left: !sidebarCollapsed ? sidebarWidth - 12 : 0,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: 20,
                            height: 40,
                            background: '#1e293b',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: !sidebarCollapsed ? '8px 0 0 8px' : '0 8px 8px 0',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 100,
                            transition: 'left 0.3s ease'
                        }}
                    >
                        {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                    </button>
                )}

                {/* Content Area */}
                <div style={{
                    flex: 1,
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    {/* Filter Bar for Map View - Optional, can stay inside MapComponent or here. 
                         Keeping it here (from previous layout) or moving to MapComponent? 
                         Previous layout had it in the header. Let's put it as a sub-bar if in Map view and sidebar is collapsed? 
                         Or just rely on defaults. The previous Global Top Bar had filters. 
                         Let's put the filters INSIDE the MapComponent or a thin bar above it if needed.
                         For now, I'll put them in a floating status bar in the map or just omitted to clean up interface as per user request for "clean UI".
                         actually user didn't ask to remove filters, but "horrible layout".
                         I will keep filters in a floating bar within MapComponent or strictly for map view.
                     */}

                    {/* Map View */}
                    {activeView === 'map' && (
                        <div style={{ flex: 1, position: 'relative' }}>
                            {/* Floating Filters for Map */}
                            <div style={{
                                position: 'absolute', top: 16, right: 16, zIndex: 10,
                                display: 'flex', gap: 8
                            }}>
                                <select
                                    value={filterBrigade}
                                    onChange={(e) => setFilterBrigade(e.target.value)}
                                    style={{
                                        background: 'rgba(15, 23, 42, 0.9)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: 12
                                    }}
                                >
                                    <option value="">Todas las Cuadrillas</option>
                                    {brigades.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>

                            <MapComponent
                                waypoints={waypoints}
                                setWaypoints={setWaypoints}
                                fixedStart={fixedStart}
                                setFixedStart={setFixedStart}
                                fixedEnd={fixedEnd}
                                setFixedEnd={setFixedEnd}
                                returnToStart={returnToStart}
                                previewRoute={previewRoute}
                                filterBrigade={filterBrigade}
                                setFilterBrigade={setFilterBrigade}
                                brigades={brigades}
                                vehicles={vehicles}
                                filterVehicle={filterVehicle}
                                setFilterVehicle={setFilterVehicle}
                                onClearWaypoints={() => setWaypoints([])}
                            />
                        </div>
                    )}

                    {/* Orders View */}
                    {activeView === 'orders' && (
                        <div style={{ width: '100%', height: '100%', padding: 16, overflow: 'hidden' }}>
                            <SCRCOrdersPanel
                                brigades={brigades}
                                onClose={() => setActiveView('map')}
                                onSelectOrders={(selectedWaypoints) => {
                                    setWaypoints(prev => [...prev, ...selectedWaypoints]);
                                    toast.success(`${selectedWaypoints.length} órdenes agregadas`);
                                    setActiveView('map');
                                }}
                            />
                        </div>
                    )}

                    {/* Workforce View */}
                    {activeView === 'workforce' && (
                        <div style={{ width: '100%', height: '100%', padding: 16, overflow: 'hidden' }}>
                            <WorkforcePanel onClose={() => setActiveView('map')} />
                        </div>
                    )}
                </div>
            </div>

            {/* Modal Overlays - These are true overlays that cover everything */}
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
        </div>
    );
}

export default AdminDashboard;
