import React from 'react';
import { Boxes, Construction } from 'lucide-react';

const InventoryPage = () => {
    return (
        <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64748b',
            background: '#0f172a'
        }}>
            <div style={{
                width: 80, height: 80,
                background: 'rgba(99, 102, 241, 0.1)',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 24
            }}>
                <Boxes size={40} color="#6366f1" />
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>Gestión de Inventario</h2>
            <p style={{ maxWidth: 400, textAlign: 'center', marginBottom: 32 }}>Este módulo permitirá gestionar el stock de productos, almacenes y movimientos en tiempo real.</p>

            <div style={{
                padding: '12px 24px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 50,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                border: '1px solid rgba(255,255,255,0.1)'
            }}>
                <Construction size={16} />
                Próximamente disponible
            </div>
        </div>
    );
};

export default InventoryPage;
