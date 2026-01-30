import React from 'react';
import { useLocation } from 'wouter';
import { LayoutDashboard, Map, Users, Package, Settings, LogOut, Truck, Boxes, Phone } from 'lucide-react';

const MainLayout = ({ children }) => {
    const [location, setLocation] = useLocation();

    const navItems = [
        { icon: <LayoutDashboard size={20} />, label: 'Inicio', path: '/' },
        { icon: <Map size={20} />, label: 'Planeación Operativa', path: '/operations' },
        { icon: <Truck size={20} />, label: 'Adm. Vehicular', path: '/fleet' },
        { icon: <Boxes size={20} />, label: 'Adm. Logística', path: '/inventory' },
        { icon: <Phone size={20} />, label: 'Llamadas', path: '/calls' },
        { icon: <Settings size={20} />, label: 'Configuración', path: '/settings' },
    ];

    return (
        <div style={{ display: 'flex', height: '100vh', background: '#0f172a', color: '#f8fafc', overflow: 'hidden' }}>
            {/* Sidebar Navigation */}
            <nav style={{
                width: 260,
                background: 'rgba(15, 23, 42, 0.98)',
                borderRight: '1px solid rgba(255,255,255,0.05)',
                display: 'flex', flexDirection: 'column',
                padding: 24,
                zIndex: 50,
                boxShadow: '4px 0 24px rgba(0,0,0,0.2)'
            }}>
                {/* Brand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40, padding: '0 8px' }}>
                    <div style={{
                        width: 36, height: 36,
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        borderRadius: 10,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                    }}>
                        <Map size={20} color="white" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: '#f8fafc' }}>Traceops</h1>
                        <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>Logistics Intelligence</p>
                    </div>
                </div>

                {/* Navigation Items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    {navItems.map(item => {
                        const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path));
                        return (
                            <button
                                key={item.path}
                                onClick={() => setLocation(item.path)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '12px 16px',
                                    background: isActive ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%)' : 'transparent',
                                    border: 'none',
                                    borderLeft: isActive ? '3px solid #10b981' : '3px solid transparent',
                                    borderRadius: '0 12px 12px 0',
                                    color: isActive ? '#10b981' : '#94a3b8',
                                    cursor: 'pointer',
                                    fontSize: 14,
                                    fontWeight: isActive ? 600 : 500,
                                    textAlign: 'left',
                                    transition: 'all 0.2s ease',
                                    outline: 'none'
                                }}
                                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#e2e8f0'; }}
                                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#94a3b8'; }}
                            >
                                {item.icon}
                                {item.label}
                            </button>
                        )
                    })}
                </div>

                {/* User Profile / Logout footer */}
                <div style={{ marginTop: 'auto', paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px', opacity: 0.7 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Users size={16} color="#94a3b8" />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>Admin User</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>admin@traceops.com</div>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main Content Area */}
            <main style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0f172a' }}>
                {children}
            </main>
        </div>
    );
};

export default MainLayout;
