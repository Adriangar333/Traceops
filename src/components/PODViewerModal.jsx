import React from 'react';
import { X, MapPin } from 'lucide-react';

const PODViewerModal = ({ isOpen, onClose, podData }) => {
    if (!isOpen || !podData) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
        }}>
            <div style={{
                background: '#1e293b',
                borderRadius: 16,
                width: '100%',
                maxWidth: 600,
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                animation: 'scaleIn 0.2s ease-out'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <h3 style={{ margin: 0, color: 'white', fontSize: '1.25rem' }}>Prueba de Entrega (POD)</h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            padding: 4,
                            borderRadius: 4
                        }}
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Photo */}
                    {podData.photoUrl ? (
                        <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <img
                                src={podData.photoUrl}
                                alt="Prueba de entrega"
                                style={{ width: '100%', height: 'auto', display: 'block' }}
                            />
                        </div>
                    ) : (
                        <div style={{ padding: 40, textAlign: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: 8, color: '#94a3b8' }}>
                            Sin foto disponible
                        </div>
                    )}

                    {/* Details */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        {podData.deliveredAt && (
                            <div style={{ background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8 }}>
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Fecha</div>
                                <div style={{ color: 'white', fontSize: '0.9rem' }}>
                                    {new Date(podData.deliveredAt).toLocaleString()}
                                </div>
                            </div>
                        )}
                        {podData.notes && (
                            <div style={{ background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8, gridColumn: '1 / -1' }}>
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>Notas</div>
                                <div style={{ color: 'white', fontSize: '0.9rem' }}>
                                    {podData.notes}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Signature */}
                    {podData.signatureUrl && (
                        <div style={{ marginTop: 0 }}>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 8 }}>Firma</div>
                            <div style={{
                                background: 'white',
                                borderRadius: 8,
                                padding: 10,
                                display: 'flex',
                                justifyContent: 'center'
                            }}>
                                <img
                                    src={podData.signatureUrl}
                                    alt="Firma"
                                    style={{ maxHeight: 100, maxWidth: '100%' }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <style>{`
                    @keyframes scaleIn {
                        from { transform: scale(0.95); opacity: 0; }
                        to { transform: scale(1); opacity: 1; }
                    }
                `}</style>
            </div>
        </div>
    );
};

export default PODViewerModal;
