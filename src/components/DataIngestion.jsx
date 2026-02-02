import React, { useState } from 'react';
import { Upload, FileText, Check, AlertCircle, DollarSign, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host';

const DataIngestion = () => {
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [stats, setStats] = useState(null);
    const [mode, setMode] = useState('assignment'); // 'assignment' | 'balance'

    const processFile = async (file) => {
        setIsUploading(true);
        setStats(null);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);

            let jsonData = [];

            if (mode === 'assignment') {
                // Prefer 'Asignacion' sheet, fallback to first sheet
                const targetSheetName = workbook.SheetNames.find(name =>
                    name.toLowerCase().includes('asignacion') ||
                    name.toLowerCase().includes('asignaciones')
                ) || workbook.SheetNames[0];

                console.log('📊 Using sheet:', targetSheetName, 'from', workbook.SheetNames);
                const worksheet = workbook.Sheets[targetSheetName];
                jsonData = XLSX.utils.sheet_to_json(worksheet);
            } else {
                // For Balance/Payments, usually on the first sheet or specific name
                // We'll just take the first sheet for now as standard format
                const firstSheet = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheet];
                jsonData = XLSX.utils.sheet_to_json(worksheet);
            }

            if (jsonData.length === 0) {
                toast.error('El archivo parece estar vacío');
                setIsUploading(false);
                return;
            }

            const token = localStorage.getItem('token');
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };

            let result;

            if (mode === 'assignment') {
                // --- ASSIGNMENT UPLOAD ---
                const response = await fetch(`${API_URL}/api/scrc/ingest`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ orders: jsonData })
                });
                result = await response.json();

                if (result.success) {
                    setStats(result);
                    toast.success(`Carga exitosa: ${result.count} órdenes procesadas`);
                } else {
                    throw new Error(result.error || 'Error en la carga');
                }

            } else {
                // --- BALANCE / PAYMENTS UPLOAD ---
                // Extract NICs
                const payments = jsonData
                    .map(row => row['NIC'] || row['nic'] || row['CUENTA'] || row['cuenta'])
                    .filter(nic => nic); // Remove empties

                if (payments.length === 0) {
                    throw new Error('No se encontraron columnas de NIC o CUENTA en el archivo');
                }

                console.log(`💸 Processing ${payments.length} payments/cancellations via Balanza`);

                const response = await fetch(`${API_URL}/api/scrc/update-debt`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ payments }) // Send array of NICs
                });
                result = await response.json();

                if (result.success) {
                    setStats({
                        type: 'balance',
                        cancelled_count: result.cancelled_count,
                        total_processed: payments.length
                    });
                    toast.success(`Balanza procesada: ${result.cancelled_count} órdenes canceladas`);
                } else {
                    throw new Error(result.error || 'Error al actualizar deuda');
                }
            }

        } catch (error) {
            console.error(error);
            toast.error('Error al procesar el archivo: ' + error.message);
        } finally {
            setIsUploading(false);
        }
    };

    const onDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
            processFile(file);
        } else {
            toast.error('Por favor sube un archivo Excel válido (.xlsx)');
        }
    };

    return (
        <div style={{ padding: '24px 32px', height: '100%', overflowY: 'auto', color: '#f8fafc' }}>
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>
                    {mode === 'assignment' ? 'Carga de Asignación' : 'Carga de Balanza (Pagos)'}
                </h1>
                <p style={{ color: '#94a3b8', marginTop: 4 }}>
                    {mode === 'assignment'
                        ? 'Sube el archivo de asignación de ISES para actualizar órdenes y cuadrillas'
                        : 'Sube el archivo de Balanza/Recaudos para cancelar órdenes pagadas automáticamente'
                    }
                </p>
            </div>

            {/* Mode Toggle */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
                <button
                    onClick={() => { setMode('assignment'); setStats(null); }}
                    style={{
                        padding: '12px 20px',
                        background: mode === 'assignment' ? '#3b82f6' : '#1e293b',
                        border: '1px solid',
                        borderColor: mode === 'assignment' ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        color: 'white',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'all 0.2s'
                    }}
                >
                    <FileSpreadsheet size={18} />
                    Asignación (Órdenes)
                </button>
                <button
                    onClick={() => { setMode('balance'); setStats(null); }}
                    style={{
                        padding: '12px 20px',
                        background: mode === 'balance' ? '#10b981' : '#1e293b',
                        border: '1px solid',
                        borderColor: mode === 'balance' ? '#10b981' : 'rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        color: 'white',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'all 0.2s'
                    }}
                >
                    <DollarSign size={18} />
                    Balanza (Pagos)
                </button>
            </div>

            <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                style={{
                    border: `2px dashed ${isDragging ? (mode === 'assignment' ? '#3b82f6' : '#10b981') : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 16,
                    padding: 48,
                    textAlign: 'center',
                    background: isDragging ? 'rgba(59, 130, 246, 0.05)' : '#1e293b',
                    transition: 'all 0.2s',
                    cursor: 'pointer'
                }}
            >
                <div style={{
                    width: 64, height: 64,
                    background: mode === 'assignment' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 16px'
                }}>
                    {isUploading ? (
                        <Upload className="animate-bounce" color={mode === 'assignment' ? "#3b82f6" : "#10b981"} size={32} />
                    ) : (
                        mode === 'assignment' ? <FileText color="#3b82f6" size={32} /> : <DollarSign color="#10b981" size={32} />
                    )}
                </div>

                <h3 style={{ color: '#f1f5f9', fontSize: 18, marginBottom: 8 }}>
                    {isUploading ? 'Procesando archivo...' : 'Arrastra tu archivo Excel aquí'}
                </h3>
                <p style={{ color: '#94a3b8', fontSize: 14, maxWidth: 400, margin: '0 auto 24px' }}>
                    {mode === 'assignment'
                        ? 'Requiere columnas: ORDEN, NIC, TECNICO, TIPO DE OS...'
                        : 'Requiere columna: NIC o CUENTA para cruce de pagos.'
                    }
                </p>

                <label style={{
                    background: mode === 'assignment' ? '#3b82f6' : '#10b981',
                    color: 'white', padding: '10px 20px', borderRadius: 8,
                    fontWeight: 600, cursor: 'pointer', display: 'inline-block'
                }}>
                    Seleccionar Archivo
                    <input type="file" accept=".xlsx, .xls" style={{ display: 'none' }} onChange={(e) => processFile(e.target.files[0])} />
                </label>
            </div>

            {/* Results Stats */}
            {stats && mode === 'assignment' && (
                <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                    <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                            <div style={{ padding: 8, background: 'rgba(16, 185, 129, 0.1)', borderRadius: 8 }}><Check size={18} color="#10b981" /></div>
                            <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>ÓRDENES CREADAS</span>
                        </div>
                        <span style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9' }}>{stats.count}</span>
                    </div>

                    <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                            <div style={{ padding: 8, background: 'rgba(59, 130, 246, 0.1)', borderRadius: 8 }}><Upload size={18} color="#3b82f6" /></div>
                            <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>CUADRILLAS ACTUALIZADAS</span>
                        </div>
                        <span style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9' }}>{stats.brigades_processed || 0}</span>
                    </div>

                    <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                            <div style={{ padding: 8, background: 'rgba(245, 158, 11, 0.1)', borderRadius: 8 }}><AlertCircle size={18} color="#f59e0b" /></div>
                            <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>OMITIDAS (ERROR)</span>
                        </div>
                        <span style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9' }}>{stats.skipped}</span>
                    </div>
                </div>
            )}

            {stats && mode === 'balance' && (
                <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                    <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                            <div style={{ padding: 8, background: 'rgba(16, 185, 129, 0.1)', borderRadius: 8 }}><Check size={18} color="#10b981" /></div>
                            <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>ÓRDENES CANCELADAS</span>
                        </div>
                        <span style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9' }}>{stats.cancelled_count}</span>
                    </div>
                    <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                            <div style={{ padding: 8, background: 'rgba(59, 130, 246, 0.1)', borderRadius: 8 }}><FileText size={18} color="#3b82f6" /></div>
                            <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>NICS PROCESADOS</span>
                        </div>
                        <span style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9' }}>{stats.total_processed}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DataIngestion;
