import React, { useState } from 'react';
import { User, Mail, Phone, Trash2, Plus, X, Users } from 'lucide-react';

const AgentsPanel = ({ agents, onAddAgent, onDeleteAgent, onClose }) => {
    const [newAgent, setNewAgent] = useState({ name: '', email: '', phone: '' });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!newAgent.name || !newAgent.email) {
            alert('Nombre y email son requeridos');
            return;
        }
        onAddAgent(newAgent);
        setNewAgent({ name: '', email: '', phone: '' });
    };

    // Desktop: sidebar on right. Mobile: CSS overrides to fullscreen
    const panelStyle = {
        position: 'fixed',
        top: 0,
        right: 0,
        width: '400px',
        maxWidth: '100%',
        height: '100vh',
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.99) 0%, rgba(30, 41, 59, 0.99) 100%)',
        backdropFilter: 'blur(12px)',
        borderLeft: '1px solid rgba(255,255,255,0.1)',
        padding: '24px',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        color: 'white',
        fontFamily: 'system-ui',
        overflowY: 'auto',
        boxSizing: 'border-box',
    };

    const inputStyle = {
        width: '100%',
        padding: '12px',
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '10px',
        fontSize: '14px',
        color: 'white',
        outline: 'none',
        boxSizing: 'border-box',
    };

    const agentCardStyle = {
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ padding: '10px', background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: '12px' }}>
                            <Users size={22} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Gestión de Agentes</h2>
                            <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>{agents.length} agentes registrados</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                {/* Add Agent Form */}
                <form onSubmit={handleSubmit} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>➕ Nuevo Agente</h3>
                    <div style={{ position: 'relative' }}>
                        <User style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', width: '16px' }} />
                        <input
                            type="text"
                            placeholder="Nombre completo"
                            value={newAgent.name}
                            onChange={(e) => setNewAgent(p => ({ ...p, name: e.target.value }))}
                            style={{ ...inputStyle, paddingLeft: '40px' }}
                        />
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Mail style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', width: '16px' }} />
                        <input
                            type="email"
                            placeholder="Email"
                            value={newAgent.email}
                            onChange={(e) => setNewAgent(p => ({ ...p, email: e.target.value }))}
                            style={{ ...inputStyle, paddingLeft: '40px' }}
                        />
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Phone style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', width: '16px' }} />
                        <input
                            type="tel"
                            placeholder="Teléfono"
                            value={newAgent.phone}
                            onChange={(e) => setNewAgent(p => ({ ...p, phone: e.target.value }))}
                            style={{ ...inputStyle, paddingLeft: '40px' }}
                        />
                    </div>
                    <button
                        type="submit"
                        style={{
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            color: 'white',
                            border: 'none',
                            padding: '12px',
                            borderRadius: '10px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                        }}
                    >
                        <Plus size={18} /> Agregar Agente
                    </button>
                </form>

                {/* Agents List */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>👥 Agentes Activos</h3>

                    {agents.length === 0 ? (
                        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '20px' }}>No hay agentes registrados</p>
                    ) : (
                        agents.map(agent => (
                            <div key={agent.id} style={agentCardStyle}>
                                <div>
                                    <div style={{ fontWeight: '600', fontSize: '14px' }}>{agent.name}</div>
                                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>{agent.email}</div>
                                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{agent.phone}</div>
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
