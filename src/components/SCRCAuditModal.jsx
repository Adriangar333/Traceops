import React, { useState } from 'react';
import { X, Check, AlertCircle, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host';

export default function SCRCAuditModal({ order, onClose, onUpdate }) {
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const [showRejectInput, setShowRejectInput] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [processing, setProcessing] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    if (!order) return null;

    const photos = order.evidence_photos || [];
    const hasPhotos = photos.length > 0;

    const handleAudit = async (status) => {
        if (status === 'rejected' && !rejectionReason.trim()) {
            toast.error('Debes ingresar un motivo para rechazar');
            return;
        }

        setProcessing(true);
        try {
            const res = await fetch(`${API_BASE}/api/scrc/orders/${order.id}/audit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status,
                    reason: status === 'rejected' ? rejectionReason : null,
                    auditor: 'Admin' // TODO: Get from auth context
                })
            });

            if (!res.ok) throw new Error('Failed to update status');

            toast.success(status === 'approved' ? 'Orden APROBADA' : 'Orden RECHAZADA');
            onUpdate();
            onClose();
        } catch (err) {
            console.error(err);
            toast.error('Error al actualizar estado');
        } finally {
            setProcessing(false);
        }
    };

    const nextPhoto = () => {
        if (hasPhotos) setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
    };

    const prevPhoto = () => {
        if (hasPhotos) setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className={`bg-[#1a1f2e] border border-gray-700 rounded-xl shadow-2xl flex flex-col ${isFullscreen ? 'w-full h-full' : 'w-full max-w-5xl h-[90vh]'}`}>

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-[#1e2330]">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            Auditoría de Orden #{order.order_number}
                            <span className={`px-2 py-0.5 text-xs rounded-full border ${order.audit_status === 'approved' ? 'bg-green-500/20 text-green-400 border-green-500/50' :
                                    order.audit_status === 'rejected' ? 'bg-red-500/20 text-red-400 border-red-500/50' :
                                        'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
                                }`}>
                                {order.audit_status?.toUpperCase() || 'PENDIENTE'}
                            </span>
                        </h2>
                        <p className="text-sm text-gray-400">{order.nic} - {order.client_name}</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg">
                            <Maximize2 size={20} />
                        </button>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-red-900/50 rounded-lg">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">

                    {/* Left: Photos */}
                    <div className="flex-1 bg-black/50 relative flex items-center justify-center p-4 min-h-[300px]">
                        {hasPhotos ? (
                            <>
                                <img
                                    src={photos[currentPhotoIndex]}
                                    alt={`Evidencia ${currentPhotoIndex + 1}`}
                                    className="max-h-full max-w-full object-contain rounded-lg shadow-lg"
                                />

                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 px-4 py-1 rounded-full text-white text-sm backdrop-blur-md">
                                    {currentPhotoIndex + 1} / {photos.length}
                                </div>

                                {photos.length > 1 && (
                                    <>
                                        <button onClick={prevPhoto} className="absolute left-4 p-2 bg-black/50 text-white rounded-full hover:bg-white/20 backdrop-blur-md transition-all">
                                            <ChevronLeft size={24} />
                                        </button>
                                        <button onClick={nextPhoto} className="absolute right-4 p-2 bg-black/50 text-white rounded-full hover:bg-white/20 backdrop-blur-md transition-all">
                                            <ChevronRight size={24} />
                                        </button>
                                    </>
                                )}
                            </>
                        ) : (
                            <div className="text-gray-500 flex flex-col items-center">
                                <AlertCircle size={48} className="mb-2 opacity-50" />
                                <p>No hay fotos disponibles</p>
                            </div>
                        )}
                    </div>

                    {/* Right: Details & Actions */}
                    <div className="w-full md:w-80 lg:w-96 bg-[#1a1f2e] border-l border-gray-700 flex flex-col overflow-y-auto">
                        <div className="p-4 space-y-4 flex-1">
                            {/* Execution Details */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Detalles de Ejecución</h3>
                                <div className="bg-gray-800/50 p-3 rounded-lg space-y-2 text-sm border border-gray-700">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Técnico:</span>
                                        <span className="text-white text-right">{order.technician_name || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Fecha:</span>
                                        <span className="text-white text-right">
                                            {order.execution_date ? new Date(order.execution_date).toLocaleString() : 'Pendiente'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Tipo:</span>
                                        <span className="text-yellow-400 text-right">{order.order_type?.toUpperCase()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Lectura:</span>
                                        <span className="text-white text-right font-mono">{order.meter_reading || 'No registrada'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Location */}
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Ubicación</h3>
                                <p className="text-sm text-gray-300 bg-gray-800/30 p-2 rounded">{order.address}, {order.neighborhood}</p>
                            </div>

                            {/* Notes */}
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Observaciones Técnico</h3>
                                <p className="text-sm text-gray-300 bg-gray-800/30 p-2 rounded italic">
                                    "{order.notes || 'Sin observaciones'}"
                                </p>
                            </div>
                        </div>

                        {/* Audit Actions */}
                        <div className="p-4 border-t border-gray-700 bg-[#1e2330] space-y-3">
                            {order.audit_status === 'pending' || order.audit_status === null ? (
                                <>
                                    {!showRejectInput ? (
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => setShowRejectInput(true)}
                                                disabled={processing}
                                                className="flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 text-red-400 border border-red-500/50 rounded-lg hover:bg-red-500/20 transition-all font-medium disabled:opacity-50"
                                            >
                                                <X size={18} /> Rechazar
                                            </button>
                                            <button
                                                onClick={() => handleAudit('approved')}
                                                disabled={processing}
                                                className="flex items-center justify-center gap-2 px-4 py-3 bg-green-500/10 text-green-400 border border-green-500/50 rounded-lg hover:bg-green-500/20 transition-all font-medium disabled:opacity-50"
                                            >
                                                <Check size={18} /> Aprobar
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                                            <label className="text-xs text-red-400 font-medium ml-1">Motivo del rechazo:</label>
                                            <textarea
                                                value={rejectionReason}
                                                onChange={(e) => setRejectionReason(e.target.value)}
                                                placeholder="Ej: Foto borrosa, medidor ilegible..."
                                                className="w-full bg-black/30 border border-red-500/30 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-red-500 resize-none h-24"
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setShowRejectInput(false)}
                                                    className="flex-1 py-2 text-gray-400 hover:text-white text-sm"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    onClick={() => handleAudit('rejected')}
                                                    disabled={processing || !rejectionReason.trim()}
                                                    className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 text-sm font-medium"
                                                >
                                                    Confirmar Rechazo
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className={`p-3 rounded-lg text-center border ${order.audit_status === 'approved' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
                                    }`}>
                                    <p className="font-bold flex items-center justify-center gap-2">
                                        {order.audit_status === 'approved' ? <Check size={16} /> : <X size={16} />}
                                        {order.audit_status === 'approved' ? 'APROBADA' : 'RECHAZADA'}
                                    </p>
                                    {order.rejection_reason && (
                                        <p className="text-xs mt-1 opacity-80">"{order.rejection_reason}"</p>
                                    )}
                                    <p className="text-[10px] mt-2 text-gray-500 uppercase">
                                        Auditado por {order.audited_by || 'Admin'} • {new Date(order.audited_at).toLocaleDateString()}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
