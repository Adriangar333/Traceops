import React, { useState } from 'react';
import { Truck, Activity, Tool, AlertTriangle, Plus, Search, Filter } from 'lucide-react';

const FleetManagement = () => {
    const [vehicles, setVehicles] = useState([
        { id: 'V-001', plate: 'ABC-123', driver: 'Juan Pérez', type: 'Camión 3.5T', status: 'available', lastMaintenance: '2023-11-15' },
        { id: 'V-002', plate: 'XYZ-789', driver: 'Carlos Ruiz', type: 'Van', status: 'maintenance', lastMaintenance: '2023-10-20' },
        { id: 'V-003', plate: 'DEF-456', driver: 'Maria Lopez', type: 'Moto', status: 'busy', lastMaintenance: '2023-12-01' },
        { id: 'V-004', plate: 'GHI-101', driver: 'Pedro Gomez', type: 'Camión 5T', status: 'available', lastMaintenance: '2023-09-10' },
        { id: 'V-005', plate: 'JKL-202', driver: 'Ana Torres', type: 'Van', status: 'busy', lastMaintenance: '2023-11-28' },
    ]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'available': return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' };
            case 'busy': return { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa' };
            case 'maintenance': return { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' };
            default: return { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8' };
        }
    };

    const getStatusText = (status) => {
        switch (status) {
            case 'available': return 'Disponible';
            case 'busy': return 'En Ruta';
            case 'maintenance': return 'Mantenimiento';
            default: return status;
        }
    };

    return (
        <div style={{ padding: '24px 32px', height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Administración Vehicular</h1>
                    <p style={{ color: '#64748b', marginTop: 4 }}>Gestión de flota y conductores</p>
                </div>
                <button style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: '#10b981', color: 'white',
                    border: 'none', padding: '10px 16px', borderRadius: 8,
                    fontWeight: 600, cursor: 'pointer'
                }}>
                    <Plus size={18} /> Nuevo Vehículo
                </button>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
                <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                            <p style={{ margin: 0, color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>Total Flota</p>
                            <h3 style={{ margin: '4px 0 0', fontSize: 24, color: '#f1f5f9' }}>{vehicles.length}</h3>
                        </div>
                        <div style={{ padding: 8, background: 'rgba(59, 130, 246, 0.1)', borderRadius: 8 }}><Truck size={20} color="#3b82f6" /></div>
                    </div>
                </div>
                <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                            <p style={{ margin: 0, color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>En Ruta</p>
                            <h3 style={{ margin: '4px 0 0', fontSize: 24, color: '#f1f5f9' }}>{vehicles.filter(v => v.status === 'busy').length}</h3>
                        </div>
                        <div style={{ padding: 8, background: 'rgba(16, 185, 129, 0.1)', borderRadius: 8 }}><Activity size={20} color="#10b981" /></div>
                    </div>
                </div>
                <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                            <p style={{ margin: 0, color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>Mantenimiento</p>
                            <h3 style={{ margin: '4px 0 0', fontSize: 24, color: '#f1f5f9' }}>{vehicles.filter(v => v.status === 'maintenance').length}</h3>
                        </div>
                        <div style={{ padding: 8, background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8 }}><Tool size={20} color="#ef4444" /></div>
                    </div>
                </div>
                <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                            <p style={{ margin: 0, color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>Alertas</p>
                            <h3 style={{ margin: '4px 0 0', fontSize: 24, color: '#f1f5f9' }}>2</h3>
                        </div>
                        <div style={{ padding: 8, background: 'rgba(245, 158, 11, 0.1)', borderRadius: 8 }}><AlertTriangle size={20} color="#f59e0b" /></div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
                    <Search size={16} color="#64748b" style={{ position: 'absolute', left: 12, top: 12 }} />
                    <input
                        placeholder="Buscar placa, conductor..."
                        style={{
                            width: '100%', padding: '10px 12px 10px 36px',
                            background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 8, color: '#f1f5f9', outline: 'none'
                        }}
                    />
                </div>
                <button style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#94a3b8', padding: '0 16px', borderRadius: 8, cursor: 'pointer'
                }}>
                    <Filter size={16} /> Filtros
                </button>
            </div>

            {/* Table */}
            <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
                        <tr>
                            <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Placa</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Conductor</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Tipo</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Estado</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Último Mant.</th>
                            <th style={{ padding: '12px 16px', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {vehicles.map((vehicle, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '14px 16px', color: '#f1f5f9', fontWeight: 500 }}>{vehicle.plate}</td>
                                <td style={{ padding: '14px 16px', color: '#cbd5e1' }}>{vehicle.driver}</td>
                                <td style={{ padding: '14px 16px', color: '#cbd5e1' }}>{vehicle.type}</td>
                                <td style={{ padding: '14px 16px' }}>
                                    <span style={{
                                        ...getStatusColor(vehicle.status),
                                        padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600
                                    }}>
                                        {getStatusText(vehicle.status)}
                                    </span>
                                </td>
                                <td style={{ padding: '14px 16px', color: '#94a3b8' }}>{vehicle.lastMaintenance}</td>
                                <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                    <button style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 500 }}>Editar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default FleetManagement;
