import React, { useState, useEffect } from 'react';
import { Navigation, CheckCircle } from 'lucide-react';
import { Toaster, toast } from 'sonner';

const DriverView = ({ params }) => {
    const { routeId } = params;
    const [route, setRoute] = useState(null);
    const [loading, setLoading] = useState(true);
    const [completedStops, setCompletedStops] = useState([]);

    useEffect(() => {
        // Try getting data from URL query params first (Stateless mode for mobile)
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

        // Fallback: Try localStorage (Works only on same device as Admin)
        const savedRoutes = JSON.parse(localStorage.getItem('logisticsRoutes') || '[]');
        const foundRoute = savedRoutes.find(r => r.id.toString() === routeId);

        if (foundRoute) {
            setRoute(foundRoute);
        } else {
            // Only show error if we also failed to get data from URL
            if (!dataParam) {
                toast.error('Ruta no encontrada (Intenta abrir el link desde el mismo dispositivo o pide reenviar)');
            }
        }
        setLoading(false);
    }, [routeId]);

    const handleMarkDelivered = (index) => {
        const newCompleted = [...completedStops, index];
        setCompletedStops(newCompleted);
        toast.success('¡Entrega completada!');

        // Try to sync with localStorage (Works if Admin is on same browser)
        try {
            const savedRoutes = JSON.parse(localStorage.getItem('logisticsRoutes') || '[]');
            const updatedRoutes = savedRoutes.map(r => {
                if (r.id.toString() === routeId) {
                    // Update the specific route's waypoint status if we were storing it
                    // Since we don't have per-waypoint status in the User object yet, we'll store it in a new field or just trigger an event
                    return { ...r, lastUpdate: Date.now(), completedCount: newCompleted.length };
                }
                return r;
            });
            localStorage.setItem('logisticsRoutes', JSON.stringify(updatedRoutes));

            // Dispatch storage event for same-tab updates (though storage event triggers usually on OTHER tabs)
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

    if (!route) return (
        <div style={{ background: '#020617', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', padding: 20, textAlign: 'center' }}>
            <div>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
                <h2 style={{ margin: '0 0 8px' }}>Ruta no encontrada</h2>
                <p style={{ color: '#94a3b8', margin: 0 }}>El enlace puede haber expirado o la ruta fue eliminada.</p>
            </div>
        </div>
    );

    const completedCount = completedStops.length;
    const totalStops = route.waypoints.length;
    const progress = (completedCount / totalStops) * 100;

    return (
        <div style={{ background: '#020617', height: '100dvh', overflowY: 'auto', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <Toaster position="top-center" richColors />

            {/* Header */}
            <div style={{
                padding: '16px 20px',
                background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
                position: 'sticky',
                top: 0,
                zIndex: 50,
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                borderBottom: '1px solid rgba(255,255,255,0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{
                        width: 44, height: 44,
                        background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                        borderRadius: 14,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)'
                    }}>
                        <Navigation size={22} color="white" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h1 style={{ fontSize: '1.1rem', fontWeight: '700', margin: 0, color: 'white' }}>{route.name}</h1>
                        <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '2px 0 0' }}>
                            {completedCount}/{totalStops} paradas • {route.distanceKm || 0} km
                        </p>
                    </div>
                </div>

                {/* Progress Bar */}
                <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 999, height: 6, overflow: 'hidden' }}>
                    <div style={{
                        width: `${progress}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #10b981, #34d399)',
                        borderRadius: 999,
                        transition: 'width 0.5s ease'
                    }} />
                </div>
            </div>

            {/* Stops List */}
            <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto', paddingBottom: 100 }}>
                {route.waypoints.map((wp, i) => {
                    const isCompleted = completedStops.includes(i);
                    const isNext = !isCompleted && (i === 0 || completedStops.includes(i - 1));

                    return (
                        <div key={i} style={{
                            background: isCompleted ? 'rgba(16, 185, 129, 0.08)' : '#1e293b',
                            borderRadius: 16,
                            padding: 16,
                            marginBottom: 20, // Increased spacing for badges
                            border: isCompleted ? '1px solid rgba(16, 185, 129, 0.3)' : (isNext ? '2px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.06)'),
                            position: 'relative',
                            boxShadow: isNext ? '0 0 0 4px rgba(59, 130, 246, 0.15)' : 'none',
                            opacity: isCompleted ? 0.7 : 1,
                            transition: 'all 0.3s ease'
                        }}>
                            {isNext && (
                                <div style={{
                                    position: 'absolute', top: -10, left: 16,
                                    background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                    color: 'white',
                                    fontSize: '0.65rem',
                                    fontWeight: 'bold',
                                    padding: '3px 10px',
                                    borderRadius: 999,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px'
                                }}>
                                    Siguiente
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 14 }}>
                                <div style={{
                                    width: 40, height: 40, borderRadius: 12,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: isCompleted ? '#10b981' : (isNext ? 'linear-gradient(135deg, #3b82f6, #6366f1)' : '#334155'),
                                    color: 'white',
                                    fontWeight: 'bold',
                                    fontSize: '0.95rem',
                                    flexShrink: 0
                                }}>
                                    {isCompleted ? <CheckCircle size={22} /> : i + 1}
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{
                                        margin: '0 0 4px',
                                        fontWeight: isNext ? '600' : '500',
                                        fontSize: '0.95rem',
                                        color: isCompleted ? '#94a3b8' : 'white',
                                        textDecoration: isCompleted ? 'line-through' : 'none',
                                        lineHeight: 1.4
                                    }}>
                                        {wp.address || `${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}`}
                                    </p>

                                    {!isCompleted && (
                                        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                                            <button
                                                onClick={() => openNavigation(wp.lat, wp.lng)}
                                                style={{
                                                    flex: 1,
                                                    padding: '14px 16px',
                                                    borderRadius: 12,
                                                    border: 'none',
                                                    background: '#334155',
                                                    color: 'white',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: 8,
                                                    cursor: 'pointer',
                                                    fontWeight: 600,
                                                    fontSize: '0.9rem'
                                                }}
                                            >
                                                <Navigation size={18} /> Navegar
                                            </button>
                                            <button
                                                onClick={() => handleMarkDelivered(i)}
                                                style={{
                                                    flex: 1,
                                                    padding: '14px 16px',
                                                    borderRadius: 12,
                                                    border: 'none',
                                                    background: isNext ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(16, 185, 129, 0.15)',
                                                    color: isNext ? 'white' : '#10b981',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: 8,
                                                    cursor: 'pointer',
                                                    fontWeight: 600,
                                                    fontSize: '0.9rem',
                                                    boxShadow: isNext ? '0 4px 15px rgba(16, 185, 129, 0.3)' : 'none'
                                                }}
                                            >
                                                <CheckCircle size={18} /> Entregar
                                            </button>
                                        </div>
                                    )}

                                    {isCompleted && (
                                        <div style={{
                                            marginTop: 8,
                                            background: 'rgba(16, 185, 129, 0.1)',
                                            color: '#10b981',
                                            padding: '6px 12px',
                                            borderRadius: 8,
                                            fontSize: '0.8rem',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6
                                        }}>
                                            <CheckCircle size={14} /> Completado
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {completedCount === totalStops && (
                    <div style={{
                        textAlign: 'center',
                        padding: '40px 20px',
                        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(52, 211, 153, 0.05))',
                        borderRadius: 20,
                        border: '1px solid rgba(16, 185, 129, 0.2)'
                    }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                        <h2 style={{ margin: '0 0 8px', color: '#10b981' }}>¡Ruta Completada!</h2>
                        <p style={{ color: '#94a3b8', margin: 0 }}>Todas las entregas han sido realizadas.</p>
                    </div>
                )}

                <div style={{ textAlign: 'center', marginTop: 24, paddingBottom: 40, color: '#475569', fontSize: '0.8rem' }}>
                    Conduce con precaución 🛡️
                </div>
            </div>
        </div>
    );
};

export default DriverView;
