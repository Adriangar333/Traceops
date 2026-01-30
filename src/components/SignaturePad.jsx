import React, { useRef, useEffect, useState } from 'react';
import { X, RotateCcw, Check } from 'lucide-react';

/**
 * SignaturePad Component
 * Canvas-based signature capture without external dependencies
 */
const SignaturePad = ({ onSave, onCancel, width = 300, height = 200 }) => {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasSignature, setHasSignature] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        // Set up canvas for high DPI displays
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.scale(dpr, dpr);

        // Style
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw signature line
        ctx.beginPath();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        ctx.moveTo(20, height - 40);
        ctx.lineTo(width - 20, height - 40);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
    }, [width, height]);

    const getCoords = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();

        if (e.touches && e.touches[0]) {
            return {
                x: e.touches[0].clientX - rect.left,
                y: e.touches[0].clientY - rect.top
            };
        }
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    };

    const startDrawing = (e) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const coords = getCoords(e);

        ctx.beginPath();
        ctx.moveTo(coords.x, coords.y);
        setIsDrawing(true);
        setHasSignature(true);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        e.preventDefault();

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const coords = getCoords(e);

        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
    };

    const stopDrawing = (e) => {
        e?.preventDefault();
        setIsDrawing(false);
    };

    const clearSignature = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Redraw signature line
        ctx.beginPath();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        ctx.moveTo(20, height - 40);
        ctx.lineTo(width - 20, height - 40);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;

        setHasSignature(false);
    };

    const handleSave = () => {
        if (!hasSignature) return;

        const canvas = canvasRef.current;
        const dataUrl = canvas.toDataURL('image/png');
        // Remove data URL prefix to get pure base64
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
        onSave(base64);
    };

    return (
        <div style={{
            background: '#f8fafc',
            borderRadius: 16,
            padding: 16,
            maxWidth: '100%',
            border: '1px solid #e2e8f0'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12
            }}>
                <span style={{ color: '#64748b', fontSize: '0.9rem' }}>
                    Firma del cliente
                </span>
                <button
                    onClick={clearSignature}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: '0.8rem'
                    }}
                >
                    <RotateCcw size={14} /> Limpiar
                </button>
            </div>

            <canvas
                ref={canvasRef}
                style={{
                    borderRadius: 8,
                    touchAction: 'none',
                    cursor: 'crosshair',
                    display: 'block',
                    margin: '0 auto',
                    border: '1px solid #e2e8f0',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
                }}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
            />

            <div style={{
                display: 'flex',
                gap: 8,
                marginTop: 16
            }}>
                <button
                    onClick={onCancel}
                    style={{
                        flex: 1,
                        padding: '12px',
                        background: '#f1f5f9',
                        color: '#0f172a',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                    }}
                >
                    <X size={18} /> Cancelar
                </button>
                <button
                    onClick={handleSave}
                    disabled={!hasSignature}
                    style={{
                        flex: 1,
                        padding: '12px',
                        background: hasSignature ? '#9DBD39' : '#e2e8f0',
                        color: hasSignature ? 'white' : '#94a3b8',
                        border: 'none',
                        borderRadius: 8,
                        fontWeight: 600,
                        cursor: hasSignature ? 'pointer' : 'not-allowed',
                        opacity: hasSignature ? 1 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                    }}
                >
                    <Check size={18} /> Confirmar
                </button>
            </div>
        </div>
    );
};

export default SignaturePad;
