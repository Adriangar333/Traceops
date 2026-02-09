/**
 * SettingsPanel.jsx
 * Comprehensive configuration module for SCR operations
 * Based on CRITERIOS_TECNICOS_SCR_RESUMEN.md
 */
import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

// ============================================
// DEFAULT CONFIGURATION VALUES
// From CRITERIOS_TECNICOS_SCR_RESUMEN.md
// ============================================

const DEFAULT_OS_TYPES = [
    { code: 'TO501', name: 'SUSPENSIÓN DEL SERVICIO MD', description: 'Suspensión en Media/Baja tensión. Incluye: Tendido, Retiro de acometida, Destrucción de acometida', priority: 3 },
    { code: 'TO502', name: 'RECONEXIÓN SERVICIO MD', description: 'Reconexión del servicio. Puede requerir canasta o minicanasta si es a mitad de tramo', priority: 1 },
    { code: 'TO503', name: 'REVISIÓN DE SUSPENSIÓN MD', description: 'Aplicable en Bornera, Tendido, BT, BT con retiro de acometida o MT', priority: 2 },
    { code: 'TO504', name: 'SUSPENSIÓN DEL SERVICIO MI/MS', description: 'Suspensión en Media Tensión Industrial. Requiere Canasta o Disponibilidad', priority: 4 },
    { code: 'TO506', name: 'REVISIÓN DE SUSPENSIÓN MI/MS', description: 'Específicamente para Media Tensión', priority: 5 },
];

const DEFAULT_ALCANCES = [
    { code: 'B', name: 'Bornera', description: 'Suspensión/reconexión en bornera del medidor' },
    { code: 'T', name: 'Tendido', description: 'Suspensión/reconexión en el tendido eléctrico' },
    { code: 'N', name: 'Minicanasta', description: 'Requiere vehículo con mini canasta elevadora' },
    { code: 'C', name: 'Canasta', description: 'Requiere vehículo con canasta elevadora completa' },
    { code: 'M', name: 'Multifamiliar', description: 'Edificios o conjuntos residenciales' },
    { code: 'W', name: 'MT AT', description: 'Media Tensión / Alta Tensión' },
    { code: 'E', name: 'Elite', description: 'Mercados especiales (clientes prioritarios)' },
    { code: 'X', name: 'Tendido Retiro Acometida', description: 'Suspensión con retiro físico de acometida' },
    { code: 'Y', name: 'Destruir Acometida', description: 'Destrucción completa de la acometida' },
    { code: 'D', name: 'Disponible', description: 'Requiere brigada con disponibilidad especial' },
    { code: 'F', name: 'Brigada FOR', description: 'Brigada de fuerza operativa rápida' },
    { code: 'R', name: 'Remoto', description: 'Gestión remota (medidores inteligentes)' },
];

const DEFAULT_BRIGADE_TYPES = [
    { type: 'CANASTA', capacity: 15, technicians: 1, specialty: 'Trabajos en altura con canasta elevadora' },
    { type: 'SCR LIVIANA', capacity: 30, technicians: 14, specialty: 'Suspensiones en bornera (rápidas)' },
    { type: 'SCR MINI CANASTA', capacity: 15, technicians: 1, specialty: 'Trabajos en altura con mini canasta' },
    { type: 'SCR PESADA', capacity: 25, technicians: 27, specialty: 'Suspensiones en tendido, retiros de acometida' },
    { type: 'SCR PESADA DISPONIBILIDAD', capacity: 22, technicians: 5, specialty: 'Zonas rurales, MT/AT, multifamiliares' },
    { type: 'SCR PESADA ELITE', capacity: 22, technicians: 1, specialty: 'Mercados especiales (clientes VIP)' },
];

const DEFAULT_ALCANCE_MATRIX = {
    'B': { urban: 'SCR LIVIANA', rural: 'SCR PESADA DISPONIBILIDAD' },
    'T': { urban: 'SCR PESADA', rural: 'SCR PESADA DISPONIBILIDAD' },
    'N': { urban: 'SCR MINI CANASTA', rural: 'SCR PESADA DISPONIBILIDAD' },
    'C': { urban: 'CANASTA', rural: 'SCR PESADA DISPONIBILIDAD' },
    'M': { urban: 'SCR PESADA DISPONIBILIDAD', rural: 'SCR PESADA DISPONIBILIDAD' },
    'W': { urban: 'SCR PESADA DISPONIBILIDAD', rural: 'SCR PESADA DISPONIBILIDAD' },
    'E': { urban: 'SCR PESADA', rural: 'SCR PESADA' },
    'X': { urban: 'SCR PESADA', rural: 'SCR PESADA DISPONIBILIDAD' },
    'Y': { urban: 'SCR PESADA', rural: 'SCR PESADA DISPONIBILIDAD' },
    'D': { urban: 'SCR PESADA DISPONIBILIDAD', rural: 'SCR PESADA DISPONIBILIDAD' },
    'F': { urban: 'SCR PESADA DISPONIBILIDAD', rural: 'SCR PESADA DISPONIBILIDAD' },
    'R': { urban: 'SCR PESADA DISPONIBILIDAD', rural: 'SCR PESADA DISPONIBILIDAD' },
};

const DEFAULT_TIMES = [
    { operation: 'Reconexión', clientType: '-', minutes: 10 },
    { operation: 'Suspensión Bornera', clientType: 'Cooperativo', minutes: 10 },
    { operation: 'Suspensión Bornera', clientType: 'Agresivo', minutes: 20 },
    { operation: 'Suspensión Tendido', clientType: 'Cooperativo', minutes: 15 },
    { operation: 'Suspensión Tendido', clientType: 'Agresivo', minutes: 30 },
    { operation: 'Suspensión Radical', clientType: 'Cooperativo', minutes: 20 },
    { operation: 'Suspensión Radical', clientType: 'Agresivo', minutes: 35 },
    { operation: 'Multifamiliar', clientType: 'Por usuario', minutes: 20 },
    { operation: 'Cupón de Pago', clientType: 'Doble acción', minutes: 20 },
    { operation: 'Cobros', clientType: '-', minutes: 15 },
];

const DEFAULT_ZONE_PATTERNS = {
    rural: ['CARRETERA', 'VIA ', 'VÍA ', 'KM ', 'KM.', 'KILOMETRO', 'KILÓMETRO', 'VEREDA', 'VDA ', 'VDA.', 'CORREGIMIENTO', 'CORREG ', 'FINCA', 'PARCELA', 'HACIENDA', 'CAMINO', 'TROCHA'],
    urban: ['CL ', 'CL.', 'CALLE', 'CR ', 'CR.', 'CRA ', 'CRA.', 'CARRERA', 'TV ', 'TV.', 'TRANSVERSAL', 'DG ', 'DG.', 'DIAGONAL', 'AV ', 'AV.', 'AVENIDA', 'MZ ', 'MZ.', 'MANZANA', 'URB ', 'URBANIZACION', 'URBANIZACIÓN', 'CONJUNTO', 'EDIFICIO', 'TORRE', 'APTO', 'BARRIO', 'BRR '],
};

const DEFAULT_COSTS = {
    gasoline: { pesada: 2500000, disponibilidad: 3000000 },
    hourly: { pesada: 69724, liviana: 21468 },
    monthly: { pesada: 12271569, liviana: 3778441 },
};

const DEFAULT_SCHEDULE = {
    startHour: 7,
    startMinute: 0,
    endHour: 17,
    endMinute: 0,
    workDays: [1, 2, 3, 4, 5, 6], // Mon-Sat
};

const DEFAULT_SPECIAL_RULES = [
    { id: 1, name: 'Deuda Alta Minicanasta', condition: 'alcance = "N" AND deuda > 1,000,000', action: 'Asignar a CANASTA en lugar de MINI CANASTA', active: true },
    { id: 2, name: 'Elite Mercados Especiales', condition: 'alcance = "E" AND mercado_especial = true', action: 'Asignar a SCR PESADA ELITE', active: true },
];

// ============================================
// STYLES
// ============================================
const styles = {
    container: {
        padding: '30px 40px',
        backgroundColor: '#0f172a',
        minHeight: '100vh',
        color: '#f8fafc',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 30,
    },
    title: {
        fontSize: 28,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },
    subtitle: {
        color: '#94a3b8',
        fontSize: 14,
        marginTop: 4,
    },
    tabs: {
        display: 'flex',
        gap: 4,
        marginBottom: 24,
        overflowX: 'auto',
        paddingBottom: 8,
    },
    tab: (active) => ({
        padding: '10px 18px',
        backgroundColor: active ? '#10b981' : '#1e293b',
        color: active ? '#fff' : '#94a3b8',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        transition: 'all 0.2s',
    }),
    card: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 24,
        marginBottom: 20,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 600,
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 13,
    },
    th: {
        textAlign: 'left',
        padding: '12px 10px',
        backgroundColor: '#0f172a',
        color: '#94a3b8',
        fontWeight: 500,
        borderBottom: '1px solid #334155',
    },
    td: {
        padding: '12px 10px',
        borderBottom: '1px solid #334155',
        color: '#e2e8f0',
    },
    input: {
        backgroundColor: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 6,
        padding: '8px 12px',
        color: '#f8fafc',
        fontSize: 13,
        width: '100%',
        boxSizing: 'border-box',
    },
    inputSmall: {
        backgroundColor: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 6,
        padding: '8px 10px',
        color: '#f8fafc',
        fontSize: 13,
        width: 80,
        textAlign: 'center',
    },
    select: {
        backgroundColor: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 6,
        padding: '8px 12px',
        color: '#f8fafc',
        fontSize: 13,
        cursor: 'pointer',
    },
    button: {
        padding: '10px 20px',
        backgroundColor: '#10b981',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    buttonSecondary: {
        padding: '10px 20px',
        backgroundColor: '#334155',
        color: '#f8fafc',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 500,
    },
    badge: (color) => ({
        padding: '4px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        backgroundColor: color === 'green' ? 'rgba(16,185,129,0.2)' : color === 'yellow' ? 'rgba(234,179,8,0.2)' : color === 'red' ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)',
        color: color === 'green' ? '#10b981' : color === 'yellow' ? '#eab308' : color === 'red' ? '#ef4444' : '#3b82f6',
    }),
    grid2: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 20,
    },
    grid3: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 20,
    },
    formGroup: {
        marginBottom: 16,
    },
    label: {
        display: 'block',
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 6,
        fontWeight: 500,
    },
    infoBox: {
        backgroundColor: 'rgba(59,130,246,0.1)',
        border: '1px solid rgba(59,130,246,0.3)',
        borderRadius: 8,
        padding: 16,
        marginBottom: 20,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
    },
    successMessage: {
        backgroundColor: 'rgba(16,185,129,0.1)',
        border: '1px solid rgba(16,185,129,0.3)',
        borderRadius: 8,
        padding: 12,
        color: '#10b981',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
};

// Tab definitions
const TABS = [
    { id: 'general', label: '⚙️ General', icon: '⚙️' },
    { id: 'os_types', label: '📋 Tipos de OS', icon: '📋' },
    { id: 'alcances', label: '🎯 Alcances', icon: '🎯' },
    { id: 'matrix', label: '🔀 Matriz Brigadas', icon: '🔀' },
    { id: 'capacities', label: '📊 Capacidades', icon: '📊' },
    { id: 'times', label: '⏱️ Tiempos', icon: '⏱️' },
    { id: 'zones', label: '🗺️ Patrones Zona', icon: '🗺️' },
    { id: 'costs', label: '💰 Costos', icon: '💰' },
    { id: 'rules', label: '📌 Reglas Especiales', icon: '📌' },
];

// ============================================
// MAIN COMPONENT
// ============================================
export default function SettingsPanel() {
    const [activeTab, setActiveTab] = useState('general');
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Configuration state
    const [osTypes, setOsTypes] = useState(DEFAULT_OS_TYPES);
    const [alcances, setAlcances] = useState(DEFAULT_ALCANCES);
    const [brigadeTypes, setBrigadeTypes] = useState(DEFAULT_BRIGADE_TYPES);
    const [alcanceMatrix, setAlcanceMatrix] = useState(DEFAULT_ALCANCE_MATRIX);
    const [times, setTimes] = useState(DEFAULT_TIMES);
    const [zonePatterns, setZonePatterns] = useState(DEFAULT_ZONE_PATTERNS);
    const [costs, setCosts] = useState(DEFAULT_COSTS);
    const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
    const [specialRules, setSpecialRules] = useState(DEFAULT_SPECIAL_RULES);
    const [companyName, setCompanyName] = useState('Air-e S.A. E.S.P.');
    const [debtThreshold, setDebtThreshold] = useState(1000000);

    // Load configuration from backend (if exists)
    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        try {
            const res = await fetch('/api/config');
            if (res.ok) {
                const data = await res.json();
                if (data.config) {
                    // Apply saved config over defaults
                    if (data.config.osTypes) setOsTypes(data.config.osTypes);
                    if (data.config.alcances) setAlcances(data.config.alcances);
                    if (data.config.brigadeTypes) setBrigadeTypes(data.config.brigadeTypes);
                    if (data.config.alcanceMatrix) setAlcanceMatrix(data.config.alcanceMatrix);
                    if (data.config.times) setTimes(data.config.times);
                    if (data.config.zonePatterns) setZonePatterns(data.config.zonePatterns);
                    if (data.config.costs) setCosts(data.config.costs);
                    if (data.config.schedule) setSchedule(data.config.schedule);
                    if (data.config.specialRules) setSpecialRules(data.config.specialRules);
                    if (data.config.companyName) setCompanyName(data.config.companyName);
                    if (data.config.debtThreshold) setDebtThreshold(data.config.debtThreshold);
                }
            }
        } catch (err) {
            console.log('Config not found, using defaults');
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const config = {
                osTypes,
                alcances,
                brigadeTypes,
                alcanceMatrix,
                times,
                zonePatterns,
                costs,
                schedule,
                specialRules,
                companyName,
                debtThreshold,
            };

            await fetch('/api/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config }),
            });

            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err) {
            console.error('Error saving config:', err);
        }
        setSaving(false);
    };

    // Update functions for nested state
    const updateOsType = (index, field, value) => {
        const updated = [...osTypes];
        updated[index] = { ...updated[index], [field]: field === 'priority' ? parseInt(value) || 1 : value };
        setOsTypes(updated);
    };

    const updateBrigadeType = (index, field, value) => {
        const updated = [...brigadeTypes];
        updated[index] = { ...updated[index], [field]: field === 'capacity' || field === 'technicians' ? parseInt(value) || 0 : value };
        setBrigadeTypes(updated);
    };

    const updateAlcanceMatrix = (alcance, zone, value) => {
        setAlcanceMatrix(prev => ({
            ...prev,
            [alcance]: { ...prev[alcance], [zone]: value }
        }));
    };

    const updateTime = (index, field, value) => {
        const updated = [...times];
        updated[index] = { ...updated[index], [field]: field === 'minutes' ? parseInt(value) || 0 : value };
        setTimes(updated);
    };

    const updateZonePattern = (type, index, value) => {
        const updated = { ...zonePatterns };
        updated[type] = [...updated[type]];
        updated[type][index] = value;
        setZonePatterns(updated);
    };

    const addZonePattern = (type) => {
        setZonePatterns(prev => ({
            ...prev,
            [type]: [...prev[type], '']
        }));
    };

    const removeZonePattern = (type, index) => {
        setZonePatterns(prev => ({
            ...prev,
            [type]: prev[type].filter((_, i) => i !== index)
        }));
    };

    // ============================================
    // RENDER TABS
    // ============================================
    const renderGeneralTab = () => (
        <div>
            <div style={styles.card}>
                <div style={styles.cardTitle}>🏢 Información de la Empresa</div>
                <div style={styles.grid2}>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Nombre de la Empresa</label>
                        <input
                            type="text"
                            style={styles.input}
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                        />
                    </div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Umbral Deuda Alta (COP)</label>
                        <input
                            type="number"
                            style={styles.input}
                            value={debtThreshold}
                            onChange={(e) => setDebtThreshold(parseInt(e.target.value) || 0)}
                        />
                    </div>
                </div>
            </div>

            <div style={styles.card}>
                <div style={styles.cardTitle}>🕐 Jornada Laboral</div>
                <div style={styles.grid3}>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Hora de Inicio</label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                                type="number"
                                style={styles.inputSmall}
                                value={schedule.startHour}
                                min={0} max={23}
                                onChange={(e) => setSchedule(prev => ({ ...prev, startHour: parseInt(e.target.value) || 0 }))}
                            />
                            <span>:</span>
                            <input
                                type="number"
                                style={styles.inputSmall}
                                value={schedule.startMinute}
                                min={0} max={59}
                                onChange={(e) => setSchedule(prev => ({ ...prev, startMinute: parseInt(e.target.value) || 0 }))}
                            />
                        </div>
                    </div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Hora de Fin</label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                                type="number"
                                style={styles.inputSmall}
                                value={schedule.endHour}
                                min={0} max={23}
                                onChange={(e) => setSchedule(prev => ({ ...prev, endHour: parseInt(e.target.value) || 0 }))}
                            />
                            <span>:</span>
                            <input
                                type="number"
                                style={styles.inputSmall}
                                value={schedule.endMinute}
                                min={0} max={59}
                                onChange={(e) => setSchedule(prev => ({ ...prev, endMinute: parseInt(e.target.value) || 0 }))}
                            />
                        </div>
                    </div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Horas Totales</label>
                        <div style={{
                            backgroundColor: '#0f172a',
                            padding: '10px 14px',
                            borderRadius: 6,
                            color: '#10b981',
                            fontWeight: 600,
                            fontSize: 16
                        }}>
                            {((schedule.endHour * 60 + schedule.endMinute) - (schedule.startHour * 60 + schedule.startMinute)) / 60} horas
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: 16 }}>
                    <label style={styles.label}>Días Laborales</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((day, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    setSchedule(prev => ({
                                        ...prev,
                                        workDays: prev.workDays.includes(i)
                                            ? prev.workDays.filter(d => d !== i)
                                            : [...prev.workDays, i].sort()
                                    }));
                                }}
                                style={{
                                    padding: '8px 14px',
                                    borderRadius: 6,
                                    border: 'none',
                                    cursor: 'pointer',
                                    backgroundColor: schedule.workDays.includes(i) ? '#10b981' : '#334155',
                                    color: schedule.workDays.includes(i) ? '#fff' : '#94a3b8',
                                    fontWeight: 500,
                                }}
                            >
                                {day}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );

    const renderOsTypesTab = () => (
        <div style={styles.card}>
            <div style={styles.cardTitle}>📋 Tipos de Orden de Servicio (OS)</div>
            <div style={styles.infoBox}>
                <span style={{ fontSize: 20 }}>ℹ️</span>
                <div>
                    <strong style={{ color: '#3b82f6' }}>Tipos de OS</strong>
                    <p style={{ color: '#94a3b8', marginTop: 4, fontSize: 13 }}>
                        Define los códigos de operación (TO501-TO506) con sus prioridades. La prioridad 1 es la más alta (reconexiones).
                    </p>
                </div>
            </div>
            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th}>Código</th>
                        <th style={styles.th}>Nombre</th>
                        <th style={styles.th}>Descripción</th>
                        <th style={{ ...styles.th, width: 100 }}>Prioridad</th>
                    </tr>
                </thead>
                <tbody>
                    {osTypes.map((os, idx) => (
                        <tr key={os.code}>
                            <td style={styles.td}>
                                <span style={styles.badge('blue')}>{os.code}</span>
                            </td>
                            <td style={styles.td}>
                                <input
                                    type="text"
                                    style={{ ...styles.input, width: 220 }}
                                    value={os.name}
                                    onChange={(e) => updateOsType(idx, 'name', e.target.value)}
                                />
                            </td>
                            <td style={styles.td}>
                                <input
                                    type="text"
                                    style={styles.input}
                                    value={os.description}
                                    onChange={(e) => updateOsType(idx, 'description', e.target.value)}
                                />
                            </td>
                            <td style={styles.td}>
                                <input
                                    type="number"
                                    style={styles.inputSmall}
                                    value={os.priority}
                                    min={1} max={10}
                                    onChange={(e) => updateOsType(idx, 'priority', e.target.value)}
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    const renderAlcancesTab = () => (
        <div style={styles.card}>
            <div style={styles.cardTitle}>🎯 Códigos de Alcance</div>
            <div style={styles.infoBox}>
                <span style={{ fontSize: 20 }}>ℹ️</span>
                <div>
                    <strong style={{ color: '#3b82f6' }}>Códigos de Alcance</strong>
                    <p style={{ color: '#94a3b8', marginTop: 4, fontSize: 13 }}>
                        Estos códigos determinan el tipo de trabajo y equipo requerido. Se extraen del campo "Línea Estratégica".
                    </p>
                </div>
            </div>
            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={{ ...styles.th, width: 80 }}>Código</th>
                        <th style={{ ...styles.th, width: 180 }}>Nombre</th>
                        <th style={styles.th}>Descripción</th>
                    </tr>
                </thead>
                <tbody>
                    {alcances.map((alc, idx) => (
                        <tr key={alc.code}>
                            <td style={styles.td}>
                                <span style={{
                                    ...styles.badge('green'),
                                    fontSize: 14,
                                    fontWeight: 700,
                                }}>{alc.code}</span>
                            </td>
                            <td style={styles.td}>
                                <input
                                    type="text"
                                    style={styles.input}
                                    value={alc.name}
                                    onChange={(e) => {
                                        const updated = [...alcances];
                                        updated[idx] = { ...updated[idx], name: e.target.value };
                                        setAlcances(updated);
                                    }}
                                />
                            </td>
                            <td style={styles.td}>
                                <input
                                    type="text"
                                    style={styles.input}
                                    value={alc.description}
                                    onChange={(e) => {
                                        const updated = [...alcances];
                                        updated[idx] = { ...updated[idx], description: e.target.value };
                                        setAlcances(updated);
                                    }}
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    const renderMatrixTab = () => (
        <div style={styles.card}>
            <div style={styles.cardTitle}>🔀 Matriz de Asignación: Alcance → Brigada</div>
            <div style={styles.infoBox}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div>
                    <strong style={{ color: '#eab308' }}>Regla Crítica</strong>
                    <p style={{ color: '#94a3b8', marginTop: 4, fontSize: 13 }}>
                        Esta matriz determina qué tipo de brigada se asigna según el alcance y si la zona es urbana o rural.
                        La detección de zona se hace por patrones en la dirección (Tab "Patrones Zona").
                    </p>
                </div>
            </div>
            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={{ ...styles.th, width: 100 }}>Alcance</th>
                        <th style={styles.th}>🏙️ Brigada URBANO</th>
                        <th style={styles.th}>🌾 Brigada RURAL</th>
                    </tr>
                </thead>
                <tbody>
                    {Object.entries(alcanceMatrix).map(([code, zones]) => {
                        const alcanceInfo = alcances.find(a => a.code === code);
                        return (
                            <tr key={code}>
                                <td style={styles.td}>
                                    <div>
                                        <span style={styles.badge('green')}>{code}</span>
                                        <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>{alcanceInfo?.name}</div>
                                    </div>
                                </td>
                                <td style={styles.td}>
                                    <select
                                        style={styles.select}
                                        value={zones.urban}
                                        onChange={(e) => updateAlcanceMatrix(code, 'urban', e.target.value)}
                                    >
                                        {brigadeTypes.map(b => (
                                            <option key={b.type} value={b.type}>{b.type}</option>
                                        ))}
                                    </select>
                                </td>
                                <td style={styles.td}>
                                    <select
                                        style={styles.select}
                                        value={zones.rural}
                                        onChange={(e) => updateAlcanceMatrix(code, 'rural', e.target.value)}
                                    >
                                        {brigadeTypes.map(b => (
                                            <option key={b.type} value={b.type}>{b.type}</option>
                                        ))}
                                    </select>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );

    const renderCapacitiesTab = () => (
        <div style={styles.card}>
            <div style={styles.cardTitle}>📊 Tipos de Brigada y Capacidades</div>
            <div style={styles.infoBox}>
                <span style={{ fontSize: 20 }}>📈</span>
                <div>
                    <strong style={{ color: '#3b82f6' }}>Capacidad Diaria</strong>
                    <p style={{ color: '#94a3b8', marginTop: 4, fontSize: 13 }}>
                        Define cuántas órdenes puede ejecutar cada tipo de brigada por día.
                        El sistema usará estos valores para balancear la carga de trabajo.
                    </p>
                </div>
            </div>
            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th}>Tipo de Brigada</th>
                        <th style={{ ...styles.th, width: 120 }}>Capacidad/Día</th>
                        <th style={{ ...styles.th, width: 120 }}>Técnicos</th>
                        <th style={styles.th}>Especialidad</th>
                    </tr>
                </thead>
                <tbody>
                    {brigadeTypes.map((b, idx) => (
                        <tr key={b.type}>
                            <td style={styles.td}>
                                <span style={{ fontWeight: 600, color: '#f8fafc' }}>{b.type}</span>
                            </td>
                            <td style={styles.td}>
                                <input
                                    type="number"
                                    style={styles.inputSmall}
                                    value={b.capacity}
                                    min={1} max={100}
                                    onChange={(e) => updateBrigadeType(idx, 'capacity', e.target.value)}
                                />
                            </td>
                            <td style={styles.td}>
                                <input
                                    type="number"
                                    style={styles.inputSmall}
                                    value={b.technicians}
                                    min={0} max={100}
                                    onChange={(e) => updateBrigadeType(idx, 'technicians', e.target.value)}
                                />
                            </td>
                            <td style={styles.td}>
                                <input
                                    type="text"
                                    style={styles.input}
                                    value={b.specialty}
                                    onChange={(e) => updateBrigadeType(idx, 'specialty', e.target.value)}
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div style={{ marginTop: 20, padding: 16, backgroundColor: '#0f172a', borderRadius: 8 }}>
                <strong style={{ color: '#10b981' }}>📊 Total Técnicos: {brigadeTypes.reduce((sum, b) => sum + b.technicians, 0)}</strong>
                <span style={{ color: '#94a3b8', marginLeft: 16 }}>
                    | Capacidad Total: {brigadeTypes.reduce((sum, b) => sum + (b.capacity * b.technicians), 0)} órdenes/día
                </span>
            </div>
        </div>
    );

    const renderTimesTab = () => (
        <div style={styles.card}>
            <div style={styles.cardTitle}>⏱️ Tiempos Estimados de Operación</div>
            <div style={styles.infoBox}>
                <span style={{ fontSize: 20 }}>⏱️</span>
                <div>
                    <strong style={{ color: '#3b82f6' }}>Tiempos por Operación</strong>
                    <p style={{ color: '#94a3b8', marginTop: 4, fontSize: 13 }}>
                        Estos tiempos se usan para calcular la ventana horaria de cada punto en la ruta.
                        El tipo de cliente (Cooperativo vs Agresivo) puede duplicar el tiempo.
                    </p>
                </div>
            </div>
            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th}>Tipo de Operación</th>
                        <th style={styles.th}>Tipo de Cliente</th>
                        <th style={{ ...styles.th, width: 120 }}>Minutos</th>
                    </tr>
                </thead>
                <tbody>
                    {times.map((t, idx) => (
                        <tr key={idx}>
                            <td style={styles.td}>
                                <input
                                    type="text"
                                    style={styles.input}
                                    value={t.operation}
                                    onChange={(e) => updateTime(idx, 'operation', e.target.value)}
                                />
                            </td>
                            <td style={styles.td}>
                                <input
                                    type="text"
                                    style={{ ...styles.input, width: 150 }}
                                    value={t.clientType}
                                    onChange={(e) => updateTime(idx, 'clientType', e.target.value)}
                                />
                            </td>
                            <td style={styles.td}>
                                <input
                                    type="number"
                                    style={styles.inputSmall}
                                    value={t.minutes}
                                    min={1} max={120}
                                    onChange={(e) => updateTime(idx, 'minutes', e.target.value)}
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <button
                style={{ ...styles.buttonSecondary, marginTop: 16 }}
                onClick={() => setTimes([...times, { operation: '', clientType: '-', minutes: 15 }])}
            >
                + Agregar Tiempo
            </button>
        </div>
    );

    const renderZonesTab = () => (
        <div>
            <div style={styles.infoBox}>
                <span style={{ fontSize: 20 }}>🗺️</span>
                <div>
                    <strong style={{ color: '#3b82f6' }}>Detección de Zona por Dirección</strong>
                    <p style={{ color: '#94a3b8', marginTop: 4, fontSize: 13 }}>
                        El sistema detecta si una dirección es URBANA o RURAL buscando estos patrones en el texto.
                        Los patrones rurales tienen prioridad. Si no coincide con ninguno, se asume RURAL.
                    </p>
                </div>
            </div>

            <div style={styles.grid2}>
                <div style={styles.card}>
                    <div style={styles.cardTitle}>🌾 Patrones RURALES</div>
                    <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 16 }}>
                        Si la dirección contiene estos textos → Zona RURAL
                    </p>
                    {zonePatterns.rural.map((pattern, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <input
                                type="text"
                                style={styles.input}
                                value={pattern}
                                onChange={(e) => updateZonePattern('rural', idx, e.target.value)}
                            />
                            <button
                                onClick={() => removeZonePattern('rural', idx)}
                                style={{
                                    backgroundColor: '#ef4444',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '0 12px',
                                    color: '#fff',
                                    cursor: 'pointer'
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                    <button
                        style={{ ...styles.buttonSecondary, marginTop: 8 }}
                        onClick={() => addZonePattern('rural')}
                    >
                        + Agregar Patrón Rural
                    </button>
                </div>

                <div style={styles.card}>
                    <div style={styles.cardTitle}>🏙️ Patrones URBANOS</div>
                    <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 16 }}>
                        Si la dirección contiene estos textos → Zona URBANA
                    </p>
                    {zonePatterns.urban.map((pattern, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <input
                                type="text"
                                style={styles.input}
                                value={pattern}
                                onChange={(e) => updateZonePattern('urban', idx, e.target.value)}
                            />
                            <button
                                onClick={() => removeZonePattern('urban', idx)}
                                style={{
                                    backgroundColor: '#ef4444',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '0 12px',
                                    color: '#fff',
                                    cursor: 'pointer'
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                    <button
                        style={{ ...styles.buttonSecondary, marginTop: 8 }}
                        onClick={() => addZonePattern('urban')}
                    >
                        + Agregar Patrón Urbano
                    </button>
                </div>
            </div>
        </div>
    );

    const renderCostsTab = () => (
        <div>
            <div style={styles.grid2}>
                <div style={styles.card}>
                    <div style={styles.cardTitle}>⛽ Gasolina Mensual</div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Brigadas Pesadas (COP/mes)</label>
                        <input
                            type="number"
                            style={styles.input}
                            value={costs.gasoline.pesada}
                            onChange={(e) => setCosts(prev => ({
                                ...prev,
                                gasoline: { ...prev.gasoline, pesada: parseInt(e.target.value) || 0 }
                            }))}
                        />
                    </div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Brigadas Disponibilidad (COP/mes)</label>
                        <input
                            type="number"
                            style={styles.input}
                            value={costs.gasoline.disponibilidad}
                            onChange={(e) => setCosts(prev => ({
                                ...prev,
                                gasoline: { ...prev.gasoline, disponibilidad: parseInt(e.target.value) || 0 }
                            }))}
                        />
                    </div>
                </div>

                <div style={styles.card}>
                    <div style={styles.cardTitle}>💵 Costo por Hora</div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Brigada Pesada (COP/hora)</label>
                        <input
                            type="number"
                            style={styles.input}
                            value={costs.hourly.pesada}
                            onChange={(e) => setCosts(prev => ({
                                ...prev,
                                hourly: { ...prev.hourly, pesada: parseInt(e.target.value) || 0 }
                            }))}
                        />
                    </div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Brigada Liviana (COP/hora)</label>
                        <input
                            type="number"
                            style={styles.input}
                            value={costs.hourly.liviana}
                            onChange={(e) => setCosts(prev => ({
                                ...prev,
                                hourly: { ...prev.hourly, liviana: parseInt(e.target.value) || 0 }
                            }))}
                        />
                    </div>
                </div>
            </div>

            <div style={styles.card}>
                <div style={styles.cardTitle}>📆 Costo Mensual por Brigada</div>
                <div style={styles.grid2}>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Brigada Pesada (COP/mes)</label>
                        <input
                            type="number"
                            style={styles.input}
                            value={costs.monthly.pesada}
                            onChange={(e) => setCosts(prev => ({
                                ...prev,
                                monthly: { ...prev.monthly, pesada: parseInt(e.target.value) || 0 }
                            }))}
                        />
                    </div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Brigada Liviana (COP/mes)</label>
                        <input
                            type="number"
                            style={styles.input}
                            value={costs.monthly.liviana}
                            onChange={(e) => setCosts(prev => ({
                                ...prev,
                                monthly: { ...prev.monthly, liviana: parseInt(e.target.value) || 0 }
                            }))}
                        />
                    </div>
                </div>
            </div>
        </div>
    );

    const renderRulesTab = () => (
        <div style={styles.card}>
            <div style={styles.cardTitle}>📌 Reglas Especiales de Asignación</div>
            <div style={styles.infoBox}>
                <span style={{ fontSize: 20 }}>⚡</span>
                <div>
                    <strong style={{ color: '#eab308' }}>Reglas de Negocio</strong>
                    <p style={{ color: '#94a3b8', marginTop: 4, fontSize: 13 }}>
                        Estas reglas modifican la asignación estándar cuando se cumplen condiciones especiales.
                    </p>
                </div>
            </div>
            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={{ ...styles.th, width: 50 }}>Activa</th>
                        <th style={styles.th}>Nombre</th>
                        <th style={styles.th}>Condición</th>
                        <th style={styles.th}>Acción</th>
                    </tr>
                </thead>
                <tbody>
                    {specialRules.map((rule, idx) => (
                        <tr key={rule.id}>
                            <td style={styles.td}>
                                <input
                                    type="checkbox"
                                    checked={rule.active}
                                    onChange={() => {
                                        const updated = [...specialRules];
                                        updated[idx] = { ...updated[idx], active: !updated[idx].active };
                                        setSpecialRules(updated);
                                    }}
                                    style={{ width: 20, height: 20, cursor: 'pointer' }}
                                />
                            </td>
                            <td style={styles.td}>
                                <span style={{ fontWeight: 600 }}>{rule.name}</span>
                            </td>
                            <td style={styles.td}>
                                <code style={{
                                    backgroundColor: '#0f172a',
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                    fontSize: 12,
                                    color: '#fbbf24'
                                }}>
                                    {rule.condition}
                                </code>
                            </td>
                            <td style={styles.td}>
                                <span style={{ color: '#10b981' }}>{rule.action}</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    const renderActiveTab = () => {
        switch (activeTab) {
            case 'general': return renderGeneralTab();
            case 'os_types': return renderOsTypesTab();
            case 'alcances': return renderAlcancesTab();
            case 'matrix': return renderMatrixTab();
            case 'capacities': return renderCapacitiesTab();
            case 'times': return renderTimesTab();
            case 'zones': return renderZonesTab();
            case 'costs': return renderCostsTab();
            case 'rules': return renderRulesTab();
            default: return renderGeneralTab();
        }
    };

    // ============================================
    // MAIN RENDER
    // ============================================
    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div>
                    <h1 style={styles.title}>⚙️ Configuración del Sistema</h1>
                    <p style={styles.subtitle}>Gestiona los parámetros operativos de SCR</p>
                </div>
                <button
                    style={{ ...styles.button, opacity: saving ? 0.7 : 1 }}
                    onClick={handleSave}
                    disabled={saving}
                >
                    {saving ? '⏳ Guardando...' : '💾 Guardar Cambios'}
                </button>
            </div>

            {saveSuccess && (
                <div style={styles.successMessage}>
                    ✅ Configuración guardada exitosamente
                </div>
            )}

            {/* Tabs */}
            <div style={styles.tabs}>
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        style={styles.tab(activeTab === tab.id)}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Active Tab Content */}
            {renderActiveTab()}
        </div>
    );
}
