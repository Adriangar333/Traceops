import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Search, RefreshCw, CheckSquare, XCircle, Camera, MapPin, User, FileText, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import SCRCAuditModal from './SCRCAuditModal';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';

const GET_SCRC_ORDERS = gql`
    query GetSCRCOrders($status: String, $auditStatus: String, $technician: String, $limit: Int) {
        scrcOrders(status: $status, auditStatus: $auditStatus, technician: $technician, limit: $limit) {
            id
            orderNumber
            nic
            clientName
            technicianName
            executionDate
            auditStatus
            status
            notes
            address
            neighborhood
            orderType
            meterReading
            evidence {
                id
                type
                url
            }
        }
    }
`;

// Debounce hook
function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

export default function SCRCAuditPanel() {
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [searchInput, setSearchInput] = useState('');
    const [auditFilter, setAuditFilter] = useState('pending');
    const [page, setPage] = useState(1);
    const ITEMS_PER_PAGE = 20;

    // Debounce search to avoid querying on every keystroke
    const debouncedSearch = useDebounce(searchInput, 400);

    const { data, loading, error, refetch } = useQuery(GET_SCRC_ORDERS, {
        variables: {
            status: 'completed',
            auditStatus: auditFilter,
            technician: debouncedSearch || null,
            limit: 200
        },
        fetchPolicy: 'cache-and-network'
    });

    const allOrders = data?.scrcOrders || [];

    // Client-side filtering for instant feedback while debounce waits
    const filteredOrders = useMemo(() => {
        if (!searchInput || searchInput === debouncedSearch) return allOrders;
        const search = searchInput.toLowerCase();
        return allOrders.filter(o =>
            o.technicianName?.toLowerCase().includes(search) ||
            o.clientName?.toLowerCase().includes(search) ||
            o.nic?.toLowerCase().includes(search) ||
            o.orderNumber?.toLowerCase().includes(search)
        );
    }, [allOrders, searchInput, debouncedSearch]);

    // Pagination
    const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
    const paginatedOrders = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE;
        return filteredOrders.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredOrders, page]);

    // Reset page when filter changes
    useEffect(() => { setPage(1); }, [auditFilter, debouncedSearch]);

    useEffect(() => {
        if (error) {
            console.error('Error fetching audit orders:', error);
            toast.error('Error al cargar órdenes');
        }
    }, [error]);

    const getStatusStyles = (status) => {
        switch (status) {
            case 'approved': return 'bg-green-500/20 text-green-400 border-green-500/40';
            case 'rejected': return 'bg-red-500/20 text-red-400 border-red-500/40';
            default: return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
        }
    };

    const getStatusLabel = (status) => {
        switch (status) {
            case 'approved': return 'Aprobada';
            case 'rejected': return 'Rechazada';
            default: return 'Pendiente';
        }
    };

    // Stats
    const stats = useMemo(() => ({
        total: allOrders.length,
        withPhotos: allOrders.filter(o => o.evidence?.some(e => e.type === 'photo')).length,
        withSignature: allOrders.filter(o => o.evidence?.some(e => e.type === 'signature')).length
    }), [allOrders]);

    return (
        <div className="h-full flex flex-col bg-[#0f1419] text-gray-100">
            {/* Header */}
            <div className="flex-shrink-0 p-4 border-b border-gray-800/50 bg-[#1a1f2e]">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-500/20 rounded-xl">
                            <CheckSquare size={22} className="text-indigo-400" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-white">Auditoría de Calidad</h1>
                            <p className="text-xs text-gray-500">
                                {loading ? 'Cargando...' : `${filteredOrders.length} órdenes encontradas`}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Search with debounce */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                            <input
                                type="text"
                                placeholder="Buscar técnico, NIC, cliente..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                className="pl-9 pr-4 py-2 w-64 bg-gray-800/50 border border-gray-700/50 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                            />
                            {searchInput && (
                                <button
                                    onClick={() => setSearchInput('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                                >
                                    <XCircle size={14} />
                                </button>
                            )}
                        </div>

                        {/* Refresh */}
                        <button
                            onClick={() => refetch()}
                            disabled={loading}
                            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors disabled:opacity-50"
                            title="Actualizar"
                        >
                            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>

                {/* Filter tabs */}
                <div className="flex items-center gap-2 mt-4">
                    {[
                        { value: 'pending', label: 'Pendientes', color: 'yellow' },
                        { value: 'approved', label: 'Aprobadas', color: 'green' },
                        { value: 'rejected', label: 'Rechazadas', color: 'red' }
                    ].map(tab => (
                        <button
                            key={tab.value}
                            onClick={() => setAuditFilter(tab.value)}
                            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                                auditFilter === tab.value
                                    ? `bg-${tab.color}-500/20 text-${tab.color}-400 border border-${tab.color}-500/40`
                                    : 'text-gray-400 hover:text-white hover:bg-gray-700/30'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}

                    {/* Stats badges */}
                    <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                            <Camera size={12} /> {stats.withPhotos} con fotos
                        </span>
                        <span className="flex items-center gap-1">
                            <FileText size={12} /> {stats.withSignature} con firma
                        </span>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
                {loading && allOrders.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <Loader2 size={40} className="animate-spin text-indigo-500 mx-auto mb-4" />
                            <p className="text-gray-500">Cargando órdenes...</p>
                        </div>
                    </div>
                ) : filteredOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <CheckSquare size={48} className="mb-4 opacity-30" />
                        <p className="text-lg">No hay órdenes para auditar</p>
                        <p className="text-sm">Intenta cambiar los filtros o la búsqueda</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                        {paginatedOrders.map(order => {
                            const photoEvidence = order.evidence?.find(e => e.type === 'photo');
                            const hasSignature = order.evidence?.some(e => e.type === 'signature');
                            const photoCount = order.evidence?.filter(e => e.type === 'photo').length || 0;

                            return (
                                <div
                                    key={order.id}
                                    onClick={() => setSelectedOrder(order)}
                                    className="bg-[#1a1f2e] border border-gray-800/50 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/5 hover:-translate-y-0.5 group"
                                >
                                    {/* Image */}
                                    <div className="aspect-[4/3] bg-gray-900 relative overflow-hidden">
                                        {photoEvidence?.url ? (
                                            <img
                                                src={photoEvidence.url}
                                                alt="Evidencia"
                                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="flex items-center justify-center h-full">
                                                <div className="text-center text-gray-600">
                                                    <Camera size={24} className="mx-auto mb-1 opacity-50" />
                                                    <p className="text-xs">Sin foto</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Badges overlay */}
                                        <div className="absolute top-2 left-2 right-2 flex justify-between items-start">
                                            <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md border ${getStatusStyles(order.auditStatus)}`}>
                                                {getStatusLabel(order.auditStatus)}
                                            </span>
                                            <div className="flex gap-1">
                                                {photoCount > 0 && (
                                                    <span className="px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] text-white flex items-center gap-1">
                                                        <Camera size={10} /> {photoCount}
                                                    </span>
                                                )}
                                                {hasSignature && (
                                                    <span className="px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] text-white">
                                                        ✍️
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Bottom gradient */}
                                        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                                            <p className="text-white text-sm font-semibold truncate">{order.clientName || 'Sin cliente'}</p>
                                            <p className="text-gray-300 text-xs truncate flex items-center gap-1">
                                                <MapPin size={10} /> {order.address || order.neighborhood || 'Sin dirección'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Info */}
                                    <div className="p-3 space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-mono text-indigo-400">#{order.orderNumber}</span>
                                            <span className="text-[10px] text-gray-500">NIC: {order.nic}</span>
                                        </div>

                                        <div className="flex items-center gap-2 pt-2 border-t border-gray-800/50">
                                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white">
                                                {(order.technicianName || 'T')[0].toUpperCase()}
                                            </div>
                                            <p className="text-xs text-gray-400 truncate flex-1">{order.technicianName || 'Sin técnico'}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex-shrink-0 p-4 border-t border-gray-800/50 bg-[#1a1f2e] flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                        Mostrando {((page - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(page * ITEMS_PER_PAGE, filteredOrders.length)} de {filteredOrders.length}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="p-2 rounded-lg bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <span className="px-3 py-1 text-sm text-gray-300">
                            {page} / {totalPages}
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="p-2 rounded-lg bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* Modal */}
            {selectedOrder && (
                <SCRCAuditModal
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    onUpdate={() => {
                        refetch();
                        setSelectedOrder(null);
                    }}
                />
            )}
        </div>
    );
}
