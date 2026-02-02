import React, { useState, useEffect } from 'react';
import { Users, Plus, Search, Edit, Trash2, Shield, User, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host';

const BrigadeManagement = () => {
    const [brigades, setBrigades] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBrigade, setEditingBrigade] = useState(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        type: 'mixed', // mixed, pesada, liviana
        capacity_per_day: 30,
        members: [] // { id, name, role: 'titular' | 'auxiliar' }
    });

    useEffect(() => {
        fetchBrigades();
        fetchDrivers();
    }, []);

    const fetchBrigades = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/brigades`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setBrigades(data.brigades);
            }
        } catch (error) {
            console.error(error);
            toast.error('Error cargando brigadas');
        } finally {
            setLoading(false);
        }
    };

    const fetchDrivers = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/drivers`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setDrivers(data); // Assuming array of drivers
        } catch (error) {
            console.error(error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        const method = editingBrigade ? 'PUT' : 'POST';
        const url = editingBrigade
            ? `${API_URL}/api/brigades/${editingBrigade.id}`
            : `${API_URL}/api/brigades`;

        try {
            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });
            const data = await res.json();

            if (data.success) {
                toast.success(editingBrigade ? 'Brigada actualizada' : 'Brigada creada');
                setIsModalOpen(false);
                setEditingBrigade(null);
                setFormData({ name: '', type: 'mixed', capacity_per_day: 30, members: [] });
                fetchBrigades();
            } else {
                toast.error(data.error || 'Error al guardar');
            }
        } catch (error) {
            toast.error('Error de conexión');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Estás seguro de eliminar esta brigada?')) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/brigades/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Brigada eliminada');
                fetchBrigades();
            } else {
                toast.error(data.error);
            }
        } catch (error) {
            toast.error('Error al eliminar');
        }
    };

    const openEdit = (brigade) => {
        setEditingBrigade(brigade);
        setFormData({
            name: brigade.name,
            type: brigade.type || 'mixed',
            capacity_per_day: brigade.capacity_per_day || 30,
            members: brigade.members || [] // Ensure it's an array
        });
        setIsModalOpen(true);
    };

    // Member Management in Form
    const addMember = (driverId) => {
        const driver = drivers.find(d => d.id === parseInt(driverId));
        if (!driver) return;

        // Prevent duplicates
        if (formData.members.some(m => m.id === driver.id)) {
            toast.warning('Este técnico ya está en la brigada');
            return;
        }

        const role = formData.members.length === 0 ? 'titular' : 'auxiliar';
        setFormData(prev => ({
            ...prev,
            members: [...prev.members, { id: driver.id, name: driver.name, role }]
        }));
    };

    const removeMember = (memberId) => {
        setFormData(prev => ({
            ...prev,
            members: prev.members.filter(m => m.id !== memberId)
        }));
    };

    const updateMemberRole = (memberId, newRole) => {
        setFormData(prev => ({
            ...prev,
            members: prev.members.map(m => m.id === memberId ? { ...m, role: newRole } : m)
        }));
    };

    const filteredBrigades = brigades.filter(b =>
        b.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0f172a', color: '#f8fafc' }}>
            {/* Header */}
            <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Gestión de Brigadas</h1>
                    <p style={{ color: '#94a3b8', marginTop: 4 }}>Configura equipos de trabajo, titulares y auxiliares</p>
                </div>
                <button
                    onClick={() => { setEditingBrigade(null); setFormData({ name: '', type: 'mixed', capacity_per_day: 30, members: [] }); setIsModalOpen(true); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#3b82f6', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                >
                    <Plus size={18} /> Nueva Brigada
                </button>
            </div>

            {/* List */}
            <div style={{ flex: 1, padding: '32px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                    <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
                        <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: 12, top: 12 }} />
                        <input
                            type="text"
                            placeholder="Buscar brigada..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ width: '100%', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 10px 10px 40px', color: 'white', outline: 'none' }}
                        />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 24, overflowY: 'auto', paddingBottom: 20 }}>
                    {filteredBrigades.map(brigade => (
                        <div key={brigade.id} style={{ background: '#1e293b', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 44, height: 44, background: 'rgba(59, 130, 246, 0.1)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Shield size={24} color="#3b82f6" />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{brigade.name}</h3>
                                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                                            {brigade.type === 'mixed' ? 'Mixta' : brigade.type === 'pesada' ? 'Pesada' : 'Liviana'} • {brigade.capacity_per_day} órdenes/día
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => openEdit(brigade)} style={{ padding: 8, background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#94a3b8' }}>
                                        <Edit size={16} />
                                    </button>
                                    <button onClick={() => handleDelete(brigade.id)} style={{ padding: 8, background: 'rgba(239, 68, 68, 0.1)', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#ef4444' }}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            {/* Members List */}
                            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>MIEMBROS ({brigade.members?.length || 0})</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {brigade.members && brigade.members.length > 0 ? (
                                        brigade.members.map((member, idx) => (
                                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <User size={14} color={member.role === 'titular' ? '#10b981' : '#94a3b8'} />
                                                <div style={{ flex: 1, fontSize: 13, color: '#f8fafc' }}>{member.name}</div>
                                                <span style={{
                                                    fontSize: 10, padding: '2px 6px', borderRadius: 4,
                                                    background: member.role === 'titular' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(148, 163, 184, 0.1)',
                                                    color: member.role === 'titular' ? '#10b981' : '#94a3b8'
                                                }}>
                                                    {member.role?.toUpperCase()}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic' }}>Sin miembros asignados</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: '#1e293b', width: 600, borderRadius: 16, padding: 32, border: '1px solid rgba(255,255,255,0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
                            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{editingBrigade ? 'Editar Brigada' : 'Nueva Brigada'}</h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={24} /></button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>Nombre Brigada</label>
                                    <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Ej: BR-NORTE-01"
                                        style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#0f172a', color: 'white' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>Tipo</label>
                                    <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}
                                        style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#0f172a', color: 'white' }}>
                                        <option value="mixed">Mixta (Corte/Rev)</option>
                                        <option value="canasta">Canasta (Altura)</option>
                                        <option value="pesada">Pesada</option>
                                        <option value="liviana">Liviana</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>Capacidad Diaria (Órdenes)</label>
                                <input type="number" value={formData.capacity_per_day} onChange={e => setFormData({ ...formData, capacity_per_day: parseInt(e.target.value) })}
                                    style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#0f172a', color: 'white' }} />
                            </div>

                            {/* Member Assignment Section */}
                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>MIEMBROS DE LA CUADRILLA</label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <select
                                            onChange={(e) => {
                                                if (e.target.value) {
                                                    addMember(e.target.value);
                                                    e.target.value = ''; // Reset select
                                                }
                                            }}
                                            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: '#0f172a', color: 'white', fontSize: 13, maxWidth: 200 }}
                                        >
                                            <option value="">+ Agregar Técnico</option>
                                            {drivers.filter(d => !formData.members.some(m => m.id === d.id)).map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div style={{ background: '#0f172a', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                    {formData.members.length === 0 ? (
                                        <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Agrega técnicos a esta cuadrilla</div>
                                    ) : (
                                        formData.members.map((member, idx) => (
                                            <div key={member.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: idx < formData.members.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                                                        {member.name.charAt(0)}
                                                    </div>
                                                    <span style={{ fontSize: 14 }}>{member.name}</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    <select
                                                        value={member.role}
                                                        onChange={(e) => updateMemberRole(member.id, e.target.value)}
                                                        style={{
                                                            padding: '4px 8px', borderRadius: 4, border: 'none',
                                                            background: member.role === 'titular' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                                                            color: member.role === 'titular' ? '#10b981' : '#3b82f6',
                                                            fontSize: 12, fontWeight: 600, cursor: 'pointer'
                                                        }}
                                                    >
                                                        <option value="titular">TITULAR</option>
                                                        <option value="auxiliar">AUXILIAR</option>
                                                    </select>
                                                    <button type="button" onClick={() => removeMember(member.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}>
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                                <button type="button" onClick={() => setIsModalOpen(false)} style={{ flex: 1, padding: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 8, cursor: 'pointer' }}>Cancelar</button>
                                <button type="submit" style={{ flex: 1, padding: 12, background: '#3b82f6', border: 'none', color: 'white', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Guardar Brigada</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BrigadeManagement;
