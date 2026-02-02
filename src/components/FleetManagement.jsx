import React, { useState, useEffect } from 'react';
import { Truck, Plus, Filter, Search, MoreVertical, Edit, Trash2, CheckCircle, AlertTriangle, XCircle, Car, Bike } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host';

const FleetManagement = () => {
    const [vehicles, setVehicles] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState(null);

    // Form State
    const [formData, setFormData] = useState({
        plate: '',
        brand: '',
        model: '',
        type: 'car',
        fuel_type: 'gasoline',
        km_per_gallon: 35,
        status: 'active',
        notes: ''
    });

    useEffect(() => {
        fetchVehicles();
        fetchStats();
    }, []);

    const fetchVehicles = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/vehicles`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setVehicles(data.vehicles);
            }
        } catch (error) {
            console.error(error);
            toast.error('Error cargando vehículos');
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/vehicles/stats/summary`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) setStats(data.stats);
        } catch (error) {
            console.error(error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        const method = editingVehicle ? 'PUT' : 'POST';
        const url = editingVehicle
            ? `${API_URL}/api/vehicles/${editingVehicle.id}`
            : `${API_URL}/api/vehicles`;

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
                toast.success(editingVehicle ? 'Vehículo actualizado' : 'Vehículo creado');
                setIsModalOpen(false);
                setEditingVehicle(null);
                setFormData({ plate: '', brand: '', model: '', type: 'car', fuel_type: 'gasoline', km_per_gallon: 35, status: 'active', notes: '' });
                fetchVehicles();
                fetchStats();
            } else {
                toast.error(data.error || 'Error al guardar');
            }
        } catch (error) {
            toast.error('Error de conexión');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Estás seguro de eliminar este vehículo?')) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/vehicles/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Vehículo eliminado');
                fetchVehicles();
                fetchStats();
            } else {
                toast.error(data.error);
            }
        } catch (error) {
            toast.error('Error al eliminar');
        }
    };

    const openEdit = (vehicle) => {
        setEditingVehicle(vehicle);
        setFormData({
            plate: vehicle.plate,
            brand: vehicle.brand || '',
            model: vehicle.model || '',
            type: vehicle.type,
            fuel_type: vehicle.fuel_type,
            km_per_gallon: vehicle.km_per_gallon,
            status: vehicle.status,
            notes: vehicle.notes || ''
        });
        setIsModalOpen(true);
    };

    const filteredVehicles = vehicles.filter(v =>
        v.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.brand && v.brand.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0f172a', color: '#f8fafc' }}>
            {/* Header */}
            <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Administración Vehicular</h1>
                    <p style={{ color: '#94a3b8', marginTop: 4 }}>Gestiona la flota de vehículos y asignaciones</p>
                </div>
                <button
                    onClick={() => { setEditingVehicle(null); setFormData({ plate: '', brand: '', model: '', type: 'car', fuel_type: 'gasoline', km_per_gallon: 35, status: 'active', notes: '' }); setIsModalOpen(true); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#3b82f6', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                >
                    <Plus size={18} /> Nuevo Vehículo
                </button>
            </div>

            {/* Stats */}
            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, padding: '24px 32px' }}>
                    <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>TOTAL FLOTA</div>
                        <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.total}</div>
                    </div>
                    <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                        <div style={{ color: '#10b981', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>ACTIVOS</div>
                        <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.active}</div>
                    </div>
                    <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                        <div style={{ color: '#f59e0b', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>MANTENIMIENTO</div>
                        <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.maintenance}</div>
                    </div>
                    <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                        <div style={{ color: '#3b82f6', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>ASIGNADOS</div>
                        <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.assigned_to_technician}</div>
                    </div>
                </div>
            )}

            {/* List */}
            <div style={{ flex: 1, padding: '0 32px 32px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                    <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
                        <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: 12, top: 12 }} />
                        <input
                            type="text"
                            placeholder="Buscar por placa o marca..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ width: '100%', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 10px 10px 40px', color: 'white', outline: 'none' }}
                        />
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', background: '#1e293b', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                        <thead style={{ background: 'rgba(255,255,255,0.02)', position: 'sticky', top: 0 }}>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '16px', color: '#94a3b8', fontWeight: 600 }}>Vehículo</th>
                                <th style={{ textAlign: 'left', padding: '16px', color: '#94a3b8', fontWeight: 600 }}>Tipo / Combustible</th>
                                <th style={{ textAlign: 'left', padding: '16px', color: '#94a3b8', fontWeight: 600 }}>Estado</th>
                                <th style={{ textAlign: 'left', padding: '16px', color: '#94a3b8', fontWeight: 600 }}>Asignación</th>
                                <th style={{ textAlign: 'right', padding: '16px', color: '#94a3b8', fontWeight: 600 }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredVehicles.map(v => (
                                <tr key={v.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ fontWeight: 600, fontSize: 15 }}>{v.plate}</div>
                                        <div style={{ color: '#94a3b8', fontSize: 13 }}>{v.brand} {v.model}</div>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                            {v.type === 'motorcycle' ? <Bike size={16} color="#8b5cf6" /> : <Car size={16} color="#3b82f6" />}
                                            <span style={{ textTransform: 'capitalize' }}>{v.type === 'motorcycle' ? 'Moto' : 'Carro'}</span>
                                        </div>
                                        <div style={{ color: '#94a3b8', fontSize: 12 }}>{v.fuel_type} ({v.km_per_gallon} km/gl)</div>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <span style={{
                                            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                                            background: v.status === 'active' ? 'rgba(16, 185, 129, 0.1)' : v.status === 'maintenance' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                            color: v.status === 'active' ? '#10b981' : v.status === 'maintenance' ? '#f59e0b' : '#ef4444'
                                        }}>
                                            {v.status === 'active' ? 'Activo' : v.status === 'maintenance' ? 'Mantenimiento' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        {v.technician_name ? (
                                            <div style={{ color: '#f8fafc' }}>👤 {v.technician_name}</div>
                                        ) : v.brigade_name ? (
                                            <div style={{ color: '#f8fafc' }}>🛡️ {v.brigade_name}</div>
                                        ) : (
                                            <span style={{ color: '#64748b', fontStyle: 'italic' }}>Sin asignar</span>
                                        )}
                                    </td>
                                    <td style={{ padding: '16px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                            <button onClick={() => openEdit(v)} style={{ padding: 8, background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#94a3b8' }}>
                                                <Edit size={16} />
                                            </button>
                                            <button onClick={() => handleDelete(v.id)} style={{ padding: 8, background: 'rgba(239, 68, 68, 0.1)', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#ef4444' }}>
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: '#1e293b', width: 500, borderRadius: 16, padding: 32, border: '1px solid rgba(255,255,255,0.1)' }}>
                        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>{editingVehicle ? 'Editar Vehículo' : 'Nuevo Vehículo'}</h2>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>Placa</label>
                                <input required type="text" value={formData.plate} onChange={e => setFormData({ ...formData, plate: e.target.value.toUpperCase() })}
                                    style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#0f172a', color: 'white' }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>Marca</label>
                                    <input type="text" value={formData.brand} onChange={e => setFormData({ ...formData, brand: e.target.value })}
                                        style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#0f172a', color: 'white' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>Modelo</label>
                                    <input type="text" value={formData.model} onChange={e => setFormData({ ...formData, model: e.target.value })}
                                        style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#0f172a', color: 'white' }} />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>Tipo</label>
                                    <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}
                                        style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#0f172a', color: 'white' }}>
                                        <option value="car">Carro / Camioneta</option>
                                        <option value="motorcycle">Moto</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>Estado</label>
                                    <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}
                                        style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#0f172a', color: 'white' }}>
                                        <option value="active">Activo</option>
                                        <option value="maintenance">Mantenimiento</option>
                                        <option value="inactive">Inactivo</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>Rendimiento (km/gl)</label>
                                <input type="number" value={formData.km_per_gallon} onChange={e => setFormData({ ...formData, km_per_gallon: parseFloat(e.target.value) })}
                                    style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#0f172a', color: 'white' }} />
                            </div>
                            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                                <button type="button" onClick={() => setIsModalOpen(false)} style={{ flex: 1, padding: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 8, cursor: 'pointer' }}>Cancelar</button>
                                <button type="submit" style={{ flex: 1, padding: 12, background: '#3b82f6', border: 'none', color: 'white', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FleetManagement;
