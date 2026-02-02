import React, { useState, useEffect } from 'react';
import { X, TrendingUp, Truck, MapPin, Clock, Users, BarChart3, Calendar, Download, Trash2, Fuel } from 'lucide-react';
import { fetchDashboardData, fetchAuditReport, exportMetrics, resetMetrics } from '../utils/metricsService';
import RouteAnalytics from './RouteAnalytics';

const Dashboard = ({ onClose, agents }) => {
    const [summary, setSummary] = useState(null);
    const [auditReport, setAuditReport] = useState([]);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        const loadData = async () => {
            const data = await fetchDashboardData();
            if (data) setSummary(data);

            const auditData = await fetchAuditReport();
            setAuditReport(auditData || []);
        };
        loadData();

        // Refresh every 30 seconds
        const interval = setInterval(loadData, 30000);
        return () => clearInterval(interval);
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

    // Excel Export Handlers
    const API_URL = import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host';

    const handleExportSIPREM = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            window.open(`${API_URL}/api/scrc/export/siprem?date=${today}`, '_blank');
        } catch (error) {
            console.error('Error exporting SIPREM:', error);
            alert('Error al exportar SIPREM');
        }
    };

    const handleExportConsolidado = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            window.open(`${API_URL}/api/scrc/export/consolidado?date=${today}`, '_blank');
        } catch (error) {
            console.error('Error exporting Consolidado:', error);
            alert('Error al exportar Consolidado');
        }
    };

    if (!summary) return null;

    const cardStyle = {
        background: '#ffffff',
        borderRadius: '12px',
        padding: '16px',
        border: '1px solid #f1f5f9',
        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
    };

    const statCardStyle = {
        ...cardStyle,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    };

    const labelStyle = {
        fontSize: '12px',
        color: '#64748b',
        textTransform: 'uppercase',
        fontWeight: '600'
    };

    const valueStyle = {
        fontSize: '28px',
        fontWeight: '700',
        color: '#0f172a'
    };

    const [selectedTech, setSelectedTech] = useState(null);

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
            {selectedTech && (
                <RouteAnalytics
                    techId={selectedTech.id}
                    techName={selectedTech.name}
                    onClose={() => setSelectedTech(null)}
                />
            )}

            <div style={{
                background: '#f8fafc',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '900px',
                height: '100%',
                maxHeight: '100vh',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'Inter, system-ui',
                color: '#0f172a'
            }}>
                {/* Header */}
                <div style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid #e2e8f0',
                    background: '#ffffff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ padding: 8, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderRadius: 8, color: 'white', boxShadow: '0 4px 12px rgba(16,185,129,0.25)' }}>
                            <BarChart3 size={20} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, color: '#0f172a', fontSize: '16px', fontWeight: 700 }}>Métricas de Operación</h2>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '11px' }}>Traceops Analytics</p>
                        </div>
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
                            <Download size={16} /> JSON
                        </button>
                        <button
                            onClick={handleExportSIPREM}
                            style={{
                                background: 'rgba(16,185,129,0.2)',
                                border: '1px solid #10b981',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                color: '#10b981',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '13px'
                            }}
                            title="Descargar Excel para SIPREM"
                        >
                            <Download size={16} /> SIPREM
                        </button>
                        <button
                            onClick={handleExportConsolidado}
                            style={{
                                background: 'rgba(139,92,246,0.2)',
                                border: '1px solid #8b5cf6',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                color: '#8b5cf6',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '13px'
                            }}
                            title="Descargar Excel Consolidado"
                        >
                            <Download size={16} /> Consolidado
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#94a3b8',
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
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={labelStyle}>Facturación Proyectada</span>
                                <TrendingUp size={16} color="#10b981" />
                            </div>
                            <span style={valueStyle}>${(summary.financials?.projectedValue || 0).toLocaleString()}</span>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                                Actual: ${(summary.financials?.totalValue || 0).toLocaleString()}
                            </div>
                        </div>

                        <div style={statCardStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <TrendingUp size={18} color="#9DBD39" />
                                <span style={labelStyle}>Completadas</span>
                            </div>
                            <span style={{ ...valueStyle, color: '#9DBD39' }}>{summary.completedRoutes}</span>
                            <span style={{ fontSize: '12px', color: '#64748b' }}>
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
                                <Clock size={18} color="#9DBD39" />
                                <span style={labelStyle}>Distancia Total</span>
                            </div>
                            <span style={{ ...valueStyle, color: '#9DBD39' }}>{summary.totalDistanceKm} km</span>
                        </div>

                        <div style={statCardStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Fuel size={18} color="#ef4444" />
                                <span style={labelStyle}>Consumo Aprox</span>
                            </div>
                            <span style={{ ...valueStyle, color: '#ef4444' }}>
                                {summary.totalDistanceKm ? Math.round(summary.totalDistanceKm / 35) : 0} GL
                            </span>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                                ~35 km/gl
                            </div>
                        </div>


                        <div style={statCardStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Clock size={18} color="#9DBD39" />
                                <span style={labelStyle}>Distancia Total</span>
                            </div>
                            <span style={{ ...valueStyle, color: '#9DBD39' }}>{summary.totalDistanceKm} km</span>
                        </div>
                    </div>

                    {/* Weekly Chart (Simple) */}
                    <div style={{ ...cardStyle, marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <Calendar size={18} color="#9DBD39" />
                            <span style={{ color: '#0f172a', fontWeight: '600' }}>Últimos 7 Días</span>
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
                                            background: 'linear-gradient(to top, #9DBD39, #84cc16)',
                                            borderRadius: '4px 4px 0 0',
                                            transition: 'height 0.3s'
                                        }} />
                                        <span style={{ fontSize: '11px', color: '#64748b' }}>{day.label}</span>
                                        <span style={{ fontSize: '12px', color: '#0f172a', fontWeight: '600' }}>{day.created}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Audit Section (Full Width) */}
                    <div style={{ padding: '0 16px', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <Users size={20} color="#6366f1" />
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Auditoría de Cierres</h3>
                        </div>

                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <tr>
                                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: '#64748b' }}>Orden</th>
                                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: '#64748b' }}>Técnico</th>
                                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: '#64748b' }}>Anomalía</th>
                                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: '#64748b' }}>Fecha</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditReport.length === 0 ? (
                                        <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>Sin anomalías detectadas</td></tr>
                                    ) : (
                                        auditReport.map(item => (
                                            <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '12px', fontWeight: 500 }}>{item.order_number}</td>
                                                <td style={{ padding: '12px' }}>{item.technician_name || 'N/A'}</td>
                                                <td style={{ padding: '12px' }}>
                                                    {item.audit_flags?.gps_mismatch && (
                                                        <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', marginRight: '6px' }}>
                                                            GPS Distante ({item.audit_flags.distance_off}m)
                                                        </span>
                                                    )}
                                                    {item.audit_flags?.too_fast && (
                                                        <span style={{ background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: '12px', fontSize: '11px' }}>
                                                            Cierre Rápido
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px', color: '#64748b' }}>
                                                    {new Date(item.execution_date).toLocaleString()}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Drivers Stats */}
                    <div style={cardStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <Users size={18} color="#9DBD39" />
                            <span style={{ color: '#0f172a', fontWeight: '600' }}>Conductores Activos</span>
                        </div>
                        {agents && agents.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {agents.slice(0, 5).map((agent, i) => (
                                    <div key={i} style={{
                                        padding: '10px 12px',
                                        background: '#f8fafc',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        cursor: 'pointer'
                                    }} onClick={() => setSelectedTech(agent)}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{
                                                width: '32px',
                                                height: '32px',
                                                background: '#9DBD39',
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
                                                <div style={{ color: '#0f172a', fontSize: '13px', fontWeight: '500' }}>
                                                    {agent.name}
                                                </div>
                                                <div style={{ color: '#64748b', fontSize: '11px' }}>
                                                    {agent.assignedRoutes?.length || 0} rutas asignadas
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{
                                                fontSize: '11px', color: '#3b82f6', background: 'rgba(59,130,246,0.1)',
                                                padding: '4px 8px', borderRadius: '12px'
                                            }}>
                                                Ver Analítica
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>
                                No hay conductores registrados
                            </p>
                        )}
                    </div>
                </div>

                {/* Averages */}
                <div style={{ ...cardStyle, marginTop: '16px' }}>
                    <div style={{ marginBottom: '12px', color: '#0f172a', fontWeight: '600' }}>Promedios por Ruta</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '24px', fontWeight: '700', color: '#3b82f6' }}>{summary.avgDeliveriesPerRoute}</div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>Entregas/Ruta</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '24px', fontWeight: '700', color: '#9DBD39' }}>{summary.avgDistancePerRoute} km</div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>Distancia/Ruta</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '24px', fontWeight: '700', color: '#f59e0b' }}>{summary.avgTimePerRoute} min</div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>Tiempo/Ruta</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
