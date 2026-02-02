import React, { useState } from 'react';
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Search, Filter, User } from 'lucide-react';

const CallCenter = () => {
    const [calls, setCalls] = useState([
        { id: 'C-1023', client: 'Supermercado Central', phone: '+57 300 123 4567', type: 'incoming', status: 'pending', duration: '00:00', time: '10:30 AM' },
        { id: 'C-1022', client: 'Ferretería El Tornillo', phone: '+57 310 987 6543', type: 'outgoing', status: 'completed', duration: '04:15', time: '09:45 AM' },
        { id: 'C-1021', client: 'Restaurante Sabor', phone: '+57 320 555 1234', type: 'missed', status: 'missed', duration: '00:00', time: '09:15 AM' },
        { id: 'C-1020', client: 'Tienda La Esquina', phone: '+57 300 111 2233', type: 'incoming', status: 'completed', duration: '02:30', time: '08:50 AM' },
        { id: 'C-1019', client: 'Centro Comercial Plaza', phone: '+57 315 777 8899', type: 'outgoing', status: 'completed', duration: '01:45', time: '08:20 AM' },
    ]);

    const getTypeIcon = (type) => {
        switch (type) {
            case 'incoming': return <PhoneIncoming size={18} color="#10b981" />;
            case 'outgoing': return <PhoneOutgoing size={18} color="#3b82f6" />;
            case 'missed': return <PhoneMissed size={18} color="#ef4444" />;
            default: return <Phone size={18} color="#94a3b8" />;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'completed': return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' };
            case 'pending': return { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b' };
            case 'missed': return { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' };
            default: return { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8' };
        }
    };

    return (
        <div style={{ padding: '24px 32px', height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Centro de Llamadas</h1>
                    <p style={{ color: '#64748b', marginTop: 4 }}>Gestión de soporte y contacto con clientes</p>
                </div>
                <button style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: '#3b82f6', color: 'white',
                    border: 'none', padding: '10px 16px', borderRadius: 8,
                    fontWeight: 600, cursor: 'pointer'
                }}>
                    <Phone size={18} /> Nueva Llamada
                </button>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                <div style={{ background: '#1e293b', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 12 }}>
                    <div style={{ padding: 10, background: 'rgba(59, 130, 246, 0.1)', borderRadius: 10, height: 'fit-content' }}><PhoneIncoming size={20} color="#3b82f6" /></div>
                    <div>
                        <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Entrantes (Hoy)</p>
                        <h3 style={{ margin: '4px 0 0', fontSize: 20, color: '#f1f5f9' }}>124</h3>
                    </div>
                </div>
                <div style={{ background: '#1e293b', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 12 }}>
                    <div style={{ padding: 10, background: 'rgba(16, 185, 129, 0.1)', borderRadius: 10, height: 'fit-content' }}><PhoneOutgoing size={20} color="#10b981" /></div>
                    <div>
                        <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Salientes (Hoy)</p>
                        <h3 style={{ margin: '4px 0 0', fontSize: 20, color: '#f1f5f9' }}>45</h3>
                    </div>
                </div>
                <div style={{ background: '#1e293b', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 12 }}>
                    <div style={{ padding: 10, background: 'rgba(239, 68, 68, 0.1)', borderRadius: 10, height: 'fit-content' }}><PhoneMissed size={20} color="#ef4444" /></div>
                    <div>
                        <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Perdidas</p>
                        <h3 style={{ margin: '4px 0 0', fontSize: 20, color: '#f1f5f9' }}>3</h3>
                    </div>
                </div>
                <div style={{ background: '#1e293b', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 12 }}>
                    <div style={{ padding: 10, background: 'rgba(245, 158, 11, 0.1)', borderRadius: 10, height: 'fit-content' }}><User size={20} color="#f59e0b" /></div>
                    <div>
                        <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Agentes Activos</p>
                        <h3 style={{ margin: '4px 0 0', fontSize: 20, color: '#f1f5f9' }}>8</h3>
                    </div>
                </div>
            </div>

            {/* List */}
            <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0, fontSize: 16, color: '#f1f5f9', fontWeight: 600 }}>Historial Reciente</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ position: 'relative', width: 200 }}>
                            <Search size={14} color="#64748b" style={{ position: 'absolute', left: 10, top: 9 }} />
                            <input placeholder="Buscar..." style={{ width: '100%', background: '#0f172a', border: 'none', padding: '8px 8px 8px 30px', borderRadius: 6, color: 'white', fontSize: 13, outline: 'none' }} />
                        </div>
                    </div>
                </div>
                {calls.map((call, i) => (
                    <div key={i} style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'background 0.2s', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {getTypeIcon(call.type)}
                            </div>
                            <div>
                                <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 14 }}>{call.client}</div>
                                <div style={{ color: '#64748b', fontSize: 12 }}>{call.phone}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 500 }}>{call.time}</div>
                                <div style={{ color: '#64748b', fontSize: 11 }}>{call.duration} min</div>
                            </div>
                            <span style={{
                                ...getStatusColor(call.status),
                                padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, minWidth: 80, textAlign: 'center'
                            }}>
                                {call.status === 'completed' ? 'Completada' : call.status === 'pending' ? 'En curso' : 'Perdida'}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CallCenter;
