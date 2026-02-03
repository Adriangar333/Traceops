import React, { useState } from 'react';
import { Upload, FileSpreadsheet, Check, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host';

const DataIngestion = () => {
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [stats, setStats] = useState(null);

    const processFile = async (file) => {
        setIsUploading(true);
        setStats(null);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                toast.error('El archivo parece estar vacío');
                setIsUploading(false);
                return;
            }

            // Send to API
            const token = localStorage.getItem('token'); // Assuming auth

            const response = await fetch(`${API_URL}/api/scrc/ingest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ orders: jsonData })
            });

            const result = await response.json();

            if (result.success) {
                setStats(result);
                toast.success(`Carga exitosa: ${result.count} órdenes procesadas`);
            } else {
                throw new Error(result.error || 'Error en la carga');
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
        <div style={{ padding: '24px 32px', height: '100%', overflowY: 'auto' }}>
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Carga de Datos</h1>
                <p style={{ color: '#64748b', marginTop: 4 }}>Sube el archivo de asignación de ISES para actualizar órdenes y cuadrillas</p>
            </div>

            <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                style={{
                    border: `2px dashed ${isDragging ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 16,
                    padding: 48,
                    textAlign: 'center',
                    background: isDragging ? 'rgba(59, 130, 246, 0.05)' : '#1e293b',
                    transition: 'all 0.2s',
                    cursor: 'pointer'
                }}
            >
                <div style={{
                    width: 64, height: 64, background: 'rgba(59, 130, 246, 0.1)',
                    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 16px'
                }}>
                    {isUploading ? <Upload className="animate-bounce" color="#3b82f6" size={32} /> : <FileSpreadsheet color="#3b82f6" size={32} />}
                </div>

                <h3 style={{ color: '#f1f5f9', fontSize: 18, marginBottom: 8 }}>
                    {isUploading ? 'Procesando archivo...' : 'Arrastra tu archivo Excel aquí'}
                </h3>
                <p style={{ color: '#94a3b8', fontSize: 14, maxWidth: 400, margin: '0 auto 24px' }}>
                    Soporta archivos .xlsx y .xls. El archivo debe contener las columnas: ORDEN, NIC, TECNICO, TIPO DE OS, etc.
                </p>

                <label style={{
                    background: '#3b82f6', color: 'white', padding: '10px 20px', borderRadius: 8,
                    fontWeight: 600, cursor: 'pointer', display: 'inline-block'
                }}>
                    Seleccionar Archivo
                    <input type="file" accept=".xlsx, .xls" style={{ display: 'none' }} onChange={(e) => processFile(e.target.files[0])} />
                </label>
            </div>

            {/* Results Stats */}
            {stats && (
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
        </div>
    );
};

export default DataIngestion;
