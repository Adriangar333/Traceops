import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ClipboardList, Users, Zap, BarChart3, Upload, Search, RefreshCw, Filter, X, Check, AlertCircle, FileSpreadsheet, ChevronDown, ChevronUp, MapPin, Map, CheckSquare } from 'lucide-react';
import SCRCAuditPanel from './SCRCAuditPanel';
import { toast, Toaster } from 'sonner';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const API_BASE = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host';

// Status badge colors
const STATUS_COLORS = {
    pending: { bg: 'rgba(234, 179, 8, 0.15)', color: '#eab308', label: 'Pendiente' },
    assigned: { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', label: 'Asignada' },
    in_progress: { bg: 'rgba(168, 85, 247, 0.15)', color: '#a855f7', label: 'En Progreso' },
    completed: { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', label: 'Completada' },
    cancelled_payment: { bg: 'rgba(107, 114, 128, 0.15)', color: '#6b7280', label: 'Cancelada (Pago)' }
};

const ORDER_TYPE_ICONS = {
    corte: '✂️',
    suspension: '⚠️',
    reconexion: '🔌'
};

export default function SCRCPanel({ onClose }) {
    const [activeTab, setActiveTab] = useState('orders');
    const [orders, setOrders] = useState([]);
    const [brigades, setBrigades] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({ status: '', brigade_type: '', technician: '', municipality: '' });
    const [showFilters, setShowFilters] = useState(false);
    const [autoAssignResult, setAutoAssignResult] = useState(null);
    const [isAssigning, setIsAssigning] = useState(false);

    // Fetch orders with filters
    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.status) params.append('status', filters.status);
            if (filters.brigade_type) params.append('brigade_type', filters.brigade_type);
            if (filters.technician) params.append('technician', filters.technician);
            if (filters.municipality) params.append('municipality', filters.municipality);
            params.append('limit', '200');

            const res = await fetch(`${API_BASE}/api/scrc/orders?${params}`);
            const data = await res.json();
            setOrders(data.orders || []);
        } catch (err) {
            console.error('Error fetching orders:', err);
            toast.error('Error al cargar órdenes');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    // Fetch brigades
    const fetchBrigades = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/scrc/brigades`);
            const data = await res.json();
            setBrigades(data.brigades || []);
        } catch (err) {
            console.error('Error fetching brigades:', err);
        }
    };

    // Fetch stats
    const fetchStats = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/scrc/stats`);
            const data = await res.json();
            setStats(data);
        } catch (err) {
            console.error('Error fetching stats:', err);
        }
    };

    // Auto-assign orders
    const handleAutoAssign = async (dryRun = false) => {
        setIsAssigning(true);
        try {
            const res = await fetch(`${API_BASE}/api/scrc/routing/auto-assign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ maxOrders: 500, dryRun })
            });
            const data = await res.json();
            setAutoAssignResult(data);

            if (!dryRun && data.assigned > 0) {
                toast.success(`✅ ${data.assigned} órdenes asignadas automáticamente`);
                fetchOrders();
                fetchStats();
            }
        } catch (err) {
            console.error('Error auto-assigning:', err);
            toast.error('Error en auto-asignación');
        } finally {
            setIsAssigning(false);
        }
    };

    // Upload Excel
    const handleExcelUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        toast.loading('📤 Subiendo archivo Excel...', { id: 'excel-upload' });

        try {
            const res = await fetch(`${API_BASE}/api/scrc/upload-excel`, {
                method: 'POST',
                body: formData
            });

            let data;
            try {
                data = await res.json();
            } catch (_) {
                throw new Error('El servidor respondió con un formato inesperado. ¿El backend está en ejecución?');
            }

            if (!res.ok) {
                const msg = data?.error && data?.details ? `${data.error}: ${data.details}` : (data?.error || data?.message || 'Error al procesar archivo');
                throw new Error(msg);
            }

            if (data.count === 0) {
                const hint = data.hint || 'Verifica que el Excel tenga columnas NIC, ORDEN o al menos DIRECCION.';
                const colList = data.detectedColumns?.length ? ` Columnas detectadas: ${data.detectedColumns.join(', ')}.` : '';
                toast.warning(`⚠️ No se cargó ninguna orden.${colList} ${hint}`, {
                    id: 'excel-upload',
                    duration: 12000
                });
            } else if (data.count > 0) {
                toast.success(`✅ ${data.count} órdenes cargadas${data.skipped > 0 ? ` (${data.skipped} omitidas)` : ''}`, { id: 'excel-upload' });
            }

            // Refresh orders
            fetchOrders();
            fetchStats();
        } catch (err) {
            console.error('Excel upload error:', err);
            const msg = err.message || 'Error de conexión. Verifica que el backend esté en ejecución y la URL configurada.';
            toast.error(`❌ ${msg}`, { id: 'excel-upload', duration: 8000 });
        }

        // Clear file input
        e.target.value = '';
    };

    useEffect(() => {
        if (activeTab === 'orders' || activeTab === 'map') {
            fetchOrders();
        }
        fetchBrigades();
        fetchStats();
    }, [activeTab]);

    useEffect(() => {
        fetchOrders();
    }, [filters, fetchOrders]);

    const tabs = [
        { id: 'orders', icon: ClipboardList, label: 'Órdenes' },
        { id: 'map', icon: Map, label: 'Mapa' },
        { id: 'brigades', icon: Users, label: 'Brigadas' },
        { id: 'autoassign', icon: Zap, label: 'Auto-Asignar' },
        { id: 'audit', icon: CheckSquare, label: 'Auditoría' },
        { id: 'stats', icon: BarChart3, label: 'Estadísticas' }
    ];

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
        tabs: {
            display: 'flex',
            gap: 8,
            padding: '16px 24px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
            overflowX: 'auto'
        },
        tab: {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
            transition: 'all 0.2s',
            whiteSpace: 'nowrap'
        },
        activeTab: {
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: 'white'
        },
        inactiveTab: {
            background: 'rgba(148, 163, 184, 0.1)',
            color: '#94a3b8'
        },
        content: {
            padding: '24px'
        },
        table: {
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.875rem'
        },
        th: {
            textAlign: 'left',
            padding: '12px 16px',
            background: 'rgba(148, 163, 184, 0.05)',
            color: '#94a3b8',
            fontWeight: 600,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
        },
        td: {
            padding: '14px 16px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.1)'
        },
        badge: (status) => ({
            display: 'inline-block',
            padding: '4px 10px',
            borderRadius: 20,
            fontSize: '0.75rem',
            fontWeight: 500,
            background: STATUS_COLORS[status]?.bg || 'rgba(148, 163, 184, 0.15)',
            color: STATUS_COLORS[status]?.color || '#94a3b8'
        }),
        card: {
            background: 'rgba(148, 163, 184, 0.05)',
            borderRadius: 16,
            padding: 20,
            border: '1px solid rgba(148, 163, 184, 0.1)'
        },
        statCard: {
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%)',
            borderRadius: 16,
            padding: 24,
            border: '1px solid rgba(16, 185, 129, 0.2)',
            textAlign: 'center'
        },
        statNumber: {
            fontSize: '2.5rem',
            fontWeight: 700,
            color: '#10b981',
            lineHeight: 1
        },
        statLabel: {
            color: '#94a3b8',
            fontSize: '0.875rem',
            marginTop: 8
        },
        filterBtn: {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: 10,
            border: '1px solid rgba(148, 163, 184, 0.2)',
            background: 'rgba(148, 163, 184, 0.05)',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '0.875rem'
        },
        input: {
            background: 'rgba(148, 163, 184, 0.1)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: 8,
            padding: '10px 14px',
            color: '#f1f5f9',
            fontSize: '0.875rem',
            width: '100%'
        },
        primaryBtn: {
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            border: 'none',
            borderRadius: 12,
            padding: '14px 24px',
            color: 'white',
            fontWeight: 600,
            fontSize: '1rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            transition: 'all 0.2s',
            boxShadow: '0 4px 20px rgba(16, 185, 129, 0.3)'
        },
        secondaryBtn: {
            background: 'rgba(148, 163, 184, 0.1)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: 12,
            padding: '14px 24px',
            color: '#f1f5f9',
            fontWeight: 500,
            cursor: 'pointer'
        },
        brigadeCard: {
            background: 'rgba(148, 163, 184, 0.05)',
            borderRadius: 16,
            padding: 20,
            border: '1px solid rgba(148, 163, 184, 0.1)',
            marginBottom: 12
        }
    };

    // Orders Tab
    const OrdersTab = () => (
        <div>
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <button style={styles.filterBtn} onClick={() => setShowFilters(!showFilters)}>
                    <Filter size={16} />
                    Filtros
                    {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button style={styles.filterBtn} onClick={fetchOrders}>
                    <RefreshCw size={16} className={loading ? 'spin' : ''} />
                    Actualizar
                </button>
                <label style={{ ...styles.filterBtn, marginLeft: 'auto' }}>
                    <Upload size={16} />
                    Cargar Excel
                    <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} style={{ display: 'none' }} />
                </label>
            </div>

            {/* Filters */}
            {showFilters && (
                <div style={{ ...styles.card, marginBottom: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                        <select
                            style={styles.input}
                            value={filters.status}
                            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                        >
                            <option value="">Todos los estados</option>
                            <option value="pending">Pendiente</option>
                            <option value="assigned">Asignada</option>
                            <option value="completed">Completada</option>
                            <option value="cancelled_payment">Cancelada (Pago)</option>
                        </select>
                        <select
                            style={styles.input}
                            value={filters.brigade_type}
                            onChange={e => setFilters(f => ({ ...f, brigade_type: e.target.value }))}
                        >
                            <option value="">Tipo de brigada</option>
                            <option value="alcance">Alcance</option>
                            <option value="exclusiva">Exclusiva</option>
                        </select>
                        <input
                            style={styles.input}
                            placeholder="Buscar técnico..."
                            value={filters.technician}
                            onChange={e => setFilters(f => ({ ...f, technician: e.target.value }))}
                        />
                        <button
                            style={{ ...styles.filterBtn, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
                            onClick={() => setFilters({ status: '', brigade_type: '', technician: '', municipality: '' })}
                        >
                            <X size={14} /> Limpiar
                        </button>
                    </div>
                </div>
            )}

            {/* Table */}
            <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Tipo</th>
                            <th style={styles.th}>Orden</th>
                            <th style={styles.th}>NIC</th>
                            <th style={styles.th}>Cliente</th>
                            <th style={styles.th}>Dirección</th>
                            <th style={styles.th}>Brigada</th>
                            <th style={styles.th}>Estado</th>
                            <th style={styles.th}>Deuda</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ ...styles.td, textAlign: 'center', color: '#64748b', padding: 40 }}>
                                    {loading ? '⏳ Cargando...' : '📭 No hay órdenes que mostrar'}
                                </td>
                            </tr>
                        ) : orders.map((order, i) => (
                            <tr key={order.id || i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(148, 163, 184, 0.02)' }}>
                                <td style={styles.td}>
                                    <span style={{ fontSize: '1.25rem' }}>{ORDER_TYPE_ICONS[order.order_type] || '📋'}</span>
                                </td>
                                <td style={{ ...styles.td, fontWeight: 600, color: '#f1f5f9' }}>{order.order_number}</td>
                                <td style={{ ...styles.td, fontFamily: 'monospace', color: '#94a3b8' }}>{order.nic}</td>
                                <td style={styles.td}>{order.client_name || '—'}</td>
                                <td style={{ ...styles.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {order.address || '—'}
                                </td>
                                <td style={styles.td}>{order.zone_code || order.brigade_type || '—'}</td>
                                <td style={styles.td}>
                                    <span style={styles.badge(order.status)}>
                                        {STATUS_COLORS[order.status]?.label || order.status}
                                    </span>
                                </td>
                                <td style={{ ...styles.td, color: order.amount_due > 0 ? '#ef4444' : '#22c55e' }}>
                                    ${(order.amount_due || 0).toLocaleString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 12, textAlign: 'right' }}>
                Mostrando {orders.length} órdenes
            </p>
        </div>
    );

    // Map Tab - Visual representation of orders
    const MapTab = () => {
        const mapContainer = useRef(null);
        const mapRef = useRef(null);
        const markersRef = useRef([]);
        const [mapLoaded, setMapLoaded] = useState(false);
        const [legendFilter, setLegendFilter] = useState({ corte: true, suspension: true, reconexion: true });
        const [geocoding, setGeocoding] = useState(false);

        // Geocode orders without coordinates
        const handleGeocode = async (simulate = false) => {
            setGeocoding(true);
            try {
                const endpoint = simulate ? 'geocoding/simulate' : 'geocoding/batch';
                const res = await fetch(`${API_BASE}/scrc/${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ limit: 500 })
                });
                const data = await res.json();
                if (data.success) {
                    const count = data.geocoded || data.simulated || 0;
                    toast.success(`${count} órdenes geocodificadas`);
                    fetchOrders(); // Refresh orders
                } else {
                    toast.error(data.error || 'Error geocodificando');
                }
            } catch (err) {
                console.error('Geocode error:', err);
                toast.error('Error de conexión');
            } finally {
                setGeocoding(false);
            }
        };

        // Color scheme for order types
        const ORDER_COLORS = {
            corte: '#ef4444',       // Red
            suspension: '#eab308',   // Yellow
            reconexion: '#22c55e',   // Green
            default: '#3b82f6'       // Blue
        };

        // Initialize map
        useEffect(() => {
            if (mapRef.current || !mapContainer.current) return;

            mapRef.current = new maplibregl.Map({
                container: mapContainer.current,
                style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
                center: [-74.8, 10.95], // Barranquilla
                zoom: 11
            });

            mapRef.current.on('load', () => {
                setMapLoaded(true);
            });

            mapRef.current.addControl(new maplibregl.NavigationControl(), 'top-right');

            return () => {
                markersRef.current.forEach(m => m.remove());
                mapRef.current?.remove();
                mapRef.current = null;
            };
        }, []);

        // Add markers when orders change or map loads
        useEffect(() => {
            if (!mapRef.current || !mapLoaded) return;

            // Clear existing markers
            markersRef.current.forEach(m => m.remove());
            markersRef.current = [];

            // Filter orders with coordinates and by legend filter
            const ordersWithCoords = orders.filter(o => {
                const lat = o.latitude || o.lat;
                const lng = o.longitude || o.lng;
                if (!lat || !lng) return false;
                // Apply legend filter
                const type = o.order_type || 'default';
                return legendFilter[type] !== false;
            });

            // Add markers for each order
            ordersWithCoords.forEach(order => {
                const lat = order.latitude || order.lat;
                const lng = order.longitude || order.lng;
                const type = order.order_type || 'default';
                const color = ORDER_COLORS[type] || ORDER_COLORS.default;

                // Create custom marker element
                const el = document.createElement('div');
                el.style.cssText = `
                    width: 28px; height: 28px;
                    background: ${color};
                    border: 2px solid white;
                    border-radius: 50%;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex; align-items: center; justify-content: center;
                    font-size: 14px;
                    cursor: pointer;
                `;
                el.innerHTML = ORDER_TYPE_ICONS[type] || '📋';

                // Create popup
                const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
                    <div style="padding: 8px; font-family: system-ui; min-width: 180px;">
                        <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">
                            ${ORDER_TYPE_ICONS[type] || '📋'} ${order.order_number || 'Sin número'}
                        </div>
                        <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
                            <strong>NIC:</strong> ${order.nic || '—'}
                        </div>
                        <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
                            <strong>Cliente:</strong> ${order.client_name || '—'}
                        </div>
                        <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
                            <strong>Dirección:</strong> ${order.address || '—'}
                        </div>
                        <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
                            <strong>Estado:</strong> ${STATUS_COLORS[order.status]?.label || order.status}
                        </div>
                        <div style="font-size: 12px; color: ${order.amount_due > 0 ? '#ef4444' : '#22c55e'};">
                            <strong>Deuda:</strong> $${(order.amount_due || 0).toLocaleString()}
                        </div>
                        ${order.assigned_brigade ? `
                            <div style="font-size: 12px; color: #3b82f6; margin-top: 4px; padding-top: 4px; border-top: 1px solid #eee;">
                                <strong>Brigada:</strong> ${order.assigned_brigade}
                            </div>
                        ` : ''}
                    </div>
                `);

                const marker = new maplibregl.Marker({ element: el })
                    .setLngLat([lng, lat])
                    .setPopup(popup)
                    .addTo(mapRef.current);

                markersRef.current.push(marker);
            });

            // Fit bounds if we have markers
            if (ordersWithCoords.length > 0) {
                const bounds = new maplibregl.LngLatBounds();
                ordersWithCoords.forEach(o => {
                    bounds.extend([o.longitude || o.lng, o.latitude || o.lat]);
                });
                mapRef.current.fitBounds(bounds, { padding: 50, maxZoom: 14 });
            }
        }, [orders, mapLoaded, legendFilter]);

        const ordersWithCoords = orders.filter(o => (o.latitude || o.lat) && (o.longitude || o.lng));
        const ordersWithoutCoords = orders.length - ordersWithCoords.length;

        return (
            <div style={{ height: 'calc(100vh - 220px)', position: 'relative' }}>
                {/* Map Container */}
                <div ref={mapContainer} style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }} />

                {/* Legend */}
                <div style={{
                    position: 'absolute', top: 16, left: 16,
                    background: 'rgba(15, 23, 42, 0.95)',
                    borderRadius: 12, padding: 16,
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    minWidth: 180
                }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.875rem', color: '#f1f5f9' }}>
                        Tipos de Orden
                    </h4>
                    {[
                        { key: 'corte', icon: '✂️', label: 'Corte', color: ORDER_COLORS.corte },
                        { key: 'suspension', icon: '⚠️', label: 'Suspensión', color: ORDER_COLORS.suspension },
                        { key: 'reconexion', icon: '🔌', label: 'Reconexión', color: ORDER_COLORS.reconexion }
                    ].map(item => (
                        <label key={item.key} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '6px 0', cursor: 'pointer', color: '#f1f5f9'
                        }}>
                            <input
                                type="checkbox"
                                checked={legendFilter[item.key]}
                                onChange={(e) => setLegendFilter(f => ({ ...f, [item.key]: e.target.checked }))}
                                style={{ accentColor: item.color }}
                            />
                            <span style={{
                                width: 16, height: 16, borderRadius: '50%',
                                background: item.color, display: 'inline-block'
                            }} />
                            <span style={{ fontSize: '0.875rem' }}>{item.icon} {item.label}</span>
                        </label>
                    ))}
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(148, 163, 184, 0.2)' }}>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            📍 {ordersWithCoords.length} con coordenadas
                        </div>
                        {ordersWithoutCoords > 0 && (
                            <>
                                <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: 4 }}>
                                    ⚠️ {ordersWithoutCoords} sin geocodificar
                                </div>
                                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <button
                                        onClick={() => handleGeocode(true)}
                                        disabled={geocoding}
                                        style={{
                                            padding: '6px 10px',
                                            fontSize: '0.75rem',
                                            background: 'rgba(34, 197, 94, 0.2)',
                                            border: '1px solid rgba(34, 197, 94, 0.5)',
                                            borderRadius: 6,
                                            color: '#22c55e',
                                            cursor: geocoding ? 'wait' : 'pointer',
                                            opacity: geocoding ? 0.6 : 1
                                        }}
                                    >
                                        {geocoding ? '⏳ Procesando...' : '🎯 Simular Coords'}
                                    </button>
                                    <button
                                        onClick={() => handleGeocode(false)}
                                        disabled={geocoding}
                                        style={{
                                            padding: '6px 10px',
                                            fontSize: '0.75rem',
                                            background: 'rgba(59, 130, 246, 0.2)',
                                            border: '1px solid rgba(59, 130, 246, 0.5)',
                                            borderRadius: 6,
                                            color: '#3b82f6',
                                            cursor: geocoding ? 'wait' : 'pointer',
                                            opacity: geocoding ? 0.6 : 1
                                        }}
                                    >
                                        {geocoding ? '⏳ Procesando...' : '🌍 Google Geocode'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Stats overlay */}
                <div style={{
                    position: 'absolute', bottom: 16, right: 16,
                    display: 'flex', gap: 8
                }}>
                    {Object.entries(STATUS_COLORS).slice(0, 4).map(([status, cfg]) => {
                        const count = orders.filter(o => o.status === status).length;
                        return count > 0 ? (
                            <div key={status} style={{
                                background: cfg.bg,
                                border: `1px solid ${cfg.color}`,
                                borderRadius: 8, padding: '8px 12px',
                                fontSize: '0.75rem', color: cfg.color
                            }}>
                                {cfg.label}: {count}
                            </div>
                        ) : null;
                    })}
                </div>
            </div>
        );
    };

    // Generate brigades from technicians in orders
    const [generatingBrigades, setGeneratingBrigades] = useState(false);

    const handleGenerateBrigades = async () => {
        setGeneratingBrigades(true);
        try {
            const res = await fetch(`${API_BASE}/scrc/brigades/generate-from-orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'corte', capacity_per_day: 25 })
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`${data.message}`);
                fetchBrigades();
            } else {
                toast.error(data.error || 'Error generando brigadas');
            }
        } catch (err) {
            console.error('Generate brigades error:', err);
            toast.error('Error de conexión');
        } finally {
            setGeneratingBrigades(false);
        }
    };

    // Brigades Tab
    const BrigadesTab = () => (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <h3 style={{ margin: 0, fontSize: '1.125rem' }}>Brigadas Activas</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        style={{ ...styles.primaryBtn, padding: '8px 16px', fontSize: '0.875rem' }}
                        onClick={handleGenerateBrigades}
                        disabled={generatingBrigades}
                    >
                        {generatingBrigades ? (
                            <><RefreshCw size={14} className="spin" /> Generando...</>
                        ) : (
                            <><Users size={14} /> Generar desde Órdenes</>
                        )}
                    </button>
                    <button style={styles.filterBtn} onClick={fetchBrigades}>
                        <RefreshCw size={16} /> Actualizar
                    </button>
                </div>
            </div>

            {brigades.length === 0 ? (
                <div style={{ ...styles.card, textAlign: 'center', padding: 40 }}>
                    <Users size={48} color="#64748b" style={{ marginBottom: 16, opacity: 0.5 }} />
                    <p style={{ color: '#64748b' }}>No hay brigadas registradas</p>
                    <p style={{ color: '#475569', fontSize: '0.875rem', marginBottom: 16 }}>
                        Haz clic en "Generar desde Órdenes" para crear brigadas automáticamente
                    </p>
                    <button
                        style={{ ...styles.primaryBtn, margin: '0 auto' }}
                        onClick={handleGenerateBrigades}
                        disabled={generatingBrigades}
                    >
                        {generatingBrigades ? 'Generando...' : 'Generar Brigadas Automáticamente'}
                    </button>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                    {brigades.map((brigade, i) => (
                        <div key={brigade.id || i} style={styles.brigadeCard}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                <span style={{ fontWeight: 600, fontSize: '1rem' }}>{brigade.name}</span>
                                <span style={styles.badge(brigade.status === 'active' ? 'assigned' : 'pending')}>
                                    {brigade.type}
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: 20 }}>
                                <div>
                                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Capacidad/día</span>
                                    <p style={{ margin: 0, fontWeight: 600, color: '#10b981' }}>{brigade.capacity_per_day}</p>
                                </div>
                                <div>
                                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Hoy</span>
                                    <p style={{ margin: 0, fontWeight: 600 }}>{brigade.orders_today || 0}</p>
                                </div>
                                <div>
                                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Miembros</span>
                                    <p style={{ margin: 0, fontWeight: 600 }}>{brigade.members?.length || 0}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    // Auto-Assign Tab
    const AutoAssignTab = () => (
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <div style={{ ...styles.card, textAlign: 'center', marginBottom: 24 }}>
                <Zap size={64} color="#eab308" style={{ marginBottom: 16 }} />
                <h2 style={{ margin: '0 0 8px 0', fontSize: '1.5rem' }}>Auto-Asignación Inteligente</h2>
                <p style={{ color: '#94a3b8', margin: 0 }}>
                    Asigna órdenes automáticamente a las brigadas según capacidad, zona y elegibilidad.
                </p>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
                <button
                    style={{ ...styles.secondaryBtn }}
                    onClick={() => handleAutoAssign(true)}
                    disabled={isAssigning}
                >
                    🔍 Vista Previa (Dry Run)
                </button>
                <button
                    style={styles.primaryBtn}
                    onClick={() => handleAutoAssign(false)}
                    disabled={isAssigning}
                >
                    {isAssigning ? (
                        <>
                            <RefreshCw size={20} className="spin" />
                            Asignando...
                        </>
                    ) : (
                        <>
                            <Zap size={20} />
                            🚀 Ejecutar Auto-Asignación
                        </>
                    )}
                </button>
            </div>

            {autoAssignResult && (
                <div style={{ ...styles.card, marginTop: 24 }}>
                    <h4 style={{ margin: '0 0 16px 0' }}>Resultado:</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div style={styles.statCard}>
                            <span style={styles.statNumber}>{autoAssignResult.assigned || 0}</span>
                            <span style={styles.statLabel}>Asignadas</span>
                        </div>
                        <div style={{ ...styles.statCard, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                            <span style={{ ...styles.statNumber, color: '#ef4444' }}>{autoAssignResult.skipped || 0}</span>
                            <span style={styles.statLabel}>Sin asignar</span>
                        </div>
                    </div>
                    {autoAssignResult.assignments && autoAssignResult.assignments.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Primeras 5 asignaciones:</p>
                            <ul style={{ margin: 0, paddingLeft: 20, color: '#94a3b8', fontSize: '0.875rem' }}>
                                {autoAssignResult.assignments.slice(0, 5).map((a, i) => (
                                    <li key={i}>{a.order_number} → {a.brigade_name}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    // Stats Tab
    const StatsTab = () => (
        <div>
            {!stats ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                    ⏳ Cargando estadísticas...
                </div>
            ) : (
                <>
                    {/* Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
                        <div style={styles.statCard}>
                            <span style={styles.statNumber}>{stats.summary?.total || 0}</span>
                            <span style={styles.statLabel}>Total Órdenes</span>
                        </div>
                        <div style={{ ...styles.statCard, background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
                            <span style={{ ...styles.statNumber, color: '#eab308' }}>{stats.summary?.pending || 0}</span>
                            <span style={styles.statLabel}>Pendientes</span>
                        </div>
                        <div style={{ ...styles.statCard, background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                            <span style={{ ...styles.statNumber, color: '#3b82f6' }}>{stats.summary?.assigned || 0}</span>
                            <span style={styles.statLabel}>Asignadas</span>
                        </div>
                        <div style={styles.statCard}>
                            <span style={styles.statNumber}>{stats.summary?.completed || 0}</span>
                            <span style={styles.statLabel}>Completadas</span>
                        </div>
                    </div>

                    {/* By Type */}
                    <h3 style={{ marginBottom: 16 }}>Por Tipo de Orden</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
                        <div style={styles.card}>
                            <span style={{ fontSize: '2rem' }}>✂️</span>
                            <span style={{ fontSize: '1.5rem', fontWeight: 700, display: 'block' }}>{stats.summary?.cortes || 0}</span>
                            <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Cortes</span>
                        </div>
                        <div style={styles.card}>
                            <span style={{ fontSize: '2rem' }}>⚠️</span>
                            <span style={{ fontSize: '1.5rem', fontWeight: 700, display: 'block' }}>{stats.summary?.suspensiones || 0}</span>
                            <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Suspensiones</span>
                        </div>
                        <div style={styles.card}>
                            <span style={{ fontSize: '2rem' }}>🔌</span>
                            <span style={{ fontSize: '1.5rem', fontWeight: 700, display: 'block' }}>{stats.summary?.reconexiones || 0}</span>
                            <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Reconexiones</span>
                        </div>
                    </div>

                    {/* Total Debt */}
                    <div style={{ ...styles.card, textAlign: 'center' }}>
                        <span style={{ color: '#64748b', fontSize: '0.875rem' }}>Deuda Total en Cartera</span>
                        <span style={{ fontSize: '2.5rem', fontWeight: 700, color: '#ef4444', display: 'block' }}>
                            ${(stats.summary?.total_debt || 0).toLocaleString()}
                        </span>
                    </div>
                </>
            )}
        </div>
    );

    return (
        <div style={styles.container}>
            <Toaster position="top-center" richColors />

            {/* Header */}
            <div style={styles.header}>
                <div style={styles.title}>
                    <div style={{
                        width: 44, height: 44,
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        borderRadius: 12,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <ClipboardList size={24} color="white" />
                    </div>
                    SCRC - Centro de Operaciones
                </div>
                {onClose && (
                    <button style={styles.closeBtn} onClick={onClose}>
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div style={styles.tabs}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        style={{ ...styles.tab, ...(activeTab === tab.id ? styles.activeTab : styles.inactiveTab) }}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <tab.icon size={18} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div style={styles.content}>
                {activeTab === 'orders' && <OrdersTab />}
                {activeTab === 'map' && <MapTab />}
                {activeTab === 'brigades' && <BrigadesTab />}
                {activeTab === 'autoassign' && <AutoAssignTab />}
                {activeTab === 'audit' && (
                    <div style={{ height: 'calc(100vh - 180px)' }}>
                        <SCRCAuditPanel />
                    </div>
                )}

                {activeTab === 'stats' && <StatsTab />}
            </div>
        </div>
    );
}
