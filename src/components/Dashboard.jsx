import React, { useState, useEffect } from 'react';
import { X, TrendingUp, Truck, MapPin, Clock, Users, BarChart3, Calendar, Download, Trash2 } from 'lucide-react';
import { calculateSummary, exportMetrics, resetMetrics } from '../utils/metricsService';

const Dashboard = ({ onClose, agents }) => {
    const [summary, setSummary] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        setSummary(calculateSummary());

        // Listen for updates from other tabs (Driver View)
        const handleStorageChange = () => {
            setSummary(calculateSummary());
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const handleExport = () => {
        const data = exportMetrics();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `route-metrics-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleReset = () => {
        if (window.confirm('¿Estás seguro que deseas limpiar TODAS las métricas? Esta acción no se puede deshacer.')) {
            resetMetrics();
            setSummary(calculateSummary());
        }
    };

    if (!summary) return null;

    const cardStyle = {
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '12px',
        padding: '16px',
        border: '1px solid rgba(255,255,255,0.1)'
    };

    const statCardStyle = {
        ...cardStyle,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    };

    const labelStyle = {
        fontSize: '12px',
        color: 'rgba(255,255,255,0.6)',
        textTransform: 'uppercase',
        fontWeight: '500'
    };

    const valueStyle = {
        fontSize: '28px',
        fontWeight: '700',
        color: 'white'
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(8px)',
            zIndex: 300,
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'center',
            padding: '0'
        }}>
            <div style={{
                background: '#1e293b',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '900px',
                height: '100%',
                maxHeight: '100vh',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'system-ui'
            }}>
                {/* Header */}
                <div style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <BarChart3 size={22} color="#3b82f6" />
                        <h2 style={{ margin: 0, color: 'white', fontSize: '16px' }}>Dashboard</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={handleReset}
                            style={{
                                background: 'rgba(239,68,68,0.2)',
                                border: '1px solid #ef4444',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                color: '#ef4444',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '13px'
                            }}
                            title="Limpiar todas las métricas"
                        >
                            <Trash2 size={16} /> Limpiar
                        </button>
                        <button
                            onClick={handleExport}
                            style={{
                                background: 'rgba(59,130,246,0.2)',
                                border: '1px solid #3b82f6',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                color: '#3b82f6',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '13px'
                            }}
                        >
                            <Download size={16} /> Exportar
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'rgba(255,255,255,0.6)',
                                cursor: 'pointer',
                                padding: '8px'
                            }}
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div style={{ padding: '16px', overflow: 'auto', flex: 1 }}>
                    {/* Stats Grid */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '12px',
                        marginBottom: '20px'
                    }}>
                        <div style={statCardStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Truck size={18} color="#3b82f6" />
                                <span style={labelStyle}>Rutas Totales</span>
                            </div>
                            <span style={valueStyle}>{summary.totalRoutes}</span>
                        </div>

                        <div style={statCardStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <TrendingUp size={18} color="#10b981" />
                                <span style={labelStyle}>Completadas</span>
                            </div>
                            <span style={{ ...valueStyle, color: '#10b981' }}>{summary.completedRoutes}</span>
                            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                                {summary.completionRate}% tasa de éxito
                            </span>
                        </div>

                        <div style={statCardStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <MapPin size={18} color="#f59e0b" />
                                <span style={labelStyle}>Entregas</span>
                            </div>
                            <span style={{ ...valueStyle, color: '#f59e0b' }}>{summary.totalDeliveries}</span>
                        </div>

                        <div style={statCardStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Clock size={18} color="#8b5cf6" />
                                <span style={labelStyle}>Distancia Total</span>
                            </div>
                            <span style={{ ...valueStyle, color: '#8b5cf6' }}>{summary.totalDistanceKm} km</span>
                        </div>
                    </div>

                    {/* Weekly Chart (Simple) */}
                    <div style={{ ...cardStyle, marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <Calendar size={18} color="#3b82f6" />
                            <span style={{ color: 'white', fontWeight: '600' }}>Últimos 7 Días</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '120px', gap: '8px' }}>
                            {summary.last7Days.map((day, i) => {
                                const maxValue = Math.max(...summary.last7Days.map(d => d.created || 1));
                                const height = day.created > 0 ? (day.created / maxValue) * 100 : 5;
                                return (
                                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                        <div style={{
                                            width: '100%',
                                            height: `${height}%`,
                                            minHeight: '8px',
                                            background: 'linear-gradient(to top, #3b82f6, #6366f1)',
                                            borderRadius: '4px 4px 0 0',
                                            transition: 'height 0.3s'
                                        }} />
                                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{day.label}</span>
                                        <span style={{ fontSize: '12px', color: 'white', fontWeight: '600' }}>{day.created}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Two Column Layout */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                        {/* Recent Routes */}
                        <div style={cardStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <Truck size={18} color="#3b82f6" />
                                <span style={{ color: 'white', fontWeight: '600' }}>Rutas Recientes</span>
                            </div>
                            {summary.recentRoutes.length === 0 ? (
                                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: 0 }}>
                                    No hay rutas registradas aún
                                </p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {summary.recentRoutes.map((route, i) => (
                                        <div key={i} style={{
                                            padding: '10px 12px',
                                            background: 'rgba(255,255,255,0.03)',
                                            borderRadius: '8px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <div>
                                                <div style={{ color: 'white', fontSize: '13px', fontWeight: '500' }}>
                                                    {route.name || `Ruta #${route.id}`}
                                                </div>
                                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>
                                                    {route.waypoints} paradas · {route.distanceKm} km
                                                </div>
                                            </div>
                                            <span style={{
                                                padding: '4px 8px',
                                                background: route.status === 'completed' ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)',
                                                color: route.status === 'completed' ? '#10b981' : '#3b82f6',
                                                borderRadius: '4px',
                                                fontSize: '10px',
                                                fontWeight: '600',
                                                textTransform: 'uppercase'
                                            }}>
                                                {route.status === 'completed' ? 'Completada' : 'Creada'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Drivers Stats */}
                        <div style={cardStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <Users size={18} color="#3b82f6" />
                                <span style={{ color: 'white', fontWeight: '600' }}>Conductores Activos</span>
                            </div>
                            {agents && agents.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {agents.slice(0, 5).map((agent, i) => (
                                        <div key={i} style={{
                                            padding: '10px 12px',
                                            background: 'rgba(255,255,255,0.03)',
                                            borderRadius: '8px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                                    borderRadius: '50%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: 'white',
                                                    fontSize: '12px',
                                                    fontWeight: '700'
                                                }}>
                                                    {agent.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div style={{ color: 'white', fontSize: '13px', fontWeight: '500' }}>
                                                        {agent.name}
                                                    </div>
                                                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>
                                                        {agent.assignedRoutes?.length || 0} rutas asignadas
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: 0 }}>
                                    No hay conductores registrados
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Averages */}
                    <div style={{ ...cardStyle, marginTop: '16px' }}>
                        <div style={{ marginBottom: '12px', color: 'white', fontWeight: '600' }}>Promedios por Ruta</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', fontWeight: '700', color: '#3b82f6' }}>{summary.avgDeliveriesPerRoute}</div>
                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Entregas/Ruta</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', fontWeight: '700', color: '#10b981' }}>{summary.avgDistancePerRoute} km</div>
                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Distancia/Ruta</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', fontWeight: '700', color: '#f59e0b' }}>{summary.avgTimePerRoute} min</div>
                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Tiempo/Ruta</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
};

export default Dashboard;
