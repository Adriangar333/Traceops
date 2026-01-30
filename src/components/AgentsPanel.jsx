import React, { useState } from 'react';
import { User, Mail, Phone, Trash2, Plus, X, Users } from 'lucide-react';

const AgentsPanel = ({ agents, onAddAgent, onDeleteAgent, onClose }) => {
    const [newAgent, setNewAgent] = useState({ name: '', email: '', phone: '', cuadrilla: '' });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!newAgent.name || !newAgent.email) {
            alert('Nombre y email son requeridos');
            return;
        }
        onAddAgent(newAgent);
        setNewAgent({ name: '', email: '', phone: '', cuadrilla: '' });
    };

    // Desktop: sidebar on right. Mobile: CSS overrides to fullscreen
    const panelStyle = {
        position: 'fixed',
        top: 0,
        right: 0,
        width: '400px',
        maxWidth: '100%',
        height: '100vh',
        background: '#ffffff',
        boxShadow: '-5px 0 25px rgba(0,0,0,0.1)',
        borderLeft: '1px solid #e2e8f0',
        padding: '24px',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        color: '#0f172a',
        fontFamily: 'Inter, system-ui',
        overflowY: 'auto',
        boxSizing: 'border-box',
    };

    const inputStyle = {
        width: '100%',
        padding: '12px',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '10px',
        fontSize: '14px',
        color: '#0f172a',
        outline: 'none',
        boxSizing: 'border-box',
        transition: 'border-color 0.2s',
    };

    const agentCardStyle = {
        background: '#ffffff',
        border: '1px solid #f1f5f9',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
    };

    return (
        <>
            {/* Overlay */}
            <div
                onClick={onClose}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 299 }}
            />

            {/* Panel */}
            <div className="agents-panel" style={panelStyle}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ padding: '10px', background: '#9DBD39', borderRadius: '12px', color: 'white' }}>
                            <Users size={22} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>Gestión de Agentes</h2>
                            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>{agents.length} agentes registrados</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                {/* Add Agent Form */}
                <form onSubmit={handleSubmit} style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: 0, fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>➕ Nuevo Agente</h3>
                    <div style={{ position: 'relative' }}>
                        <User style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', width: '16px' }} />
                        <input
                            type="text"
                            placeholder="Nombre completo"
                            value={newAgent.name}
                            onChange={(e) => setNewAgent(p => ({ ...p, name: e.target.value }))}
                            style={{ ...inputStyle, paddingLeft: '40px' }}
                        />
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Mail style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', width: '16px' }} />
                        <input
                            type="email"
                            placeholder="Email"
                            value={newAgent.email}
                            onChange={(e) => setNewAgent(p => ({ ...p, email: e.target.value }))}
                            style={{ ...inputStyle, paddingLeft: '40px' }}
                        />
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Phone style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', width: '16px' }} />
                        <input
                            type="tel"
                            placeholder="Teléfono"
                            value={newAgent.phone}
                            onChange={(e) => setNewAgent(p => ({ ...p, phone: e.target.value }))}
                            style={{ ...inputStyle, paddingLeft: '40px' }}
                        />
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Users style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', width: '16px' }} />
                        <select
                            value={newAgent.cuadrilla}
                            onChange={(e) => setNewAgent(p => ({ ...p, cuadrilla: e.target.value }))}
                            style={{ ...inputStyle, paddingLeft: '40px', appearance: 'none', cursor: 'pointer' }}
                        >
                            <option value="">Seleccionar tipo de cuadrilla...</option>
                            <option value="Liviana">🏍️ Cuadrilla Liviana (Motos)</option>
                            <option value="Mediana">🚙 Cuadrilla Mediana (Camionetas)</option>
                            <option value="Pesada">🚚 Cuadrilla Pesada (Camiones/Canastilla)</option>
                        </select>
                        <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8' }}>▼</div>
                    </div>
                    <button
                        type="submit"
                        style={{
                            background: '#9DBD39',
                            color: 'white',
                            border: 'none',
                            padding: '12px',
                            borderRadius: '10px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: '0 2px 5px rgba(157, 189, 57, 0.3)'
                        }}
                    >
                        <Plus size={18} /> Agregar Agente
                    </button>
                </form>

                {/* Agents List */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>👥 Agentes Activos</h3>

                    {agents.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>No hay agentes registrados</p>
                    ) : (
                        agents.map(agent => (
                            <div key={agent.id} style={agentCardStyle}>
                                <div>
                                    <div style={{ fontWeight: '600', fontSize: '14px', color: '#0f172a' }}>{agent.name}</div>
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>{agent.email}</div>
                                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{agent.phone}</div>
                                    {agent.cuadrilla && (
                                        <div style={{
                                            display: 'inline-block',
                                            fontSize: '10px',

                                            background: 'rgba(245, 158, 11, 0.1)',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            marginTop: '4px',
                                            marginRight: '8px',
                                            color: '#f59e0b',
                                            border: '1px solid rgba(245, 158, 11, 0.2)'
                                        }}>
                                            {agent.cuadrilla}
                                        </div>
                                    )}
                                    <div style={{ fontSize: '10px', color: '#10b981', marginTop: '4px' }}>
                                        {agent.assignedRoutes?.length || 0} rutas asignadas
                                    </div>
                                </div>
                                <button
                                    onClick={() => onDeleteAgent(agent.id)}
                                    style={{ background: 'rgba(239,68,68,0.2)', border: 'none', borderRadius: '8px', padding: '8px', color: '#ef4444', cursor: 'pointer' }}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </>
    );
};

export default AgentsPanel;
