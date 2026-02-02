import React, { useState, useEffect } from 'react';
import {
    Users, Calendar, AlertTriangle, Truck, Plus, Search, Filter, RefreshCw,
    X, Check, Clock, MapPin, ChevronDown, ChevronRight, Edit2, Trash2,
    UserCheck, UserX, FileText, Download
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host';

// Tab Button Component
const TabButton = ({ active, icon: Icon, label, count, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${active
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
    >
        <Icon size={18} />
        {label}
        {count !== undefined && (
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${active ? 'bg-white/20' : 'bg-gray-700'
                }`}>
                {count}
            </span>
        )}
    </button>
);

// Status Badge Component
const StatusBadge = ({ status, type = 'roster' }) => {
    const styles = {
        roster: {
            scheduled: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
            active: 'bg-green-500/20 text-green-400 border-green-500/30',
            completed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
            absent: 'bg-red-500/20 text-red-400 border-red-500/30'
        },
        novelty: {
            pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
            approved: 'bg-green-500/20 text-green-400 border-green-500/30',
            rejected: 'bg-red-500/20 text-red-400 border-red-500/30'
        },
        technician: {
            active: 'bg-green-500/20 text-green-400 border-green-500/30',
            inactive: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
            suspended: 'bg-red-500/20 text-red-400 border-red-500/30'
        }
    };
    const labels = {
        scheduled: 'Programado', active: 'Activo', completed: 'Completado', absent: 'Ausente',
        pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado',
        inactive: 'Inactivo', suspended: 'Suspendido'
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs border ${styles[type]?.[status] || 'bg-gray-500/20 text-gray-400'}`}>
            {labels[status] || status}
        </span>
    );
};

// Zone Badge Component
const ZoneBadge = ({ zone }) => {
    const colors = {
        SUR: 'bg-emerald-500/20 text-emerald-400',
        NORTE: 'bg-blue-500/20 text-blue-400',
        CENTRO: 'bg-purple-500/20 text-purple-400'
    };
    return (
        <span className={`px-2 py-1 rounded text-xs font-medium ${colors[zone] || 'bg-gray-500/20 text-gray-400'}`}>
            {zone}
        </span>
    );
};

// Vehicle Mode Badge
const VehicleModeBadge = ({ mode }) => {
    const isPermantent = mode === 'permanent';
    return (
        <span className={`px-2 py-1 rounded text-xs ${isPermantent ? 'bg-amber-500/20 text-amber-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
            {isPermantent ? 'Permanente' : 'Rotación'}
        </span>
    );
};

function WorkforcePanel({ onClose }) {
    const [activeTab, setActiveTab] = useState('roster');
    const [loading, setLoading] = useState(false);

    // Data
    const [roster, setRoster] = useState([]);
    const [technicians, setTechnicians] = useState([]);
    const [novelties, setNovelties] = useState([]);
    const [zones, setZones] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [brigades, setBrigades] = useState([]);

    // Filters
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedZone, setSelectedZone] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Stats
    const [rosterStats, setRosterStats] = useState({ total: 0, active: 0, scheduled: 0, absent: 0 });

    // Modals
    const [showNoveltyModal, setShowNoveltyModal] = useState(false);
    const [showTechnicianModal, setShowTechnicianModal] = useState(false);
    const [selectedTechnician, setSelectedTechnician] = useState(null);

    // Load zones on mount
    useEffect(() => {
        loadZones();
        loadBrigades();
    }, []);

    // Load data when tab or filters change
    useEffect(() => {
        if (activeTab === 'roster') loadRoster();
        else if (activeTab === 'technicians') loadTechnicians();
        else if (activeTab === 'novelties') loadNovelties();
    }, [activeTab, selectedDate, selectedZone]);

    const loadZones = async () => {
        try {
            const res = await fetch(`${API_URL}/api/workforce/zones`);
            const data = await res.json();
            if (data.zones) setZones(data.zones);
        } catch (err) {
            console.error('Error loading zones:', err);
        }
    };

    const loadBrigades = async () => {
        try {
            const res = await fetch(`${API_URL}/api/brigades`);
            const data = await res.json();
            if (data.brigades) setBrigades(data.brigades);
        } catch (err) {
            console.error('Error loading brigades:', err);
        }
    };

    const loadRoster = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ date: selectedDate });
            if (selectedZone) params.append('zone', selectedZone);

            const res = await fetch(`${API_URL}/api/workforce/roster?${params}`);
            const data = await res.json();
            if (data.roster) {
                setRoster(data.roster);
                setRosterStats(data.stats || { total: data.roster.length, active: 0, scheduled: 0, absent: 0 });
            }
        } catch (err) {
            console.error('Error loading roster:', err);
            toast.error('Error cargando roster');
        } finally {
            setLoading(false);
        }
    };

    const loadTechnicians = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (selectedZone) params.append('zone', selectedZone);
            if (searchTerm) params.append('search', searchTerm);

            const res = await fetch(`${API_URL}/api/workforce/technicians?${params}`);
            const data = await res.json();
            if (data.technicians) setTechnicians(data.technicians);
        } catch (err) {
            console.error('Error loading technicians:', err);
            toast.error('Error cargando técnicos');
        } finally {
            setLoading(false);
        }
    };

    const loadNovelties = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/workforce/novelties`);
            const data = await res.json();
            if (data.novelties) setNovelties(data.novelties);
        } catch (err) {
            console.error('Error loading novelties:', err);
            toast.error('Error cargando novedades');
        } finally {
            setLoading(false);
        }
    };

    const generateRoster = async () => {
        try {
            const res = await fetch(`${API_URL}/api/workforce/roster/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: selectedDate, zone: selectedZone || undefined })
            });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message);
                loadRoster();
            } else {
                toast.error(data.error || 'Error generando roster');
            }
        } catch (err) {
            console.error('Error generating roster:', err);
            toast.error('Error generando roster');
        }
    };

    const handleCheckIn = async (rosterId) => {
        try {
            const res = await fetch(`${API_URL}/api/workforce/roster/${rosterId}/check-in`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Check-in registrado');
                loadRoster();
            }
        } catch (err) {
            console.error('Error checking in:', err);
            toast.error('Error en check-in');
        }
    };

    const handleCheckOut = async (rosterId) => {
        try {
            const res = await fetch(`${API_URL}/api/workforce/roster/${rosterId}/check-out`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Check-out registrado');
                loadRoster();
            }
        } catch (err) {
            console.error('Error checking out:', err);
            toast.error('Error en check-out');
        }
    };

    const importTechnicians = async () => {
        try {
            const res = await fetch(`${API_URL}/api/workforce/technicians/import-from-brigades`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message);
                loadTechnicians();
            }
        } catch (err) {
            console.error('Error importing:', err);
            toast.error('Error importando técnicos');
        }
    };

    const approveNovelty = async (noveltyId, status) => {
        try {
            const res = await fetch(`${API_URL}/api/workforce/novelties/${noveltyId}/approve`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`Novedad ${status === 'approved' ? 'aprobada' : 'rechazada'}`);
                loadNovelties();
            }
        } catch (err) {
            console.error('Error approving:', err);
            toast.error('Error procesando novedad');
        }
    };

    // Render roster tab
    const renderRoster = () => (
        <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-5 gap-3">
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-white">{rosterStats.total || roster.length}</div>
                    <div className="text-xs text-gray-400">Total</div>
                </div>
                <div className="bg-blue-500/10 rounded-lg p-3 text-center border border-blue-500/20">
                    <div className="text-2xl font-bold text-blue-400">{rosterStats.scheduled || 0}</div>
                    <div className="text-xs text-blue-400/70">Programados</div>
                </div>
                <div className="bg-green-500/10 rounded-lg p-3 text-center border border-green-500/20">
                    <div className="text-2xl font-bold text-green-400">{rosterStats.active || 0}</div>
                    <div className="text-xs text-green-400/70">Activos</div>
                </div>
                <div className="bg-gray-500/10 rounded-lg p-3 text-center border border-gray-500/20">
                    <div className="text-2xl font-bold text-gray-400">{rosterStats.completed || 0}</div>
                    <div className="text-xs text-gray-400/70">Completados</div>
                </div>
                <div className="bg-red-500/10 rounded-lg p-3 text-center border border-red-500/20">
                    <div className="text-2xl font-bold text-red-400">{rosterStats.absent || 0}</div>
                    <div className="text-xs text-red-400/70">Ausentes</div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
                <button
                    onClick={generateRoster}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    <Plus size={16} />
                    Generar Roster
                </button>
                <button
                    onClick={loadRoster}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Table */}
            <div className="overflow-auto max-h-[400px] rounded-lg border border-gray-700">
                <table className="w-full text-sm">
                    <thead className="bg-gray-800 sticky top-0">
                        <tr className="text-left text-gray-400 text-xs uppercase">
                            <th className="p-3">Técnico</th>
                            <th className="p-3">Brigada</th>
                            <th className="p-3">Zona</th>
                            <th className="p-3">Vehículo</th>
                            <th className="p-3">Movilidad</th>
                            <th className="p-3">Estado</th>
                            <th className="p-3">Hora Entrada</th>
                            <th className="p-3">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {roster.map(entry => (
                            <tr key={entry.id} className="hover:bg-gray-800/50">
                                <td className="p-3">
                                    <div className="font-medium text-white">{entry.technician_name}</div>
                                    <div className="text-xs text-gray-500">{entry.employee_code}</div>
                                </td>
                                <td className="p-3 text-gray-300">{entry.brigade_name || '-'}</td>
                                <td className="p-3"><ZoneBadge zone={entry.technician_zone} /></td>
                                <td className="p-3">
                                    {entry.vehicle_plate ? (
                                        <div className="flex items-center gap-1 text-gray-300">
                                            <Truck size={14} />
                                            {entry.vehicle_plate}
                                        </div>
                                    ) : (
                                        <span className="text-gray-500">-</span>
                                    )}
                                </td>
                                <td className="p-3">
                                    <span className="text-xs text-gray-400">{entry.mobility_type || '-'}</span>
                                </td>
                                <td className="p-3"><StatusBadge status={entry.status} type="roster" /></td>
                                <td className="p-3 text-gray-400">
                                    {entry.actual_start ? new Date(entry.actual_start).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : entry.scheduled_start || '-'}
                                </td>
                                <td className="p-3">
                                    <div className="flex gap-1">
                                        {entry.status === 'scheduled' && (
                                            <button
                                                onClick={() => handleCheckIn(entry.id)}
                                                className="p-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded"
                                                title="Check-in"
                                            >
                                                <UserCheck size={14} />
                                            </button>
                                        )}
                                        {entry.status === 'active' && (
                                            <button
                                                onClick={() => handleCheckOut(entry.id)}
                                                className="p-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded"
                                                title="Check-out"
                                            >
                                                <UserX size={14} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { setSelectedTechnician(entry); setShowNoveltyModal(true); }}
                                            className="p-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded"
                                            title="Registrar Novedad"
                                        >
                                            <AlertTriangle size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {roster.length === 0 && (
                            <tr>
                                <td colSpan="8" className="p-8 text-center text-gray-500">
                                    No hay registros para esta fecha. Haz clic en "Generar Roster" para crear el roster del día.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    // Render technicians tab
    const renderTechnicians = () => (
        <div className="space-y-4">
            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-[200px] relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, código..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadTechnicians()}
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                    />
                </div>
                <button
                    onClick={importTechnicians}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    <Download size={16} />
                    Importar de Brigadas
                </button>
                <button
                    onClick={() => { setSelectedTechnician(null); setShowTechnicianModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    <Plus size={16} />
                    Nuevo Técnico
                </button>
            </div>

            {/* Table */}
            <div className="overflow-auto max-h-[400px] rounded-lg border border-gray-700">
                <table className="w-full text-sm">
                    <thead className="bg-gray-800 sticky top-0">
                        <tr className="text-left text-gray-400 text-xs uppercase">
                            <th className="p-3">Código</th>
                            <th className="p-3">Nombre</th>
                            <th className="p-3">Documento</th>
                            <th className="p-3">Brigada</th>
                            <th className="p-3">Rol</th>
                            <th className="p-3">Zona</th>
                            <th className="p-3">Modo Vehículo</th>
                            <th className="p-3">Vehículo</th>
                            <th className="p-3">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {technicians.map(tech => (
                            <tr key={tech.id} className="hover:bg-gray-800/50">
                                <td className="p-3 text-gray-300 font-mono text-xs">{tech.employee_code || '-'}</td>
                                <td className="p-3">
                                    <div className="font-medium text-white">{tech.full_name}</div>
                                    <div className="text-xs text-gray-500">{tech.phone}</div>
                                </td>
                                <td className="p-3 text-gray-400">{tech.document_id || '-'}</td>
                                <td className="p-3 text-gray-300">{tech.brigade_name || '-'}</td>
                                <td className="p-3">
                                    <span className={`px-2 py-1 rounded text-xs ${tech.brigade_role === 'titular' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-600/50 text-gray-400'
                                        }`}>
                                        {tech.brigade_role || 'auxiliar'}
                                    </span>
                                </td>
                                <td className="p-3"><ZoneBadge zone={tech.zone} /></td>
                                <td className="p-3"><VehicleModeBadge mode={tech.vehicle_assignment_mode} /></td>
                                <td className="p-3 text-gray-300">{tech.vehicle_plate || '-'}</td>
                                <td className="p-3"><StatusBadge status={tech.employment_status} type="technician" /></td>
                            </tr>
                        ))}
                        {technicians.length === 0 && (
                            <tr>
                                <td colSpan="9" className="p-8 text-center text-gray-500">
                                    No hay técnicos registrados. Usa "Importar de Brigadas" para cargar técnicos existentes.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    // Render novelties tab
    const renderNovelties = () => (
        <div className="space-y-4">
            {/* Actions */}
            <div className="flex gap-2">
                <button
                    onClick={() => { setSelectedTechnician(null); setShowNoveltyModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    <Plus size={16} />
                    Nueva Novedad
                </button>
                <button
                    onClick={loadNovelties}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Table */}
            <div className="overflow-auto max-h-[400px] rounded-lg border border-gray-700">
                <table className="w-full text-sm">
                    <thead className="bg-gray-800 sticky top-0">
                        <tr className="text-left text-gray-400 text-xs uppercase">
                            <th className="p-3">Técnico</th>
                            <th className="p-3">Tipo</th>
                            <th className="p-3">Motivo</th>
                            <th className="p-3">Desde</th>
                            <th className="p-3">Hasta</th>
                            <th className="p-3">Estado</th>
                            <th className="p-3">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {novelties.map(nov => (
                            <tr key={nov.id} className="hover:bg-gray-800/50">
                                <td className="p-3">
                                    <div className="font-medium text-white">{nov.technician_name}</div>
                                    <div className="text-xs text-gray-500">{nov.employee_code}</div>
                                </td>
                                <td className="p-3">
                                    <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs">
                                        {nov.novelty_type}
                                    </span>
                                </td>
                                <td className="p-3 text-gray-300 max-w-[200px] truncate">{nov.reason || '-'}</td>
                                <td className="p-3 text-gray-400">{nov.start_date}</td>
                                <td className="p-3 text-gray-400">{nov.end_date || 'Mismo día'}</td>
                                <td className="p-3"><StatusBadge status={nov.status} type="novelty" /></td>
                                <td className="p-3">
                                    {nov.status === 'pending' && (
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => approveNovelty(nov.id, 'approved')}
                                                className="p-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded"
                                                title="Aprobar"
                                            >
                                                <Check size={14} />
                                            </button>
                                            <button
                                                onClick={() => approveNovelty(nov.id, 'rejected')}
                                                className="p-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded"
                                                title="Rechazar"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {novelties.length === 0 && (
                            <tr>
                                <td colSpan="7" className="p-8 text-center text-gray-500">
                                    No hay novedades registradas.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    // Render zones tab
    const renderZones = () => (
        <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
                {zones.map(zone => (
                    <div key={zone.zone_code} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-semibold text-white">{zone.zone_name}</h3>
                            <ZoneBadge zone={zone.zone_code} />
                        </div>
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-gray-400">Modo Vehículos:</span>
                                <VehicleModeBadge mode={zone.vehicle_assignment_mode} />
                            </div>
                            <div className="text-gray-500 text-xs mt-2">{zone.description}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="bg-gray-900/95 backdrop-blur-sm rounded-xl border border-gray-700 flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-700">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                            <Users size={20} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">Gestión de Personal</h2>
                            <p className="text-xs text-gray-400">Roster diario, técnicos y novedades</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>

                {/* Filters Row */}
                <div className="flex flex-wrap gap-3 mb-4">
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                    <select
                        value={selectedZone}
                        onChange={(e) => setSelectedZone(e.target.value)}
                        className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                        <option value="">Todas las Zonas</option>
                        {zones.map(z => (
                            <option key={z.zone_code} value={z.zone_code}>{z.zone_name}</option>
                        ))}
                    </select>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 flex-wrap">
                    <TabButton
                        active={activeTab === 'roster'}
                        icon={Calendar}
                        label="Roster del Día"
                        count={roster.length}
                        onClick={() => setActiveTab('roster')}
                    />
                    <TabButton
                        active={activeTab === 'technicians'}
                        icon={Users}
                        label="Técnicos"
                        count={technicians.length}
                        onClick={() => setActiveTab('technicians')}
                    />
                    <TabButton
                        active={activeTab === 'novelties'}
                        icon={AlertTriangle}
                        label="Novedades"
                        count={novelties.length}
                        onClick={() => setActiveTab('novelties')}
                    />
                    <TabButton
                        active={activeTab === 'zones'}
                        icon={MapPin}
                        label="Zonas"
                        onClick={() => setActiveTab('zones')}
                    />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 p-4 overflow-auto">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
                    </div>
                ) : (
                    <>
                        {activeTab === 'roster' && renderRoster()}
                        {activeTab === 'technicians' && renderTechnicians()}
                        {activeTab === 'novelties' && renderNovelties()}
                        {activeTab === 'zones' && renderZones()}
                    </>
                )}
            </div>

            {/* Novelty Modal */}
            {showNoveltyModal && (
                <NoveltyModal
                    technician={selectedTechnician}
                    technicians={technicians}
                    onClose={() => setShowNoveltyModal(false)}
                    onSave={() => { loadNovelties(); loadRoster(); setShowNoveltyModal(false); }}
                />
            )}
        </div>
    );
}

// Novelty Modal Component
function NoveltyModal({ technician, technicians, onClose, onSave }) {
    const [form, setForm] = useState({
        technician_id: technician?.technician_id || '',
        novelty_type: 'incapacidad',
        reason: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: ''
    });
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.technician_id) {
            toast.error('Selecciona un técnico');
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch(`${API_URL}/api/workforce/novelties`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Novedad registrada');
                onSave();
            } else {
                toast.error(data.error || 'Error registrando novedad');
            }
        } catch (err) {
            console.error('Error:', err);
            toast.error('Error registrando novedad');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Registrar Novedad</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Técnico</label>
                        <select
                            value={form.technician_id}
                            onChange={(e) => setForm({ ...form, technician_id: e.target.value })}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                            disabled={!!technician}
                        >
                            <option value="">Seleccionar...</option>
                            {technicians.map(t => (
                                <option key={t.id} value={t.id}>{t.full_name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Tipo de Novedad</label>
                        <select
                            value={form.novelty_type}
                            onChange={(e) => setForm({ ...form, novelty_type: e.target.value })}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                        >
                            <option value="incapacidad">Incapacidad</option>
                            <option value="vacaciones">Vacaciones</option>
                            <option value="permiso">Permiso</option>
                            <option value="falta">Falta</option>
                            <option value="suspension">Suspensión</option>
                            <option value="otro">Otro</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Motivo</label>
                        <textarea
                            value={form.reason}
                            onChange={(e) => setForm({ ...form, reason: e.target.value })}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white resize-none"
                            rows={2}
                            placeholder="Describe el motivo..."
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Desde</label>
                            <input
                                type="date"
                                value={form.start_date}
                                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Hasta (opcional)</label>
                            <input
                                type="date"
                                value={form.end_date}
                                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                            />
                        </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
                        >
                            {submitting ? 'Guardando...' : 'Guardar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default WorkforcePanel;
