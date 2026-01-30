import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, Map, Package, Activity, Users, TrendingUp, Clock, AlertCircle } from 'lucide-react';
import { getDrivers } from '../utils/backendService'; // Optional real data
import { getPendingCount } from '../utils/offlineSyncService';

const MetricCard = ({ icon, label, value, subtext, color, delay }) => (
    <div style={{
        background: 'rgba(30, 41, 59, 0.4)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: 16,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        animation: `fadeInUp 0.6s ease-out forwards ${delay}s`,
        opacity: 0,
        transform: 'translateY(20px)'
    }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{
                background: `rgba(${color}, 0.1)`,
                padding: 10,
                borderRadius: 12,
                color: `rgb(${color})`
            }}>
                {icon}
            </div>
            {subtext && (
                <span style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: subtext.includes('+') ? '#10b981' : '#ef4444',
                    background: subtext.includes('+') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    padding: '4px 8px',
                    borderRadius: 20
                }}>
                    {subtext}
                </span>
            )}
        </div>
        <div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#f8fafc', marginBottom: 4 }}>{value}</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>{label}</div>
        </div>
    </div>
);

const ActionCard = ({ title, desc, icon, onClick, delay, gradient }) => (
    <div
        onClick={onClick}
        style={{
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: 20,
            padding: 24,
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
            transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
            animation: `fadeInUp 0.6s ease-out forwards ${delay}s`,
            opacity: 0,
            transform: 'translateY(20px)'
        }}
        onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.3)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        }}
        onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
        }}
    >
        <div style={{
            position: 'absolute', top: 0, right: 0, width: 150, height: 150,
            background: gradient, filter: 'blur(60px)', opacity: 0.15, borderRadius: '50%',
            transform: 'translate(30%, -30%)'
        }} />

        <div style={{ marginBottom: 20, display: 'inline-flex', padding: 12, borderRadius: 14, background: 'rgba(255,255,255,0.05)' }}>
            {icon}
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>{title}</h3>
        <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{desc}</p>
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#10b981', fontWeight: 600 }}>
            Acceder <ArrowRight size={14} />
        </div>
    </div>
);

const DashboardHome = () => {
    const [, setLocation] = useLocation();
    const [driversCount, setDriversCount] = useState(0);

    useEffect(() => {
        getDrivers().then(drivers => setDriversCount(drivers.length)).catch(() => { });
    }, []);

    return (
        <div style={{ padding: '40px 60px', height: '100%', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ marginBottom: 40, animation: 'fadeIn 0.8s ease-out' }}>
                <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, background: 'linear-gradient(to right, #f8fafc, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Hola, Administrador 👋
                </h1>
                <p style={{ color: '#64748b', fontSize: 16 }}>Bienvenido al centro de control de Traceops. Aquí tienes un resumen de hoy.</p>
            </div>

            {/* Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, marginBottom: 48 }}>
                <MetricCard
                    icon={<Activity size={24} />}
                    label="Rutas Activas"
                    value="3"
                    subtext="+1 vs ayer"
                    color="16, 185, 129" // Emerald
                    delay={0.1}
                />
                <MetricCard
                    icon={<Clock size={24} />}
                    label="Tiempo Promedio"
                    value="42 min"
                    subtext="-5% optimización"
                    color="59, 130, 246" // Blue
                    delay={0.2}
                />
                <MetricCard
                    icon={<Users size={24} />}
                    label="Conductores"
                    value={driversCount}
                    subtext="Disponibles"
                    color="245, 158, 11" // Amber
                    delay={0.3}
                />
                <MetricCard
                    icon={<AlertCircle size={24} />}
                    label="Alertas"
                    value="0"
                    subtext="Todo normal"
                    color="99, 102, 241" // Indigo
                    delay={0.4}
                />
            </div>

            {/* Quick Actions */}
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#e2e8f0', marginBottom: 24 }}>Módulos Principales</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
                <ActionCard
                    title="Operaciones y Rutas"
                    desc="Planifica entregas, optimiza rutas inteligentes y asigna tareas a tu flota en tiempo real."
                    icon={<Map size={28} color="#10b981" />}
                    onClick={() => setLocation('/operations')}
                    delay={0.5}
                    gradient="linear-gradient(135deg, #10b981, #059669)"
                />
                <ActionCard
                    title="Control de Inventario"
                    desc="Gestiona stock, almacenes y movimientos de mercancía (Nuevo Módulo)."
                    icon={<Package size={28} color="#818cf8" />}
                    onClick={() => setLocation('/inventory')}
                    delay={0.6}
                    gradient="linear-gradient(135deg, #6366f1, #4f46e5)"
                />
                <ActionCard
                    title="Gestión de Flota"
                    desc="Administra conductores, vehículos y perfiles de usuario."
                    icon={<Users size={28} color="#f59e0b" />}
                    onClick={() => setLocation('/fleet')}
                    delay={0.7}
                    gradient="linear-gradient(135deg, #f59e0b, #d97706)"
                />
            </div>

            {/* Global Styles for Animations */}
            <style>{`
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default DashboardHome;
