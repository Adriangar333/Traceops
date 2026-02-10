import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, RefreshCw, CheckCircle, XCircle, Clock, Calendar, CheckSquare } from 'lucide-react';
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
            evidence {
                id
                type
                url
            }
        }
    }
`;

export default function SCRCAuditPanel() {
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [filters, setFilters] = useState({
        status: 'completed',
        audit_status: 'pending',
        technician: '',
        limit: 50
    });

    const { data, loading, error, refetch } = useQuery(GET_SCRC_ORDERS, {
        variables: {
            status: filters.status,
            auditStatus: filters.audit_status,
            technician: filters.technician,
            limit: filters.limit
        },
        fetchPolicy: 'network-only' // Ensure fresh data on mount/refetch
    });

    const orders = data?.scrcOrders || [];

    useEffect(() => {
        if (error) {
            console.error('Error fetching audit orders:', error);
            toast.error('Error al cargar órdenes para auditoría');
        }
    }, [error]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'approved': return 'text-green-400 bg-green-500/10 border-green-500/30';
            case 'rejected': return 'text-red-400 bg-red-500/10 border-red-500/30';
            default: return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
        }
    };

    return (
        <div className="h-full flex flex-col bg-[#111827] text-gray-100">
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-800 bg-[#1f2937] flex flex-wrap items-center gap-4 justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                        <CheckSquare size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Auditoría de Calidad (GraphQL)</h1>
                        <p className="text-xs text-gray-400">Revisión de evidencia fotográfica y ejecución</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => refetch()}
                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                        title="Actualizar"
                    >
                        <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                    </button>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                        <input
                            type="text"
                            placeholder="Buscar técnico..."
                            value={filters.technician}
                            onChange={(e) => setFilters(prev => ({ ...prev, technician: e.target.value }))}
                            className="pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500 w-48"
                        />
                    </div>

                    <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
                        <button
                            onClick={() => setFilters(prev => ({ ...prev, audit_status: 'pending' }))}
                            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${filters.audit_status === 'pending' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'
                                }`}
                        >
                            Pendientes
                        </button>
                        <button
                            onClick={() => setFilters(prev => ({ ...prev, audit_status: 'approved' }))}
                            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${filters.audit_status === 'approved' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'
                                }`}
                        >
                            Aprobadas
                        </button>
                        <button
                            onClick={() => setFilters(prev => ({ ...prev, audit_status: 'rejected' }))}
                            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${filters.audit_status === 'rejected' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'
                                }`}
                        >
                            Rechazadas
                        </button>
                    </div>
                </div>
            </div>

            {/* Grid Content */}
            <div className="flex-1 overflow-auto p-4 content-start">
                {orders.length === 0 && !loading ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-60">
                        <CheckSquare size={64} className="mb-4" strokeWidth={1} />
                        <p className="text-lg">No hay órdenes para auditar</p>
                        <p className="text-sm">Intenta cambiar los filtros</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {orders.map(order => (
                            <div
                                key={order.id}
                                onClick={() => setSelectedOrder(order)}
                                className="bg-[#1a1f2e] border border-gray-800 rounded-lg overflow-hidden hover:border-indigo-500/50 cursor-pointer transition-all group shadow-sm hover:shadow-indigo-500/10"
                            >
                                {/* Thumbnail */}
                                <div className="aspect-video bg-black/40 relative">
                                    {order.evidence && order.evidence.length > 0 && order.evidence[0].url ? (
                                        <img
                                            src={order.evidence[0].url}
                                            alt="Evidencia"
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-xs text-gray-500 flex-col gap-1">
                                            <XCircle size={20} />
                                            Sin Fotos
                                        </div>
                                    )}

                                    <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded text-xs text-white font-mono">
                                        {order.evidence?.length || 0} 📷
                                    </div>

                                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                                        <p className="text-white text-sm font-bold truncate">{order.nic}</p>
                                        <p className="text-gray-300 text-xs truncate">{order.clientName}</p>
                                    </div>
                                </div>

                                {/* Info */}
                                <div className="p-3 space-y-2">
                                    <div className="flex justify-between items-start">
                                        <div className="text-xs text-gray-400">
                                            <p className="font-semibold text-gray-300">{order.orderNumber}</p>
                                            <p>{new Date(order.executionDate || Date.now()).toLocaleDateString()}</p>
                                        </div>
                                        <span className={`px-2 py-0.5 text-[10px] rounded border uppercase font-bold tracking-wider ${getStatusColor(order.auditStatus || 'pending')}`}>
                                            {order.auditStatus === 'approved' ? 'APROBADA' :
                                                order.auditStatus === 'rejected' ? 'RECHAZADA' : 'PENDIENTE'}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
                                        <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[10px]">
                                            {(order.technicianName || 'T')[0]}
                                        </div>
                                        <p className="text-xs text-gray-400 truncate flex-1">{order.technicianName || 'Sin Asignar'}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            {selectedOrder && (
                <SCRCAuditModal
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    onUpdate={() => refetch()}
                />
            )}
        </div>
    );
}
