import React, { useState, useEffect } from 'react';
import {
    Users, Calendar, Clock, Save, Search,
    ChevronLeft, ChevronRight, CheckCircle, XCircle
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const DAYS = [
    { id: 1, name: 'Lunes' },
    { id: 2, name: 'Martes' },
    { id: 3, name: 'Miércoles' },
    { id: 4, name: 'Jueves' },
    { id: 5, name: 'Viernes' },
    { id: 6, name: 'Sábado' },
    { id: 0, name: 'Domingo' }
];

const ScheduleManagement = () => {
    const [drivers, setDrivers] = useState([]);
    const [selectedDriver, setSelectedDriver] = useState(null);
    const [schedules, setSchedules] = useState({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Fetch Drivers
    useEffect(() => {
        fetchDrivers();
    }, []);

    const fetchDrivers = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/api/drivers`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setDrivers(data);
            }
        } catch (error) {
            console.error('Error fetching drivers:', error);
            toast.error('Error al cargar técnicos');
        }
    };

    // Fetch Schedules when Driver Selected
    useEffect(() => {
        if (selectedDriver) {
            fetchSchedules(selectedDriver.id);
        }
    }, [selectedDriver]);

    const fetchSchedules = async (driverId) => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/api/schedules?technician_id=${driverId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                // Convert array to object keyed by day_of_week
                const scheduleMap = {};
                DAYS.forEach(day => {
                    scheduleMap[day.id] = {
                        day_of_week: day.id,
                        start_time: '07:00',
                        end_time: '17:00',
                        is_active: true // default
                    };
                });

                data.schedules.forEach(s => {
                    scheduleMap[s.day_of_week] = {
                        ...s,
                        start_time: s.start_time.slice(0, 5), // HH:MM
                        end_time: s.end_time.slice(0, 5)
                    };
                });
                setSchedules(scheduleMap);
            }
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar horarios');
        } finally {
            setLoading(false);
        }
    };

    const handleScheduleChange = (dayId, field, value) => {
        setSchedules(prev => ({
            ...prev,
            [dayId]: {
                ...prev[dayId],
                [field]: value
            }
        }));
    };

    const saveSchedules = async () => {
        if (!selectedDriver) return;
        setSaving(true);

        // Prepare payload
        const payload = Object.values(schedules).map(s => ({
            technician_id: selectedDriver.id,
            day_of_week: s.day_of_week,
            start_time: s.start_time,
            end_time: s.end_time,
            is_active: s.is_active
        }));

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/api/schedules/bulk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ schedules: payload })
            });

            if (response.ok) {
                toast.success('Horarios guardados correctamente');
            } else {
                throw new Error('Failed to save');
            }
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar horarios');
        } finally {
            setSaving(false);
        }
    };

    const filteredDrivers = drivers.filter(d =>
        d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.cuadrilla && d.cuadrilla.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div style={{ padding: '20px 40px', maxWidth: 1200, margin: '0 auto' }}>
            <header style={{ marginBottom: 30 }}>
                <h1 style={{ color: '#f8fafc', fontSize: 28, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Calendar size={32} color="#3b82f6" />
                    Gestión de Jornadas
                </h1>
                <p style={{ color: '#94a3b8', marginTop: 8 }}>Configura los horarios laborales de técnicos y brigadas.</p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 30 }}>

                {/* Sidebar: List of Drivers */}
                <div style={{ background: '#1e293b', borderRadius: 16, border: '1px solid #334155', padding: 20, height: 'fit-content' }}>
                    <div style={{ marginBottom: 15, position: 'relative' }}>
                        <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: 12, top: 12 }} />
                        <input
                            type="text"
                            placeholder="Buscar técnico..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                background: '#0f172a',
                                border: '1px solid #334155',
                                borderRadius: 8,
                                padding: '10px 10px 10px 38px',
                                color: '#fff',
                                outline: 'none'
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 600, overflowY: 'auto' }}>
                        {filteredDrivers.map(driver => (
                            <button
                                key={driver.id}
                                onClick={() => setSelectedDriver(driver)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: 12,
                                    background: selectedDriver?.id === driver.id ? '#3b82f6' : 'transparent',
                                    border: 'none',
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'all 0.2s',
                                    color: selectedDriver?.id === driver.id ? '#fff' : '#cbd5e1'
                                }}
                            >
                                <div style={{
                                    width: 36, height: 36, borderRadius: '50%',
                                    background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 600, color: '#fff', fontSize: 14
                                }}>
                                    {driver.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 500 }}>{driver.name}</div>
                                    <div style={{ fontSize: 12, opacity: 0.7 }}>{driver.cuadrilla || 'Sin Brigada'}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content: Schedule Editor */}
                <div style={{ background: '#1e293b', borderRadius: 16, border: '1px solid #334155', padding: 30 }}>
                    {!selectedDriver ? (
                        <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
                            <Users size={48} style={{ marginBottom: 20, opacity: 0.5 }} />
                            <h3>Selecciona un técnico para gestionar su horario</h3>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
                                <div>
                                    <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 600 }}>{selectedDriver.name}</h2>
                                    <span style={{ color: '#94a3b8' }}>Configuración Semanal</span>
                                </div>
                                <button
                                    onClick={saveSchedules}
                                    disabled={saving}
                                    style={{
                                        background: '#10b981', color: '#fff', border: 'none',
                                        padding: '10px 24px', borderRadius: 8, fontWeight: 600,
                                        cursor: saving ? 'wait' : 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        opacity: saving ? 0.7 : 1
                                    }}
                                >
                                    <Save size={18} />
                                    {saving ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>

                            {loading ? (
                                <div style={{ color: '#fff' }}>Cargando...</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {DAYS.map(day => {
                                        const schedule = schedules[day.id] || { is_active: true, start_time: '07:00', end_time: '17:00' };
                                        return (
                                            <div key={day.id} style={{
                                                display: 'grid', gridTemplateColumns: '150px 1fr 1fr 100px', gap: 20,
                                                alignItems: 'center',
                                                background: '#0f172a',
                                                padding: '16px 20px',
                                                borderRadius: 12,
                                                border: '1px solid #334155',
                                                opacity: schedule.is_active ? 1 : 0.5
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    <div style={{
                                                        width: 10, height: 10, borderRadius: '50%',
                                                        background: schedule.is_active ? '#10b981' : '#64748b'
                                                    }} />
                                                    <span style={{ color: '#fff', fontWeight: 500 }}>{day.name}</span>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <Clock size={16} color="#94a3b8" />
                                                    <input
                                                        type="time"
                                                        value={schedule.start_time}
                                                        disabled={!schedule.is_active}
                                                        onChange={(e) => handleScheduleChange(day.id, 'start_time', e.target.value)}
                                                        style={{
                                                            background: 'transparent', border: '1px solid #334155',
                                                            color: '#fff', padding: '6px 12px', borderRadius: 6
                                                        }}
                                                    />
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <span style={{ color: '#64748b' }}>Hasta</span>
                                                    <input
                                                        type="time"
                                                        value={schedule.end_time}
                                                        disabled={!schedule.is_active}
                                                        onChange={(e) => handleScheduleChange(day.id, 'end_time', e.target.value)}
                                                        style={{
                                                            background: 'transparent', border: '1px solid #334155',
                                                            color: '#fff', padding: '6px 12px', borderRadius: 6
                                                        }}
                                                    />
                                                </div>

                                                <button
                                                    onClick={() => handleScheduleChange(day.id, 'is_active', !schedule.is_active)}
                                                    style={{
                                                        background: schedule.is_active ? '#ef444420' : '#10b98120',
                                                        color: schedule.is_active ? '#ef4444' : '#10b981',
                                                        border: 'none', padding: '6px 12px', borderRadius: 6,
                                                        cursor: 'pointer', fontWeight: 600, fontSize: 13
                                                    }}
                                                >
                                                    {schedule.is_active ? 'Descanso' : 'Activar'}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ScheduleManagement;
