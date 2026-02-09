import React, { useState, useEffect } from 'react';
import {
    Truck, User, Wrench, Calendar, Plus, Search,
    AlertTriangle, CheckCircle, Clock, FileText,
    MoreVertical, Key
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

// Helper for status badges
const StatusBadge = ({ status }) => {
    const styles = {
        active: { bg: 'rgba(16, 185, 129, 0.2)', color: '#34d399', text: 'Activo' },
        inactive: { bg: 'rgba(100, 116, 139, 0.2)', color: '#94a3b8', text: 'Inactivo' },
        repair: { bg: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', text: 'En Taller' },
        maintenance: { bg: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', text: 'Mantenimiento' },
        completed: { bg: 'rgba(16, 185, 129, 0.2)', color: '#34d399', text: 'Completado' },
        pending: { bg: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', text: 'Pendiente' }
    };
    const style = styles[status] || styles.inactive;

    return (
        <span style={{
            background: style.bg,
            color: style.color,
            padding: '4px 10px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4
        }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: style.color }} />
            {style.text}
        </span>
    );
};

const FleetManagement = () => {
    const [activeTab, setActiveTab] = useState('vehicles');
    const [vehicles, setVehicles] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [maintenance, setMaintenance] = useState([]);
    const [loading, setLoading] = useState(false);

    // UI States
    const [showVehicleModal, setShowVehicleModal] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showDriverModal, setShowDriverModal] = useState(false);
    const [newVehicle, setNewVehicle] = useState({
        plate: '', brand: '', model: '', type: 'moto', km_current: 0,
        ownership_type: 'propio', year: '', soat_expiry: '', tecno_expiry: ''
    });
    const [newDriver, setNewDriver] = useState({
        name: '', phone: '', email: '', cuadrilla: '', license_number: '', license_expiry: '', brigade_role: 'driver'
    });
    const [newAssignment, setNewAssignment] = useState({ vehicle_id: '', driver_id: '', initial_km: 0, notes: '' });
    const [newMaintenance, setNewMaintenance] = useState({ vehicle_id: '', type: 'preventive', description: '', cost: 0, notes: '' });
    const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);

    // Fetch Data
    const fetchData = async () => {
        setLoading(true);
        try {
            const headers = { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` };
            const baseUrl = import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host/api';

            const [vRes, dRes, aRes, mRes] = await Promise.all([
                fetch(`${baseUrl}/fleet/vehicles`, { headers }),
                fetch(`${baseUrl}/fleet/drivers`, { headers }),
                fetch(`${baseUrl}/fleet/assignments`, { headers }),
                fetch(`${baseUrl}/fleet/maintenance`, { headers })
            ]);

            if (vRes.ok) setVehicles(await vRes.json());
            if (dRes.ok) setDrivers(await dRes.json());
            if (aRes.ok) setAssignments(await aRes.json());
            if (mRes.ok) setMaintenance(await mRes.json());

        } catch (error) {
            console.error('Error fetching fleet data:', error);
            toast.error('Error cargando datos de flota');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Handlers
    const handleCreateVehicle = async () => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host/api'}/fleet/vehicles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify(newVehicle)
            });

            if (!res.ok) throw new Error('Failed to create');

            toast.success('Vehículo creado correctamente');
            setShowVehicleModal(false);
            fetchData();
        } catch (error) {
            toast.error('Error al crear vehículo');
        }
    };

    const handleAssign = async () => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host/api'}/fleet/assignments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify(newAssignment)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to assign');
            }

            toast.success('Asignación realizada');
            setShowAssignModal(false);
            fetchData();
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleCreateMaintenance = async () => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host/api'}/fleet/maintenance`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify(newMaintenance)
            });

            if (!res.ok) throw new Error('Failed to log maintenance');

            toast.success('Mantenimiento registrado');
            setShowMaintenanceModal(false);
            fetchData();
        } catch (error) {
            toast.error('Error al registrar mantenimiento');
        }
    };

    // Create Driver
    const handleCreateDriver = async () => {
        if (!newDriver.name) {
            toast.error('El nombre es requerido');
            return;
        }
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host/api'}/fleet/drivers`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify(newDriver)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Error al crear conductor');
            }

            toast.success('Conductor creado correctamente');
            setShowDriverModal(false);
            setNewDriver({ name: '', phone: '', email: '', cuadrilla: '', license_number: '', license_expiry: '', brigade_role: 'driver' });
            fetchData();
        } catch (error) {
            toast.error(error.message);
        }
    };

    // Components
    const TabButton = ({ id, label, icon: Icon }) => (
        <button
            onClick={() => setActiveTab(id)}
            style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 24px',
                background: activeTab === id ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                border: activeTab === id ? '1px solid #6366f1' : '1px solid transparent',
                borderRadius: 12,
                color: activeTab === id ? '#818cf8' : '#94a3b8',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontWeight: 600
            }}
        >
            <Icon size={18} />
            {label}
        </button>
    );

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0f172a', color: '#f8fafc' }}>
            {/* Header */}
            <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Truck className="text-indigo-400" />
                        Gestión de Flota
                    </h1>
                    <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>
                        Administra vehículos, conductores y mantenimientos
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <TabButton id="vehicles" label="Vehículos" icon={Truck} />
                    <TabButton id="drivers" label="Conductores" icon={User} />
                    <TabButton id="assignments" label="Asignaciones" icon={Key} />
                    <TabButton id="maintenance" label="Mantenimiento" icon={Wrench} />
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, padding: 32, overflowY: 'auto' }}>

                {/* VEHICLES TAB */}
                {activeTab === 'vehicles' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
                            <button
                                onClick={() => setShowVehicleModal(true)}
                                style={{
                                    background: '#4f46e5', color: 'white', border: 'none',
                                    padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600
                                }}
                            >
                                <Plus size={18} /> Nuevo Vehículo
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
                            {vehicles.map(vehicle => (
                                <div key={vehicle.id} style={{
                                    background: '#1e293b', borderRadius: 16, padding: 20,
                                    border: '1px solid rgba(255,255,255,0.05)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                        <div style={{
                                            background: '#334155', width: 48, height: 48, borderRadius: 12,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <Truck color="#94a3b8" />
                                        </div>
                                        <StatusBadge status={vehicle.status} />
                                    </div>
                                    <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>{vehicle.plate}</h3>
                                    <p style={{ color: '#94a3b8', fontSize: 14 }}>{vehicle.brand} {vehicle.model}</p>

                                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div>
                                            <div style={{ fontSize: 12, color: '#64748b' }}>Kilometraje</div>
                                            <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{vehicle.km_current.toLocaleString()} km</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 12, color: '#64748b' }}>Tipo</div>
                                            <div style={{ color: '#e2e8f0', fontWeight: 600, textTransform: 'capitalize' }}>{vehicle.type}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* DRIVERS TAB */}
                {activeTab === 'drivers' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                            <h3 style={{ fontSize: 18, color: '#e2e8f0', margin: 0 }}>
                                Conductores / Técnicos ({drivers.length})
                            </h3>
                            <div style={{ color: '#64748b', fontSize: 13 }}>
                                Los conductores se gestionan desde el sistema de usuarios
                            </div>
                        </div>
                        <div style={{ background: '#1e293b', borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ background: '#0f172a', color: '#94a3b8', fontSize: 13, textTransform: 'uppercase' }}>
                                    <tr>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Nombre</th>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Email</th>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Rol</th>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Estado</th>
                                    </tr>
                                </thead>
                                <tbody style={{ color: '#e2e8f0', fontSize: 14 }}>
                                    {drivers.length === 0 ? (
                                        <tr>
                                            <td colSpan="4" style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                                                No hay conductores registrados. Crea usuarios con rol "driver" en el sistema de autenticación.
                                            </td>
                                        </tr>
                                    ) : drivers.map(driver => (
                                        <tr key={driver.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14 }}>
                                                    {driver.name?.charAt(0)?.toUpperCase() || '?'}
                                                </div>
                                                <div style={{ fontWeight: 600 }}>{driver.name}</div>
                                            </td>
                                            <td style={{ padding: 16 }}>{driver.email || '-'}</td>
                                            <td style={{ padding: 16 }}>
                                                <span style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', padding: '4px 10px', borderRadius: 6, fontSize: 12 }}>
                                                    {driver.role === 'driver' ? 'Conductor/Técnico' : driver.role}
                                                </span>
                                            </td>
                                            <td style={{ padding: 16 }}><StatusBadge status={driver.status || 'active'} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {/* ASSIGNMENTS TAB */}
                {activeTab === 'assignments' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
                            <h3 style={{ fontSize: 18, color: '#e2e8f0' }}>Historial de Asignaciones</h3>
                            <button
                                onClick={() => setShowAssignModal(true)}
                                style={{
                                    background: '#4f46e5', color: 'white', border: 'none',
                                    padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600
                                }}
                            >
                                <Key size={18} /> Asignar Vehículo
                            </button>
                        </div>

                        <div style={{ background: '#1e293b', borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ background: '#0f172a', color: '#94a3b8', fontSize: 13, textTransform: 'uppercase' }}>
                                    <tr>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Vehículo</th>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Conductor</th>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Fecha Asignación</th>
                                        <th style={{ padding: 16, textAlign: 'left' }}>KM Inicial</th>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Estado</th>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Notas</th>
                                    </tr>
                                </thead>
                                <tbody style={{ color: '#e2e8f0', fontSize: 14 }}>
                                    {assignments.map(assign => (
                                        <tr key={assign.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: 16 }}>
                                                <div style={{ fontWeight: 600 }}>{assign.plate}</div>
                                                <div style={{ fontSize: 12, color: '#94a3b8' }}>{assign.brand} {assign.model}</div>
                                            </td>
                                            <td style={{ padding: 16 }}>{assign.driver_name}</td>
                                            <td style={{ padding: 16 }}>{format(new Date(assign.assigned_at), 'dd/MM/yyyy HH:mm')}</td>
                                            <td style={{ padding: 16 }}>{assign.initial_km} km</td>
                                            <td style={{ padding: 16 }}>
                                                <StatusBadge status={assign.status} />
                                            </td>
                                            <td style={{ padding: 16, color: '#94a3b8' }}>{assign.notes || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
                {/* MAINTENANCE TAB */}
                {activeTab === 'maintenance' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
                            <button
                                onClick={() => setShowMaintenanceModal(true)}
                                style={{
                                    background: '#4f46e5', color: 'white', border: 'none',
                                    padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600
                                }}
                            >
                                <Wrench size={18} /> Registrar Mantenimiento
                            </button>
                        </div>

                        <div style={{ background: '#1e293b', borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ background: '#0f172a', color: '#94a3b8', fontSize: 13, textTransform: 'uppercase' }}>
                                    <tr>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Vehículo</th>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Tipo</th>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Fecha</th>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Costo</th>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Descripción</th>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Estado</th>
                                    </tr>
                                </thead>
                                <tbody style={{ color: '#e2e8f0', fontSize: 14 }}>
                                    {maintenance.map(m => (
                                        <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: 16 }}>
                                                <div style={{ fontWeight: 600 }}>{m.plate}</div>
                                            </td>
                                            <td style={{ padding: 16 }}>
                                                <span style={{
                                                    background: m.type === 'preventive' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                                    color: m.type === 'preventive' ? '#60a5fa' : '#f87171',
                                                    padding: '4px 8px', borderRadius: 6, fontSize: 12, textTransform: 'capitalize'
                                                }}>
                                                    {m.type === 'preventive' ? 'Preventivo' : 'Correctivo'}
                                                </span>
                                            </td>
                                            <td style={{ padding: 16 }}>{format(new Date(m.date), 'dd/MM/yyyy')}</td>
                                            <td style={{ padding: 16, fontWeight: 700 }}>${m.cost.toLocaleString()}</td>
                                            <td style={{ padding: 16 }}>{m.description}</td>
                                            <td style={{ padding: 16 }}>
                                                <StatusBadge status="completed" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {/* MODAL: New Vehicle */}
            {showVehicleModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
                }}>
                    <div style={{ background: '#1e293b', padding: 24, borderRadius: 16, width: 480, border: '1px solid rgba(255,255,255,0.1)', maxHeight: '85vh', overflowY: 'auto' }}>
                        <h3 style={{ margin: '0 0 20px', color: '#f8fafc' }}>Nuevo Vehículo</h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Placa y Tipo */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Placa *</label>
                                    <input
                                        placeholder="ABC-123"
                                        value={newVehicle.plate}
                                        onChange={e => setNewVehicle({ ...newVehicle, plate: e.target.value.toUpperCase() })}
                                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white', boxSizing: 'border-box', fontWeight: 600 }}
                                    />
                                </div>
                                <div>
                                    <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Tipo de Vehículo</label>
                                    <select
                                        value={newVehicle.type}
                                        onChange={e => setNewVehicle({ ...newVehicle, type: e.target.value })}
                                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white', boxSizing: 'border-box' }}
                                    >
                                        <option value="moto">🏍️ Moto</option>
                                        <option value="carro">🚗 Carro</option>
                                        <option value="camion">🚚 Camión</option>
                                        <option value="camioneta">🛻 Camioneta</option>
                                    </select>
                                </div>
                            </div>

                            {/* Marca y Modelo */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Marca</label>
                                    <input
                                        placeholder="Ej: Toyota"
                                        value={newVehicle.brand}
                                        onChange={e => setNewVehicle({ ...newVehicle, brand: e.target.value })}
                                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Modelo</label>
                                    <input
                                        placeholder="Ej: Hilux"
                                        value={newVehicle.model}
                                        onChange={e => setNewVehicle({ ...newVehicle, model: e.target.value })}
                                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            {/* Año y Tipo de Propiedad */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Año</label>
                                    <input
                                        type="number"
                                        placeholder="Ej: 2022"
                                        value={newVehicle.year}
                                        onChange={e => setNewVehicle({ ...newVehicle, year: e.target.value })}
                                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Tipo de Propiedad</label>
                                    <select
                                        value={newVehicle.ownership_type}
                                        onChange={e => setNewVehicle({ ...newVehicle, ownership_type: e.target.value })}
                                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white', boxSizing: 'border-box' }}
                                    >
                                        <option value="propio">🏠 Propio</option>
                                        <option value="renting">📋 Renting</option>
                                        <option value="leasing">🔄 Leasing</option>
                                    </select>
                                </div>
                            </div>

                            {/* Kilometraje */}
                            <div>
                                <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Kilometraje Inicial</label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={newVehicle.km_current}
                                    onChange={e => setNewVehicle({ ...newVehicle, km_current: parseInt(e.target.value) || 0 })}
                                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white', boxSizing: 'border-box' }}
                                />
                            </div>

                            {/* SOAT y Tecnomecánica */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Vencimiento SOAT</label>
                                    <input
                                        type="date"
                                        value={newVehicle.soat_expiry}
                                        onChange={e => setNewVehicle({ ...newVehicle, soat_expiry: e.target.value })}
                                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Vencimiento Tecnomecánica</label>
                                    <input
                                        type="date"
                                        value={newVehicle.tecno_expiry}
                                        onChange={e => setNewVehicle({ ...newVehicle, tecno_expiry: e.target.value })}
                                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                                <button
                                    onClick={() => setShowVehicleModal(false)}
                                    style={{ flex: 1, padding: 12, background: 'transparent', border: '1px solid #475569', color: '#94a3b8', borderRadius: 8, cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCreateVehicle}
                                    style={{ flex: 1, padding: 12, background: '#4f46e5', border: 'none', color: 'white', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
                                >
                                    Crear Vehículo
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: New Assignment */}
            {showAssignModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
                }}>
                    <div style={{ background: '#1e293b', padding: 24, borderRadius: 16, width: 400, border: '1px solid rgba(255,255,255,0.1)' }}>
                        <h3 style={{ margin: '0 0 20px', color: '#f8fafc' }}>Asignar Vehículo</h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <label style={{ color: '#94a3b8', fontSize: 13 }}>Vehículo Disponible</label>
                            <select
                                value={newAssignment.vehicle_id}
                                onChange={e => {
                                    const v = vehicles.find(v => v.id === parseInt(e.target.value));
                                    setNewAssignment({
                                        ...newAssignment,
                                        vehicle_id: e.target.value,
                                        initial_km: v ? v.km_current : 0
                                    });
                                }}
                                style={{ background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white' }}
                            >
                                <option value="">Seleccionar Vehículo</option>
                                {vehicles.filter(v => v.status !== 'repair').map(v => (
                                    <option key={v.id} value={v.id}>{v.plate} - {v.brand}</option>
                                ))}
                            </select>

                            <label style={{ color: '#94a3b8', fontSize: 13 }}>Conductor</label>
                            <select
                                value={newAssignment.driver_id}
                                onChange={e => setNewAssignment({ ...newAssignment, driver_id: e.target.value })}
                                style={{ background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white' }}
                            >
                                <option value="">Seleccionar Conductor</option>
                                {drivers.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>

                            <label style={{ color: '#94a3b8', fontSize: 13 }}>KM Inicial</label>
                            <input
                                type="number"
                                value={newAssignment.initial_km}
                                onChange={e => setNewAssignment({ ...newAssignment, initial_km: parseInt(e.target.value) })}
                                style={{ background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white' }}
                            />

                            <label style={{ color: '#94a3b8', fontSize: 13 }}>Notas</label>
                            <textarea
                                value={newAssignment.notes}
                                onChange={e => setNewAssignment({ ...newAssignment, notes: e.target.value })}
                                style={{ background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white', minHeight: 80 }}
                            />

                            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                                <button
                                    onClick={() => setShowAssignModal(false)}
                                    style={{ flex: 1, padding: 12, background: 'transparent', border: '1px solid #475569', color: '#94a3b8', borderRadius: 8, cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleAssign}
                                    style={{ flex: 1, padding: 12, background: '#4f46e5', border: 'none', color: 'white', borderRadius: 8, cursor: 'pointer' }}
                                >
                                    Asignar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: New Maintenance */}
            {showMaintenanceModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
                }}>
                    <div style={{ background: '#1e293b', padding: 24, borderRadius: 16, width: 400, border: '1px solid rgba(255,255,255,0.1)' }}>
                        <h3 style={{ margin: '0 0 20px', color: '#f8fafc' }}>Registrar Mantenimiento</h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <label style={{ color: '#94a3b8', fontSize: 13 }}>Vehículo</label>
                            <select
                                value={newMaintenance.vehicle_id}
                                onChange={e => setNewMaintenance({ ...newMaintenance, vehicle_id: e.target.value })}
                                style={{ background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white' }}
                            >
                                <option value="">Seleccionar Vehículo</option>
                                {vehicles.map(v => (
                                    <option key={v.id} value={v.id}>{v.plate} - {v.brand}</option>
                                ))}
                            </select>

                            <label style={{ color: '#94a3b8', fontSize: 13 }}>Tipo</label>
                            <select
                                value={newMaintenance.type}
                                onChange={e => setNewMaintenance({ ...newMaintenance, type: e.target.value })}
                                style={{ background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white' }}
                            >
                                <option value="preventive">Preventivo</option>
                                <option value="corrective">Correctivo (Falla)</option>
                            </select>

                            <label style={{ color: '#94a3b8', fontSize: 13 }}>Costo y Descripción</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                                <input
                                    type="number"
                                    placeholder="Costo"
                                    value={newMaintenance.cost}
                                    onChange={e => setNewMaintenance({ ...newMaintenance, cost: parseFloat(e.target.value) })}
                                    style={{ background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white' }}
                                />
                                <input
                                    placeholder="Descripción breve"
                                    value={newMaintenance.description}
                                    onChange={e => setNewMaintenance({ ...newMaintenance, description: e.target.value })}
                                    style={{ background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white' }}
                                />
                            </div>

                            <label style={{ color: '#94a3b8', fontSize: 13 }}>Notas Adicionales</label>
                            <textarea
                                value={newMaintenance.notes}
                                onChange={e => setNewMaintenance({ ...newMaintenance, notes: e.target.value })}
                                style={{ background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white', minHeight: 60 }}
                            />

                            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                                <button
                                    onClick={() => setShowMaintenanceModal(false)}
                                    style={{ flex: 1, padding: 12, background: 'transparent', border: '1px solid #475569', color: '#94a3b8', borderRadius: 8, cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCreateMaintenance}
                                    style={{ flex: 1, padding: 12, background: '#4f46e5', border: 'none', color: 'white', borderRadius: 8, cursor: 'pointer' }}
                                >
                                    Registrar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: New Driver */}
            {showDriverModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
                }}>
                    <div style={{ background: '#1e293b', padding: 24, borderRadius: 16, width: 450, border: '1px solid rgba(255,255,255,0.1)', maxHeight: '85vh', overflowY: 'auto' }}>
                        <h3 style={{ margin: '0 0 20px', color: '#f8fafc' }}>Nuevo Conductor</h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Nombre *</label>
                                <input
                                    placeholder="Nombre completo"
                                    value={newDriver.name}
                                    onChange={e => setNewDriver({ ...newDriver, name: e.target.value })}
                                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Teléfono</label>
                                    <input
                                        placeholder="3001234567"
                                        value={newDriver.phone}
                                        onChange={e => setNewDriver({ ...newDriver, phone: e.target.value })}
                                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Email</label>
                                    <input
                                        type="email"
                                        placeholder="email@ejemplo.com"
                                        value={newDriver.email}
                                        onChange={e => setNewDriver({ ...newDriver, email: e.target.value })}
                                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Cuadrilla</label>
                                    <input
                                        placeholder="Ej: C-001"
                                        value={newDriver.cuadrilla}
                                        onChange={e => setNewDriver({ ...newDriver, cuadrilla: e.target.value })}
                                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Rol en Brigada</label>
                                    <select
                                        value={newDriver.brigade_role}
                                        onChange={e => setNewDriver({ ...newDriver, brigade_role: e.target.value })}
                                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white', boxSizing: 'border-box' }}
                                    >
                                        <option value="driver">Conductor</option>
                                        <option value="technician">Técnico</option>
                                        <option value="helper">Ayudante</option>
                                        <option value="supervisor">Supervisor</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Nº Licencia</label>
                                    <input
                                        placeholder="Número de licencia"
                                        value={newDriver.license_number}
                                        onChange={e => setNewDriver({ ...newDriver, license_number: e.target.value })}
                                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Vence Licencia</label>
                                    <input
                                        type="date"
                                        value={newDriver.license_expiry}
                                        onChange={e => setNewDriver({ ...newDriver, license_expiry: e.target.value })}
                                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                                <button
                                    onClick={() => setShowDriverModal(false)}
                                    style={{ flex: 1, padding: 12, background: 'transparent', border: '1px solid #475569', color: '#94a3b8', borderRadius: 8, cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCreateDriver}
                                    style={{ flex: 1, padding: 12, background: '#4f46e5', border: 'none', color: 'white', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
                                >
                                    Crear Conductor
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FleetManagement;
