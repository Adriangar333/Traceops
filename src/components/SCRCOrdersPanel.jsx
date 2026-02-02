import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, MapPin, Clock, User, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp, RefreshCw, Download, Eye, Truck } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host';

// Status badges with colors
const StatusBadge = ({ status }) => {
    const styles = {
        pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        completed: 'bg-green-500/20 text-green-400 border-green-500/30',
        cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
        failed: 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    };
    const labels = {
        pending: 'Pendiente',
        in_progress: 'En Progreso',
        completed: 'Completada',
        cancelled: 'Cancelada',
        failed: 'Fallida'
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs border ${styles[status] || styles.pending}`}>
            {labels[status] || status}
        </span>
    );
};

// Priority indicator
const PriorityIndicator = ({ priority }) => {
    const colors = {
        1: 'bg-red-500',
        2: 'bg-orange-500',
        3: 'bg-yellow-500',
        4: 'bg-green-500',
        5: 'bg-blue-500'
    };
    return (
        <div className={`w-2 h-2 rounded-full ${colors[priority] || 'bg-gray-500'}`}
            title={`Prioridad ${priority}`} />
    );
};

function SCRCOrdersPanel({ onSelectOrders, brigades = [], onClose }) {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('pending');
    const [filterBrigade, setFilterBrigade] = useState('');
    const [filterMunicipio, setFilterMunicipio] = useState('');
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);

    // Pagination
    const [page, setPage] = useState(0);
    const [totalOrders, setTotalOrders] = useState(0);
    const pageSize = 50;

    // Selection
    const [selectedOrders, setSelectedOrders] = useState(new Set());
    const [selectAll, setSelectAll] = useState(false);

    // Sorting
    const [sortField, setSortField] = useState('priority');
    const [sortDir, setSortDir] = useState('asc');

    // Stats
    const [stats, setStats] = useState({ pending: 0, completed: 0, total: 0 });

    // Unique values for filters
    const [uniqueMunicipios, setUniqueMunicipios] = useState([]);
    const [uniqueTechnicians, setUniqueTechnicians] = useState([]);

    // Load orders
    const loadOrders = async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                limit: pageSize,
                offset: page * pageSize
            });

            if (filterStatus) params.append('status', filterStatus);
            if (filterBrigade) params.append('technician_name', filterBrigade);
            if (filterMunicipio) params.append('municipio', filterMunicipio);
            if (filterDate) params.append('date', filterDate);

            const response = await fetch(`${API_URL}/api/scrc/orders?${params}`);
            const data = await response.json();

            if (data.orders) {
                setOrders(data.orders);
                setTotalOrders(data.total || data.orders.length);

                // Extract unique values for filters
                const municipios = [...new Set(data.orders.map(o => o.municipality).filter(Boolean))];
                const techs = [...new Set(data.orders.map(o => o.technician_name).filter(Boolean))];
                setUniqueMunicipios(municipios);
                setUniqueTechnicians(techs);
            }
        } catch (err) {
            console.error('Error loading orders:', err);
            setError('Error cargando órdenes');
            toast.error('Error cargando órdenes SCRC');
        } finally {
            setLoading(false);
        }
    };

    // Load stats
    const loadStats = async () => {
        try {
            const response = await fetch(`${API_URL}/api/scrc/stats`);
            const data = await response.json();
            if (data) {
                setStats({
                    pending: data.pending || 0,
                    completed: data.completed || 0,
                    total: data.total || 0,
                    in_progress: data.in_progress || 0,
                    cancelled: data.cancelled || 0
                });
            }
        } catch (err) {
            console.error('Error loading stats:', err);
        }
    };

    useEffect(() => {
        loadOrders();
        loadStats();
    }, [page, filterStatus, filterBrigade, filterMunicipio, filterDate]);

    // Filtered and sorted orders
    const filteredOrders = useMemo(() => {
        let result = [...orders];

        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(o =>
                o.order_number?.toLowerCase().includes(term) ||
                o.nic?.toLowerCase().includes(term) ||
                o.client_name?.toLowerCase().includes(term) ||
                o.address?.toLowerCase().includes(term)
            );
        }

        // Sort
        result.sort((a, b) => {
            let aVal = a[sortField];
            let bVal = b[sortField];
            if (typeof aVal === 'string') aVal = aVal?.toLowerCase() || '';
            if (typeof bVal === 'string') bVal = bVal?.toLowerCase() || '';
            if (sortDir === 'asc') return aVal > bVal ? 1 : -1;
            return aVal < bVal ? 1 : -1;
        });

        return result;
    }, [orders, searchTerm, sortField, sortDir]);

    // Toggle selection
    const toggleSelect = (orderId) => {
        setSelectedOrders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(orderId)) newSet.delete(orderId);
            else newSet.add(orderId);
            return newSet;
        });
    };

    // Select all visible
    const toggleSelectAll = () => {
        if (selectAll) {
            setSelectedOrders(new Set());
        } else {
            setSelectedOrders(new Set(filteredOrders.map(o => o.id)));
        }
        setSelectAll(!selectAll);
    };

    // Send selected to map
    const handleAddToMap = () => {
        const selected = filteredOrders.filter(o => selectedOrders.has(o.id));
        if (selected.length === 0) {
            toast.warning('Selecciona al menos una orden');
            return;
        }

        // Convert to waypoints format
        const waypoints = selected
            .filter(o => o.latitude && o.longitude)
            .map(o => ({
                id: o.id,
                lat: parseFloat(o.latitude),
                lng: parseFloat(o.longitude),
                address: o.address,
                description: `${o.order_number} - ${o.client_name}`,
                orderData: o
            }));

        if (waypoints.length === 0) {
            toast.warning('Las órdenes seleccionadas no tienen coordenadas');
            return;
        }

        onSelectOrders(waypoints);
        toast.success(`${waypoints.length} orden(es) agregadas al mapa`);
    };

    // Column sort handler
    const handleSort = (field) => {
        if (sortField === field) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    };

    const SortIcon = ({ field }) => {
        if (sortField !== field) return null;
        return sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
    };

    return (
        <div className="bg-gray-900/95 backdrop-blur-sm rounded-xl border border-gray-700 flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-700">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                            <Truck size={20} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">Órdenes SCRC</h2>
                            <p className="text-xs text-gray-400">
                                {totalOrders} órdenes | {selectedOrders.size} seleccionadas
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
                        <XCircle size={20} className="text-gray-400" />
                    </button>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-5 gap-2 mb-4">
                    <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-white">{stats.total}</div>
                        <div className="text-xs text-gray-400">Total</div>
                    </div>
                    <div className="bg-yellow-500/10 rounded-lg p-2 text-center border border-yellow-500/20">
                        <div className="text-lg font-bold text-yellow-400">{stats.pending}</div>
                        <div className="text-xs text-yellow-400/70">Pendientes</div>
                    </div>
                    <div className="bg-blue-500/10 rounded-lg p-2 text-center border border-blue-500/20">
                        <div className="text-lg font-bold text-blue-400">{stats.in_progress || 0}</div>
                        <div className="text-xs text-blue-400/70">En Progreso</div>
                    </div>
                    <div className="bg-green-500/10 rounded-lg p-2 text-center border border-green-500/20">
                        <div className="text-lg font-bold text-green-400">{stats.completed}</div>
                        <div className="text-xs text-green-400/70">Completadas</div>
                    </div>
                    <div className="bg-red-500/10 rounded-lg p-2 text-center border border-red-500/20">
                        <div className="text-lg font-bold text-red-400">{stats.cancelled || 0}</div>
                        <div className="text-xs text-red-400/70">Canceladas</div>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-2">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar NIC, orden, cliente..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                        />
                    </div>

                    <select
                        value={filterStatus}
                        onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
                        className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    >
                        <option value="">Todos Estados</option>
                        <option value="pending">Pendientes</option>
                        <option value="in_progress">En Progreso</option>
                        <option value="completed">Completadas</option>
                        <option value="cancelled">Canceladas</option>
                    </select>

                    <select
                        value={filterBrigade}
                        onChange={(e) => { setFilterBrigade(e.target.value); setPage(0); }}
                        className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    >
                        <option value="">Todos Técnicos</option>
                        {uniqueTechnicians.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>

                    <select
                        value={filterMunicipio}
                        onChange={(e) => { setFilterMunicipio(e.target.value); setPage(0); }}
                        className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    >
                        <option value="">Todos Municipios</option>
                        {uniqueMunicipios.map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>

                    <input
                        type="date"
                        value={filterDate}
                        onChange={(e) => { setFilterDate(e.target.value); setPage(0); }}
                        className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    />

                    <button
                        onClick={() => { loadOrders(); loadStats(); }}
                        className="p-2 bg-gray-800 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
                        title="Refrescar"
                    >
                        <RefreshCw size={16} className={`text-gray-400 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center h-full text-red-400">
                        <AlertTriangle size={20} className="mr-2" />
                        {error}
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-800/50 sticky top-0">
                            <tr className="text-left text-gray-400 text-xs uppercase">
                                <th className="p-3">
                                    <input
                                        type="checkbox"
                                        checked={selectAll}
                                        onChange={toggleSelectAll}
                                        className="rounded bg-gray-700 border-gray-600"
                                    />
                                </th>
                                <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort('priority')}>
                                    <div className="flex items-center gap-1">P <SortIcon field="priority" /></div>
                                </th>
                                <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort('order_number')}>
                                    <div className="flex items-center gap-1">Orden <SortIcon field="order_number" /></div>
                                </th>
                                <th className="p-3">NIC</th>
                                <th className="p-3">Cliente</th>
                                <th className="p-3">Dirección</th>
                                <th className="p-3">Municipio</th>
                                <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort('technician_name')}>
                                    <div className="flex items-center gap-1">Técnico <SortIcon field="technician_name" /></div>
                                </th>
                                <th className="p-3">Tipo</th>
                                <th className="p-3">Estado</th>
                                <th className="p-3">GPS</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {filteredOrders.map(order => (
                                <tr
                                    key={order.id}
                                    className={`hover:bg-gray-800/50 transition-colors ${selectedOrders.has(order.id) ? 'bg-emerald-500/10' : ''}`}
                                >
                                    <td className="p-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedOrders.has(order.id)}
                                            onChange={() => toggleSelect(order.id)}
                                            className="rounded bg-gray-700 border-gray-600"
                                        />
                                    </td>
                                    <td className="p-3">
                                        <PriorityIndicator priority={order.priority} />
                                    </td>
                                    <td className="p-3 text-white font-mono text-xs">{order.order_number}</td>
                                    <td className="p-3 text-gray-300 font-mono text-xs">{order.nic}</td>
                                    <td className="p-3 text-gray-300 max-w-[150px] truncate" title={order.client_name}>
                                        {order.client_name}
                                    </td>
                                    <td className="p-3 text-gray-400 max-w-[200px] truncate" title={order.address}>
                                        {order.address}
                                    </td>
                                    <td className="p-3 text-gray-400">{order.municipality}</td>
                                    <td className="p-3 text-gray-300 max-w-[150px] truncate" title={order.technician_name}>
                                        {order.technician_name || '-'}
                                    </td>
                                    <td className="p-3">
                                        <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs">
                                            {order.order_type}
                                        </span>
                                    </td>
                                    <td className="p-3">
                                        <StatusBadge status={order.status} />
                                    </td>
                                    <td className="p-3">
                                        {order.latitude && order.longitude ? (
                                            <MapPin size={14} className="text-green-400" title="Con coordenadas" />
                                        ) : (
                                            <MapPin size={14} className="text-gray-600" title="Sin coordenadas" />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Footer with Pagination and Actions */}
            <div className="p-4 border-t border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setPage(Math.max(0, page - 1))}
                        disabled={page === 0}
                        className="px-3 py-1 bg-gray-800 rounded-lg text-sm text-gray-300 disabled:opacity-50 hover:bg-gray-700"
                    >
                        Anterior
                    </button>
                    <span className="text-sm text-gray-400">
                        Página {page + 1} de {Math.ceil(totalOrders / pageSize) || 1}
                    </span>
                    <button
                        onClick={() => setPage(page + 1)}
                        disabled={(page + 1) * pageSize >= totalOrders}
                        className="px-3 py-1 bg-gray-800 rounded-lg text-sm text-gray-300 disabled:opacity-50 hover:bg-gray-700"
                    >
                        Siguiente
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleAddToMap}
                        disabled={selectedOrders.size === 0}
                        className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                    >
                        <MapPin size={16} />
                        Agregar al Mapa ({selectedOrders.size})
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SCRCOrdersPanel;
