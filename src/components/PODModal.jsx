import React, { useState, useEffect } from 'react';
import { X, Camera, MapPin, AlertTriangle, CheckCircle2, Loader2, WifiOff } from 'lucide-react';
import SignaturePad from './SignaturePad';
import { capturePhoto, getCurrentLocation, validateGeofence, submitPOD } from '../utils/podService';
import { isOnline, queueDelivery, getPendingCount } from '../utils/offlineSyncService';

/**
 * POD Modal - Complete delivery with proof
 * Requires: Photo + Signature + Geofence validation
 */
const PODModal = ({
    isOpen,
    onClose,
    onComplete,
    waypoint,
    waypointIndex,
    routeId,
    driverId,
    driverName, // New prop
    operationType = 'Entrega' // New prop or default
}) => {
    const [step, setStep] = useState('location'); // location, photo, signature, submitting
    const [photo, setPhoto] = useState(null);
    const [signature, setSignature] = useState(null);
    const [location, setLocation] = useState(null);
    const [geofenceResult, setGeofenceResult] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    // Check location on modal open
    useEffect(() => {
        if (isOpen) {
            checkLocation();
        } else {
            // Reset state when closed
            setStep('location');
            setPhoto(null);
            setSignature(null);
            setLocation(null);
            setGeofenceResult(null);
            setError(null);
        }
    }, [isOpen]);

    const checkLocation = async () => {
        setIsLoading(true);
        setError(null);

        const currentLocation = await getCurrentLocation();

        if (!currentLocation) {
            setError('No se pudo obtener tu ubicación. Activa el GPS.');
            setIsLoading(false);
            return;
        }

        setLocation(currentLocation);

        const result = validateGeofence(currentLocation, waypoint, 150); // 150m tolerance
        setGeofenceResult(result);

        if (result.isWithinRange) {
            setStep('photo');
        }

        setIsLoading(false);
    };

    const handleTakePhoto = async () => {
        setIsLoading(true);
        setError(null);

        try {
            // Prepare metadata for watermark
            const metadata = {
                driverName: driverName || 'Técnico',
                operationType: operationType,
                address: waypoint?.address || 'Ubicación desconocida',
                location: location || { lat: 0, lng: 0 } // Use current confirmed location
            };

            const photoData = await capturePhoto(metadata);

            if (photoData) {
                setPhoto(photoData);
                setStep('signature');
            }
        } catch (err) {
            console.error(err);
            setError('Error al tomar la foto. Intenta de nuevo.');
        }

        setIsLoading(false);
    };

    const handleSignatureSave = (signatureData) => {
        setSignature(signatureData);
        handleSubmit(signatureData);
    };

    const handleSubmit = async (signatureData) => {
        setStep('submitting');
        setIsLoading(true);

        const podData = {
            routeId,
            waypointIndex,
            driverId,
            photo,
            signature: signatureData,
            location
        };

        // Check if online before attempting to submit
        if (!isOnline()) {
            console.log('📵 Offline - queuing delivery for later sync');
            const queued = queueDelivery(podData);
            if (queued) {
                setError('Sin conexión. Entrega guardada para sincronizar después.');
            } else {
                setError('Error al guardar localmente.');
            }
            setIsLoading(false);
            // Still mark as complete locally
            setTimeout(() => onComplete(waypointIndex), 1500);
            return;
        }

        // Online - attempt to submit
        const success = await submitPOD(podData);

        if (success) {
            onComplete(waypointIndex);
        } else {
            // Submission failed even though online - queue for retry
            const queued = queueDelivery(podData);
            if (queued) {
                setError('Error de red. Guardado para sincronizar después.');
            } else {
                setError('Error al enviar y guardar.');
            }
            // Still mark as complete locally since we have the data saved
            setTimeout(() => onComplete(waypointIndex), 1500);
        }

        setIsLoading(false);
    };

    const skipGeofence = () => {
        // Allow skipping with warning (for demo/testing)
        setStep('photo');
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
        }}>
            <div style={{
                background: '#ffffff',
                borderRadius: 16,
                width: '100%',
                maxWidth: 400,
                maxHeight: '90vh',
                overflow: 'auto',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.1rem' }}>
                        Confirmar Entrega
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            padding: 4
                        }}
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: 16 }}>
                    {/* Progress Steps */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: 8,
                        marginBottom: 24
                    }}>
                        {['location', 'photo', 'signature'].map((s, i) => (
                            <div
                                key={s}
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: step === s ||
                                        (s === 'location' && step !== 'location') ||
                                        (s === 'photo' && (step === 'signature' || step === 'submitting'))
                                        ? '#9DBD39' : '#e2e8f0'
                                }}
                            />
                        ))}
                    </div>

                    {/* Location Step */}
                    {step === 'location' && (
                        <div style={{ textAlign: 'center' }}>
                            {isLoading ? (
                                <>
                                    <Loader2 size={48} className="animate-spin" style={{ color: '#9DBD39', margin: '0 auto 16px' }} />
                                    <p style={{ color: '#64748b' }}>Verificando ubicación...</p>
                                </>
                            ) : geofenceResult && !geofenceResult.isWithinRange ? (
                                <>
                                    <AlertTriangle size={48} style={{ color: '#f59e0b', margin: '0 auto 16px' }} />
                                    <p style={{ color: '#0f172a', fontWeight: 600, marginBottom: 8 }}>
                                        Estás a {geofenceResult.distance}m del destino
                                    </p>
                                    <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: 16 }}>
                                        Debes estar a menos de 150m para confirmar la entrega
                                    </p>
                                    <button
                                        onClick={checkLocation}
                                        style={{
                                            padding: '12px 24px',
                                            background: '#3b82f6',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: 8,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            marginRight: 8
                                        }}
                                    >
                                        <MapPin size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                        Verificar de nuevo
                                    </button>
                                    <button
                                        onClick={skipGeofence}
                                        style={{
                                            padding: '12px 16px',
                                            background: 'transparent',
                                            color: '#64748b',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: 8,
                                            cursor: 'pointer',
                                            fontSize: '0.85rem'
                                        }}
                                    >
                                        Continuar de todas formas
                                    </button>
                                </>
                            ) : error ? (
                                <>
                                    <AlertTriangle size={48} style={{ color: '#ef4444', margin: '0 auto 16px' }} />
                                    <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>
                                    <button
                                        onClick={checkLocation}
                                        style={{
                                            padding: '12px 24px',
                                            background: '#3b82f6',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: 8,
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Reintentar
                                    </button>
                                </>
                            ) : null}
                        </div>
                    )}

                    {/* Photo Step */}
                    {step === 'photo' && (
                        <div style={{ textAlign: 'center' }}>
                            {photo ? (
                                <>
                                    <img
                                        src={`data:image/jpeg;base64,${photo}`}
                                        alt="POD"
                                        style={{
                                            width: '100%',
                                            maxHeight: 200,
                                            objectFit: 'cover',
                                            borderRadius: 8,
                                            marginBottom: 16
                                        }}
                                    />
                                    <button
                                        onClick={() => setPhoto(null)}
                                        style={{
                                            padding: '10px 20px',
                                            background: '#f1f5f9',
                                            color: '#0f172a',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: 8,
                                            cursor: 'pointer',
                                            marginRight: 8
                                        }}
                                    >
                                        Tomar otra
                                    </button>
                                    <button
                                        onClick={() => setStep('signature')}
                                        style={{
                                            padding: '10px 20px',
                                            background: '#9DBD39',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: 8,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Continuar
                                    </button>
                                </>
                            ) : (
                                <>
                                    <Camera size={48} style={{ color: '#9DBD39', margin: '0 auto 16px' }} />
                                    <p style={{ color: '#0f172a', fontWeight: 600, marginBottom: 8 }}>
                                        Toma una foto de la entrega
                                    </p>
                                    <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: 24 }}>
                                        Incluye el paquete y el lugar de entrega
                                    </p>
                                    <button
                                        onClick={handleTakePhoto}
                                        disabled={isLoading}
                                        style={{
                                            padding: '14px 32px',
                                            background: '#3b82f6',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: 12,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            fontSize: '1rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 8,
                                            margin: '0 auto'
                                        }}
                                    >
                                        <Camera size={20} />
                                        {isLoading ? 'Abriendo cámara...' : 'Tomar Foto'}
                                    </button>
                                    {error && (
                                        <p style={{ color: '#ef4444', marginTop: 16, fontSize: '0.9rem' }}>{error}</p>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Signature Step */}
                    {step === 'signature' && (
                        <SignaturePad
                            onSave={handleSignatureSave}
                            onCancel={() => setStep('photo')}
                            width={Math.min(window.innerWidth - 64, 320)}
                            height={180}
                        />
                    )}

                    {/* Submitting Step */}
                    {step === 'submitting' && (
                        <div style={{ textAlign: 'center', padding: 32 }}>
                            {isLoading ? (
                                <>
                                    <Loader2 size={48} className="animate-spin" style={{ color: '#9DBD39', margin: '0 auto 16px' }} />
                                    <p style={{ color: '#0f172a' }}>Enviando prueba de entrega...</p>
                                </>
                            ) : error ? (
                                <>
                                    <CheckCircle2 size={48} style={{ color: '#f59e0b', margin: '0 auto 16px' }} />
                                    <p style={{ color: '#0f172a', marginBottom: 8 }}>Entrega registrada</p>
                                    <p style={{ color: '#64748b', fontSize: '0.85rem' }}>{error}</p>
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 size={48} style={{ color: '#9DBD39', margin: '0 auto 16px' }} />
                                    <p style={{ color: '#0f172a' }}>¡Entrega completada!</p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
            `}</style>
        </div>
    );
};

export default PODModal;
