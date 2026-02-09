import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Users, Upload, Download, Save, X, Edit2, Search, RefreshCw, Calendar, Check } from 'lucide-react';
import { toast, Toaster } from 'sonner';

const API_BASE = import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host/api';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_NAMES_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const DEFAULT_SCHEDULE = [
    { day_of_week: 1, start_time: '08:00', end_time: '17:00', is_active: true },
    { day_of_week: 2, start_time: '08:00', end_time: '17:00', is_active: true },
    { day_of_week: 3, start_time: '08:00', end_time: '17:00', is_active: true },
    { day_of_week: 4, start_time: '08:00', end_time: '17:00', is_active: true },
    { day_of_week: 5, start_time: '08:00', end_time: '17:00', is_active: true },
    { day_of_week: 6, start_time: '', end_time: '', is_active: false },
    { day_of_week: 0, start_time: '', end_time: '', is_active: false },
];

export default function ScheduleManager({ onClose }) {
    const [drivers, setDrivers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingDriver, setEditingDriver] = useState(null);
    const [editSchedule, setEditSchedule] = useState([]);
    const [saving, setSaving] = useState(false);

    // Fetch drivers with schedules
    const fetchDrivers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/schedules/drivers`);
            const data = await res.json();
            setDrivers(data.drivers || []);
        } catch (err) {
            console.error('Error fetching drivers:', err);
            toast.error('Error al cargar técnicos');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDrivers();
    }, [fetchDrivers]);

    // Filter drivers by search
    const filteredDrivers = drivers.filter(d =>
        d.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.cuadrilla?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Start editing a driver
    const startEditing = (driver) => {
        setEditingDriver(driver);
        // Build full 7-day schedule from existing or defaults
        const fullSchedule = [];
        for (let day = 0; day < 7; day++) {
            const existing = driver.schedules?.find(s => s.day_of_week === day);
            if (existing) {
                fullSchedule.push({ ...existing });
            } else {
                const defaultDay = DEFAULT_SCHEDULE.find(d => d.day_of_week === day);
                fullSchedule.push({ ...defaultDay });
            }
        }
        setEditSchedule(fullSchedule);
    };

    // Save schedule
    const saveSchedule = async () => {
        if (!editingDriver) return;
        setSaving(true);
        try {
            const res = await fetch(`${API_BASE}/schedules/${editingDriver.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ schedules: editSchedule.filter(s => s.is_active) })
            });
            if (res.ok) {
                toast.success('✅ Horario guardado');
                setEditingDriver(null);
                fetchDrivers();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Error al guardar');
            }
        } catch (err) {
            toast.error('Error de conexión');
        } finally {
            setSaving(false);
        }
    };

    // Update a day in edit mode
    const updateDay = (dayOfWeek, field, value) => {
        setEditSchedule(prev => prev.map(s =>
            s.day_of_week === dayOfWeek ? { ...s, [field]: value } : s
        ));
    };

    // Excel upload
    const handleExcelUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`${API_BASE}/schedules/bulk`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`✅ ${data.processed} técnicos procesados`);
                if (data.errors?.length > 0) {
                    toast.warning(`⚠️ ${data.errors.length} errores`);
                }
                fetchDrivers();
            } else {
                toast.error(data.error || 'Error en carga');
            }
        } catch (err) {
            toast.error('Error al cargar archivo');
        }
        e.target.value = '';
    };

    // Download template
    const downloadTemplate = () => {
        window.open(`${API_BASE}/schedules/template`, '_blank');
    };

    // Format time display
    const formatTime = (time) => {
        if (!time) return '—';
        return time.slice(0, 5);
    };

    // Get schedule display for a driver
    const getScheduleDisplay = (driver) => {
        if (!driver.schedules || driver.schedules.length === 0) {
            return <span style={{ color: '#64748b', fontStyle: 'italic' }}>Sin horario configurado</span>;
        }
        return (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5, 6, 0].map(day => {
                    const s = driver.schedules.find(sc => sc.day_of_week === day);
                    const isActive = s && s.is_active;
                    return (
                        <div
                            key={day}
                            style={{
                                padding: '4px 8px',
                                borderRadius: 6,
                                fontSize: '0.75rem',
                                background: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                                color: isActive ? '#10b981' : '#475569',
                                fontWeight: 500
                            }}
                        >
                            {DAY_NAMES[day]}: {isActive ? `${formatTime(s.start_time)}-${formatTime(s.end_time)}` : '—'}
                        </div>
                    );
                })}
            </div>
        );
    };

    const styles = {
        container: {
            background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
            minHeight: '100vh',
            color: '#f1f5f9',
            fontFamily: 'Inter, system-ui, sans-serif'
        },
        header: {
            padding: '20px 24px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        },
        title: {
            fontSize: '1.5rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 12
        },
        closeBtn: {
            background: 'rgba(239, 68, 68, 0.1)',
            border: 'none',
            borderRadius: 8,
            padding: 8,
            cursor: 'pointer',
            color: '#ef4444'
        },
        toolbar: {
            display: 'flex',
            gap: 12,
            padding: '16px 24px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
            flexWrap: 'wrap',
            alignItems: 'center'
        },
        searchBox: {
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(148, 163, 184, 0.1)',
            borderRadius: 10,
            padding: '10px 14px',
            flex: 1,
            maxWidth: 300
        },
        searchInput: {
            background: 'transparent',
            border: 'none',
            color: '#f1f5f9',
            fontSize: '0.875rem',
            outline: 'none',
            flex: 1
        },
        btn: {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: 10,
            border: '1px solid rgba(148, 163, 184, 0.2)',
            background: 'rgba(148, 163, 184, 0.05)',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '0.875rem',
            transition: 'all 0.2s'
        },
        primaryBtn: {
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            border: 'none',
            color: 'white'
        },
        content: {
            padding: '24px'
        },
        driverCard: {
            background: 'rgba(148, 163, 184, 0.05)',
            borderRadius: 16,
            padding: 20,
            border: '1px solid rgba(148, 163, 184, 0.1)',
            marginBottom: 12
        },
        modal: {
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20
        },
        modalContent: {
            background: '#1e293b',
            borderRadius: 20,
            padding: 24,
            maxWidth: 600,
            width: '100%',
            maxHeight: '80vh',
            overflowY: 'auto'
        },
        dayRow: {
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 0',
            borderBottom: '1px solid rgba(148, 163, 184, 0.1)'
        },
        timeInput: {
            background: 'rgba(148, 163, 184, 0.1)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: 8,
            padding: '8px 12px',
            color: '#f1f5f9',
            fontSize: '0.875rem',
            width: 90
        },
        checkbox: {
            width: 20,
            height: 20,
            accentColor: '#10b981'
        }
    };

    return (
        <div style={styles.container}>
            <Toaster position="top-center" richColors />

            {/* Header */}
            <div style={styles.header}>
                <div style={styles.title}>
                    <div style={{
                        width: 44, height: 44,
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                        borderRadius: 12,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Clock size={24} color="white" />
                    </div>
                    Gestión de Jornadas
                </div>
                {onClose && (
                    <button style={styles.closeBtn} onClick={onClose}>
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* Toolbar */}
            <div style={styles.toolbar}>
                <div style={styles.searchBox}>
                    <Search size={18} color="#64748b" />
                    <input
                        style={styles.searchInput}
                        placeholder="Buscar técnico..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <button style={styles.btn} onClick={fetchDrivers}>
                    <RefreshCw size={16} className={loading ? 'spin' : ''} />
                    Actualizar
                </button>
                <button style={styles.btn} onClick={downloadTemplate}>
                    <Download size={16} />
                    Plantilla Excel
                </button>
                <label style={{ ...styles.btn, ...styles.primaryBtn }}>
                    <Upload size={16} />
                    Cargar Excel
                    <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} style={{ display: 'none' }} />
                </label>
            </div>

            {/* Content */}
            <div style={styles.content}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                        ⏳ Cargando técnicos...
                    </div>
                ) : filteredDrivers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                        <Users size={48} color="#64748b" style={{ marginBottom: 16, opacity: 0.5 }} />
                        <p style={{ color: '#64748b' }}>No hay técnicos registrados</p>
                    </div>
                ) : (
                    filteredDrivers.map(driver => (
                        <div key={driver.id} style={styles.driverCard}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                <div>
                                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>{driver.name}</span>
                                    {driver.cuadrilla && (
                                        <span style={{
                                            marginLeft: 10,
                                            padding: '2px 8px',
                                            background: 'rgba(59, 130, 246, 0.15)',
                                            color: '#3b82f6',
                                            borderRadius: 6,
                                            fontSize: '0.75rem'
                                        }}>
                                            {driver.cuadrilla}
                                        </span>
                                    )}
                                </div>
                                <button
                                    style={{ ...styles.btn, padding: '6px 12px' }}
                                    onClick={() => startEditing(driver)}
                                >
                                    <Edit2 size={14} />
                                    Editar
                                </button>
                            </div>
                            {getScheduleDisplay(driver)}
                        </div>
                    ))
                )}
            </div>

            {/* Edit Modal */}
            {editingDriver && (
                <div style={styles.modal} onClick={() => setEditingDriver(null)}>
                    <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                            <h3 style={{ margin: 0 }}>
                                <Calendar size={20} style={{ marginRight: 10, verticalAlign: 'middle' }} />
                                Horario de {editingDriver.name}
                            </h3>
                            <button
                                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                                onClick={() => setEditingDriver(null)}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Day rows - ordered Mon-Sun */}
                        {[1, 2, 3, 4, 5, 6, 0].map(day => {
                            const schedule = editSchedule.find(s => s.day_of_week === day) || {};
                            return (
                                <div key={day} style={styles.dayRow}>
                                    <input
                                        type="checkbox"
                                        style={styles.checkbox}
                                        checked={schedule.is_active || false}
                                        onChange={e => updateDay(day, 'is_active', e.target.checked)}
                                    />
                                    <span style={{ width: 90, fontWeight: 500 }}>{DAY_NAMES_FULL[day]}</span>
                                    <input
                                        type="time"
                                        style={styles.timeInput}
                                        value={schedule.start_time || ''}
                                        onChange={e => updateDay(day, 'start_time', e.target.value)}
                                        disabled={!schedule.is_active}
                                    />
                                    <span style={{ color: '#64748b' }}>a</span>
                                    <input
                                        type="time"
                                        style={styles.timeInput}
                                        value={schedule.end_time || ''}
                                        onChange={e => updateDay(day, 'end_time', e.target.value)}
                                        disabled={!schedule.is_active}
                                    />
                                </div>
                            );
                        })}

                        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                            <button
                                style={{ ...styles.btn, flex: 1 }}
                                onClick={() => setEditingDriver(null)}
                            >
                                Cancelar
                            </button>
                            <button
                                style={{ ...styles.btn, ...styles.primaryBtn, flex: 1 }}
                                onClick={saveSchedule}
                                disabled={saving}
                            >
                                {saving ? 'Guardando...' : (
                                    <>
                                        <Save size={16} />
                                        Guardar
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
