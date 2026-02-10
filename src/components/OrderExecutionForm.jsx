/**
 * Order Execution Form
 * Formulario de cierre de orden con:
 * - Lectura del medidor
 * - Acción realizada (Suspendido/Cortado/Reconectado/No efectivo)
 * - Captura de evidencia fotográfica
 * - Observaciones
 */

import { useState, useRef, useEffect } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { dbService } from '../services/DatabaseService';
import {
    Camera as CameraIcon, Check, X, AlertTriangle,
    MapPin, Clock, Save, ChevronLeft
} from 'lucide-react';

// Action options based on order type
const ACTIONS = {
    'TO501': [ // Suspensión
        { value: 'suspended', label: 'Suspendido', color: '#f59e0b' },
        { value: 'not_found', label: 'No Encontrado', color: '#ef4444' },
        { value: 'paid', label: 'Cliente Pagó', color: '#10b981' },
        { value: 'inaccessible', label: 'Inaccesible', color: '#6366f1' }
    ],
    'TO502': [ // Corte
        { value: 'cut', label: 'Cortado', color: '#ef4444' },
        { value: 'not_found', label: 'No Encontrado', color: '#94a3b8' },
        { value: 'paid', label: 'Cliente Pagó', color: '#10b981' },
        { value: 'inaccessible', label: 'Inaccesible', color: '#6366f1' }
    ],
    'TO503': [ // Reconexión
        { value: 'reconnected', label: 'Reconectado', color: '#10b981' },
        { value: 'not_found', label: 'No Encontrado', color: '#94a3b8' },
        { value: 'technical_issue', label: 'Problema Técnico', color: '#f59e0b' }
    ],
    'default': [
        { value: 'completed', label: 'Completado', color: '#10b981' },
        { value: 'not_effective', label: 'No Efectivo', color: '#ef4444' }
    ]
};

// Reasons for non-effective
const NOT_EFFECTIVE_REASONS = [
    'No existe dirección',
    'Cliente pagó en sitio',
    'Medidor inaccesible',
    'Peligro eléctrico',
    'Cliente ausente',
    'Dirección incorrecta',
    'Orden duplicada',
    'Otro'
];

export default function OrderExecutionForm({ order, onComplete, onCancel }) {
    const [reading, setReading] = useState('');
    const [action, setAction] = useState(null);
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');
    const [photo, setPhoto] = useState(null);
    const [location, setLocation] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [showReasons, setShowReasons] = useState(false);

    const canvasRef = useRef(null);

    // Get current location on mount
    useEffect(() => {
        getCurrentLocation();
    }, []);

    const getCurrentLocation = async () => {
        try {
            const pos = await Geolocation.getCurrentPosition({
                enableHighAccuracy: true,
                timeout: 10000
            });
            setLocation({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy
            });
        } catch (err) {
            console.error('Geolocation error:', err);
            setError('No se pudo obtener ubicación GPS');
        }
    };

    // Get actions based on order type
    const getActions = () => {
        const orderType = order.order_type?.substring(0, 5) || 'default';
        return ACTIONS[orderType] || ACTIONS['default'];
    };

    // Take photo with camera
    const takePhoto = async () => {
        try {
            const image = await Camera.getPhoto({
                quality: 80,
                allowEditing: false,
                resultType: CameraResultType.DataUrl,
                source: CameraSource.Camera,
                width: 1280,
                height: 720
            });

            // Add watermark
            const watermarkedPhoto = await addWatermark(image.dataUrl);
            setPhoto(watermarkedPhoto);

        } catch (err) {
            console.error('Camera error:', err);
            if (err.message !== 'User cancelled photos app') {
                setError('Error al tomar foto');
            }
        }
    };

    // Add watermark to photo
    const addWatermark = async (dataUrl) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = canvasRef.current;
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');

                // Draw original image
                ctx.drawImage(img, 0, 0);

                // Watermark settings
                const now = new Date();
                const dateStr = now.toLocaleDateString('es-CO');
                const timeStr = now.toLocaleTimeString('es-CO');
                const coordStr = location
                    ? `GPS: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`
                    : 'GPS: No disponible';
                const orderStr = `Orden: ${order.order_number}`;
                const technicianStr = `Técnico: ${order.technician_name || 'No asignado'}`;

                // Semi-transparent background
                const padding = 10;
                const lineHeight = 24;
                const boxHeight = lineHeight * 6 + padding * 2; // Increased for technician line

                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.fillRect(0, img.height - boxHeight, img.width, boxHeight);

                // Text
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 18px Arial';
                ctx.textBaseline = 'top';

                let y = img.height - boxHeight + padding;
                ctx.fillText(`📅 ${dateStr}  ⏰ ${timeStr}`, padding, y);
                y += lineHeight;
                ctx.fillText(`📍 ${coordStr}`, padding, y);
                y += lineHeight;
                ctx.fillText(`📋 ${orderStr}`, padding, y);
                y += lineHeight;
                ctx.fillText(`🔌 ${nicStr}`, padding, y);
                y += lineHeight;
                ctx.fillText(`👤 ${technicianStr}`, padding, y);
                y += lineHeight;

                // Company watermark
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.font = 'bold 14px Arial';
                ctx.fillText('ISES/AFINIA - TraceOps Field Service', padding, y);

                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.src = dataUrl;
        });
    };

    // Handle action selection
    const handleActionSelect = (actionValue) => {
        setAction(actionValue);

        // Show reasons if not effective
        if (['not_found', 'not_effective', 'inaccessible'].includes(actionValue)) {
            setShowReasons(true);
        } else {
            setShowReasons(false);
            setReason('');
        }
    };

    // Signature Pad Functions
    const startDrawing = (e) => {
        isDrawing.current = true;
        const canvas = signaturePadRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();

        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;

        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const draw = (e) => {
        if (!isDrawing.current) return;
        const canvas = signaturePadRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();

        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;

        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = () => {
        if (!isDrawing.current) return;
        isDrawing.current = false;
        const canvas = signaturePadRef.current;
        setSignature(canvas.toDataURL());
    };

    const clearSignature = () => {
        const canvas = signaturePadRef.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setSignature(null);
    };

    // Validate form
    const isValid = () => {
        if (!action) return false;

        // Require photo for successful actions
        if (['suspended', 'cut', 'reconnected', 'completed'].includes(action)) {
            if (!photo) return false;
            // Require signature if action is completed/effective
            // if (!signature) return false; // Uncomment to make signature mandatory
        }

        // Require reason for non-effective
        if (showReasons && !reason) return false;

        return true;
    };

    // Submit form
    const handleSubmit = async () => {
        if (!isValid()) {
            setError('Complete todos los campos requeridos');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            // Save evidence to local DB
            const evidenceId = await dbService.saveEvidence({
                orderId: order.id,
                type: photo ? 'photo' : 'form',
                filePath: photo,
                signature: signature, // Save signature
                reading: reading,
                action: action,
                reason: reason,
                notes: notes,
                lat: location?.lat,
                lng: location?.lng
            });

            // Update order status
            const newStatus = ['suspended', 'cut', 'reconnected', 'completed'].includes(action)
                ? 'completed'
                : 'failed';

            await dbService.updateOrderStatus(order.id, newStatus);

            console.log(`✅ Order ${order.order_number} closed with action: ${action}`);

            onComplete(order.id, action);

        } catch (err) {
            console.error('Submit error:', err);
            setError('Error al guardar. Se reintentará automáticamente.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={styles.container}>

            {/* Hidden canvas for watermarking */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Header */}
            <header style={styles.header}>
                <button style={styles.backBtn} onClick={onCancel}>
                    <ChevronLeft size={20} />
                </button>
                <div>
                    <h2 style={styles.title}>Ejecutar Orden</h2>
                    <span style={styles.orderNum}>#{order.order_number}</span>
                </div>
            </header>

            <div style={styles.content}>
                {/* Order Info Summary */}
                <div style={styles.infoCard}>
                    <div style={styles.infoRow}>
                        <span style={styles.infoLabel}>Cliente:</span>
                        <span style={styles.infoValue}>{order.client_name}</span>
                    </div>
                    <div style={styles.infoRow}>
                        <span style={styles.infoLabel}>NIC:</span>
                        <span style={styles.infoValue}>{order.nic}</span>
                    </div>
                    <div style={styles.infoRow}>
                        <span style={styles.infoLabel}>Tipo:</span>
                        <span style={styles.infoValue}>{order.order_type}</span>
                    </div>
                </div>

                {/* GPS Status */}
                <div style={styles.gpsStatus}>
                    <MapPin size={16} color={location ? '#10b981' : '#ef4444'} />
                    <span style={{ color: location ? '#10b981' : '#ef4444' }}>
                        {location
                            ? `GPS: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)} (±${Math.round(location.accuracy)}m)`
                            : 'Obteniendo ubicación...'}
                    </span>
                </div>

                {/* Reading Input */}
                <div style={styles.section}>
                    <label style={styles.label}>Lectura del Medidor (opcional)</label>
                    <input
                        type="number"
                        value={reading}
                        onChange={(e) => setReading(e.target.value)}
                        placeholder="Ingrese lectura..."
                        style={styles.input}
                    />
                </div>

                {/* Action Selection */}
                <div style={styles.section}>
                    <label style={styles.label}>Acción Realizada *</label>
                    <div style={styles.actionGrid}>
                        {getActions().map((act) => (
                            <button
                                key={act.value}
                                style={{
                                    ...styles.actionBtn,
                                    backgroundColor: action === act.value ? act.color : '#1e293b',
                                    borderColor: action === act.value ? act.color : '#334155'
                                }}
                                onClick={() => handleActionSelect(act.value)}
                            >
                                {action === act.value ? <Check size={16} /> : null}
                                {act.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Reason (for non-effective) */}
                {showReasons && (
                    <div style={styles.section}>
                        <label style={styles.label}>Motivo *</label>
                        <select
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            style={styles.select}
                        >
                            <option value="">Seleccione motivo...</option>
                            {NOT_EFFECTIVE_REASONS.map((r) => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Photo Section */}
                <div style={styles.section}>
                    <label style={styles.label}>
                        Evidencia Fotográfica
                        {['suspended', 'cut', 'reconnected', 'completed'].includes(action) && ' *'}
                    </label>

                    {photo ? (
                        <div style={styles.photoPreview}>
                            <img src={photo} alt="Evidencia" style={styles.previewImg} />
                            <button
                                style={styles.retakeBtn}
                                onClick={() => setPhoto(null)}
                            >
                                Tomar otra
                            </button>
                        </div>
                    ) : (
                        <button style={styles.cameraBtn} onClick={takePhoto}>
                            <CameraIcon size={24} />
                            Tomar Foto
                        </button>
                    )}
                </div>

                {/* Notes */}
                <div style={styles.section}>
                    <label style={styles.label}>Observaciones</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Observaciones adicionales..."
                        style={styles.textarea}
                        rows={3}
                    />
                </div>

                {/* Signature Section */}
                {['suspended', 'cut', 'reconnected', 'completed'].includes(action) && (
                    <div style={styles.section}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <label style={styles.label}>Firma del Cliente</label>
                            <button
                                onClick={clearSignature}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#60a5fa',
                                    fontSize: '13px',
                                    cursor: 'pointer'
                                }}
                            >
                                Limpiar
                            </button>
                        </div>
                        <div style={{ backgroundColor: '#fff', borderRadius: '10px', overflow: 'hidden' }}>
                            <canvas
                                ref={signaturePadRef}
                                width={window.innerWidth - 80} // Approx width minus padding
                                height={200}
                                style={{ display: 'block' }}
                                onMouseDown={startDrawing}
                                onMouseMove={draw}
                                onMouseUp={stopDrawing}
                                onMouseLeave={stopDrawing}
                                onTouchStart={startDrawing}
                                onTouchMove={draw}
                                onTouchEnd={stopDrawing}
                            />
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div style={styles.errorBox}>
                        <AlertTriangle size={16} />
                        {error}
                    </div>
                )}

                {/* Submit Button */}
                <button
                    style={{
                        ...styles.submitBtn,
                        opacity: isValid() ? 1 : 0.5
                    }}
                    onClick={handleSubmit}
                    disabled={!isValid() || isSubmitting}
                >
                    {isSubmitting ? (
                        <>Guardando...</>
                    ) : (
                        <>
                            <Save size={20} />
                            Guardar y Cerrar Orden
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

// Styles
const styles = {
    container: {
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        color: '#fff'
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '16px 20px',
        backgroundColor: '#1e293b',
        borderBottom: '1px solid #334155'
    },
    backBtn: {
        background: 'transparent',
        border: 'none',
        color: '#60a5fa',
        cursor: 'pointer',
        padding: '8px'
    },
    title: {
        fontSize: '18px',
        fontWeight: 700,
        margin: 0
    },
    orderNum: {
        fontSize: '13px',
        color: '#60a5fa'
    },
    content: {
        padding: '20px'
    },
    infoCard: {
        backgroundColor: '#1e293b',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '16px',
        border: '1px solid #334155'
    },
    infoRow: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '8px'
    },
    infoLabel: {
        color: '#94a3b8',
        fontSize: '13px'
    },
    infoValue: {
        fontWeight: 600,
        fontSize: '14px'
    },
    gpsStatus: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 16px',
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        marginBottom: '20px',
        fontSize: '13px'
    },
    section: {
        marginBottom: '20px'
    },
    label: {
        display: 'block',
        fontSize: '13px',
        fontWeight: 600,
        color: '#94a3b8',
        marginBottom: '8px'
    },
    input: {
        width: '100%',
        padding: '14px 16px',
        backgroundColor: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '10px',
        color: '#fff',
        fontSize: '16px',
        boxSizing: 'border-box'
    },
    select: {
        width: '100%',
        padding: '14px 16px',
        backgroundColor: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '10px',
        color: '#fff',
        fontSize: '15px',
        boxSizing: 'border-box'
    },
    textarea: {
        width: '100%',
        padding: '14px 16px',
        backgroundColor: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '10px',
        color: '#fff',
        fontSize: '15px',
        resize: 'none',
        boxSizing: 'border-box'
    },
    actionGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '10px'
    },
    actionBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '14px',
        border: '2px solid',
        borderRadius: '10px',
        color: '#fff',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer'
    },
    cameraBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        width: '100%',
        padding: '20px',
        backgroundColor: '#1e293b',
        border: '2px dashed #475569',
        borderRadius: '12px',
        color: '#94a3b8',
        fontSize: '16px',
        cursor: 'pointer'
    },
    photoPreview: {
        position: 'relative'
    },
    previewImg: {
        width: '100%',
        borderRadius: '12px',
        border: '2px solid #10b981'
    },
    retakeBtn: {
        position: 'absolute',
        top: '10px',
        right: '10px',
        padding: '8px 16px',
        backgroundColor: 'rgba(0,0,0,0.7)',
        border: 'none',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '13px',
        cursor: 'pointer'
    },
    errorBox: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        backgroundColor: '#7f1d1d',
        borderRadius: '10px',
        marginBottom: '20px',
        fontSize: '14px',
        color: '#fecaca'
    },
    submitBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        width: '100%',
        padding: '18px',
        backgroundColor: '#10b981',
        border: 'none',
        borderRadius: '12px',
        color: '#fff',
        fontSize: '16px',
        fontWeight: 700,
        cursor: 'pointer',
        marginTop: '10px'
    }
};
