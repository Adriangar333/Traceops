import React, { useState, useEffect } from 'react';
import { X, TrendingUp, Truck, MapPin, Clock, AlertTriangle, Fuel, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host';

const RouteAnalytics = ({ techId, techName, onClose }) => {
    const [stats, setStats] = useState(null);
    const [deviations, setDeviations] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            if (!techId) return;
            try {
                setLoading(true);
                // Fetch stats and deviations in parallel
                const [statsRes, devRes] = await Promise.all([
                    fetch(`${API_URL}/api/scrc/route-summary/${techId}`),
                    fetch(`${API_URL}/api/scrc/route-deviation/${techId}`)
                ]);

                if (statsRes.ok) {
                    const statsData = await statsRes.json();
                    setStats(statsData);
                }

                if (devRes.ok) {
                    const devData = await devRes.json();
                    setDeviations(devData);
                }
            } catch (error) {
                console.error('Error fetching analytics:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [techId]);

    if (!techId) return null;

    const COLORS = {
        primary: '#3b82f6',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
        bg: '#1e293b'
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
        }}>
            <div style={{
                background: '#0f172a',
                width: '90%',
                maxWidth: '1200px',
                height: '90vh',
                borderRadius: '24px',
                padding: '32px',
                color: 'white',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                overflowY: 'auto',
                border: '1px solid #334155'
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Activity size={28} color={COLORS.primary} />
                            Analítica de Rutas: {techName}
                        </h2>
                        <p style={{ color: '#94a3b8', marginTop: '4px' }}>Métricas en tiempo real, consumo y eficiencia</p>
                    </div>
                    <button onClick={onClose} style={{
                        background: '#334155', border: 'none', color: 'white',
                        padding: '12px', borderRadius: '12px', cursor: 'pointer'
                    }}>
                        <X size={24} />
                    </button>
                </div>

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
                        Cargando métricas...
                    </div>
                ) : (
                    <>
                        {/* KPI Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
                            <KpiCard
                                icon={<Fuel size={24} />}
                                label="Consumo Estimado"
                                value={`${stats?.vehicle?.km_per_gallon ? (deviations?.total_deviation_km / stats.vehicle.km_per_gallon).toFixed(1) : '--'} Gal`}
                                subtext="Basado en Km recorridos"
                                color={COLORS.warning}
                            />
                            <KpiCard
                                icon={<MapPin size={24} />}
                                label="Distancia Total"
                                value={`${deviations?.total_deviation_km || 0} km`}
                                subtext={`+${deviations?.deviation_count || 0} desviaciones`}
                                color={COLORS.primary}
                            />
                            <KpiCard
                                icon={<Clock size={24} />}
                                label="Tiempo Efectivo"
                                value={stats?.days?.[0]?.total_operation_time_formatted || '0h'}
                                subtext="Tiempo en sitio"
                                color={COLORS.success}
                            />
                            <KpiCard
                                icon={<AlertTriangle size={24} />}
                                label="Score de Eficiencia"
                                value={`${deviations?.efficiency_score || 100}%`}
                                subtext="Adherencia a ruta"
                                color={deviations?.efficiency_score < 80 ? COLORS.danger : COLORS.success}
                            />
                        </div>

                        {/* Charts Area */}
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', flex: 1 }}>
                            {/* Chart */}
                            <div style={{ background: '#1e293b', borderRadius: '16px', padding: '24px' }}>
                                <h3 style={{ marginBottom: '20px', fontWeight: '600' }}>Productividad (Últimos 7 días)</h3>
                                <div style={{ height: '300px', width: '100%' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={stats?.days || []}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                            <XAxis dataKey="date" stroke="#94a3b8" />
                                            <YAxis stroke="#94a3b8" />
                                            <Tooltip
                                                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                                                itemStyle={{ color: '#e2e8f0' }}
                                            />
                                            <Line type="monotone" dataKey="completed" stroke={COLORS.success} strokeWidth={3} name="Completadas" />
                                            <Line type="monotone" dataKey="total_orders" stroke={COLORS.primary} strokeWidth={2} name="Total Asignado" />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Deviations List */}
                            <div style={{ background: '#1e293b', borderRadius: '16px', padding: '24px', overflowY: 'auto' }}>
                                <h3 style={{ marginBottom: '20px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <AlertTriangle size={20} color={COLORS.warning} />
                                    Desviaciones Detectadas
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {deviations?.deviations?.length > 0 ? (
                                        deviations.deviations.map((dev, i) => (
                                            <div key={i} style={{
                                                background: 'rgba(239, 68, 68, 0.1)',
                                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                                padding: '12px',
                                                borderRadius: '8px'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <span style={{ fontWeight: 'bold', color: '#f87171' }}>Orden #{dev.order_number}</span>
                                                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{dev.deviation_km} km fuera</span>
                                                </div>
                                                <div style={{ fontSize: '12px', color: '#cbd5e1' }}>{dev.address}</div>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>
                                            No hay desviaciones significativas hoy
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

const KpiCard = ({ icon, label, value, subtext, color }) => (
    <div style={{
        background: '#1e293b',
        borderRadius: '16px',
        padding: '24px',
        borderLeft: `4px solid ${color}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: color }}>
            {icon}
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#94a3b8' }}>{label}</span>
        </div>
        <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'white' }}>
            {value}
        </div>
        <div style={{ fontSize: '13px', color: '#64748b' }}>
            {subtext}
        </div>
    </div>
);

export default RouteAnalytics;
