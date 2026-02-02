/**
 * Technician Mobile App - Main View
 * "Mis Rutas" (My Routes) - Shows assigned orders for the day
 * 
 * Features:
 * - Offline-first with local SQLite
 * - Pull-to-refresh sync
 * - Order cards with status indicators
 * - Navigate to Google Maps
 */

import { useState, useEffect } from 'react';
import { dbService } from '../services/DatabaseService';
import { syncService } from '../services/SyncService';
import {
    MapPin, Navigation, Clock, DollarSign,
    RefreshCw, Wifi, WifiOff, CheckCircle, AlertCircle,
    Camera, Phone
} from 'lucide-react';

export default function TechnicianApp() {
    const [orders, setOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isOnline, setIsOnline] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [syncStatus, setSyncStatus] = useState(null);

    // Initialize services
    useEffect(() => {
        const init = async () => {
            try {
                await dbService.init();
                await syncService.init();

                // Subscribe to network changes
                syncService.onNetworkChange((online) => {
                    setIsOnline(online);
                });

                // Load orders
                await loadOrders();

            } catch (err) {
                console.error('Init error:', err);
            } finally {
                setIsLoading(false);
            }
        };

        init();
    }, []);

    // Load orders from local DB
    const loadOrders = async () => {
        const localOrders = await dbService.getOrders();
        setOrders(localOrders);

        const status = await syncService.getStatus();
        setSyncStatus(status);
    };

    // Sync with server
    const handleSync = async () => {
        setIsSyncing(true);
        try {
            await syncService.syncAll();
            await loadOrders();
        } finally {
            setIsSyncing(false);
        }
    };

    // Navigate to Google Maps
    const navigateToOrder = (order) => {
        if (order.lat && order.lng) {
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${order.lat},${order.lng}`, '_system');
        } else {
            // Use address if no coordinates
            const addr = encodeURIComponent(order.address);
            window.open(`https://www.google.com/maps/search/?api=1&query=${addr}`, '_system');
        }
    };

    // Open order detail
    const openOrder = (order) => {
        setSelectedOrder(order);
    };

    // Status color mapping
    const getStatusColor = (status) => {
        switch (status) {
            case 'completed': return '#10b981';
            case 'in_progress': return '#f59e0b';
            case 'pending': return '#6366f1';
            case 'failed': return '#ef4444';
            default: return '#94a3b8';
        }
    };

    // Status text mapping
    const getStatusText = (status) => {
        switch (status) {
            case 'completed': return 'Completada';
            case 'in_progress': return 'En Progreso';
            case 'pending': return 'Pendiente';
            case 'failed': return 'Fallida';
            default: return status;
        }
    };

    if (isLoading) {
        return (
            <div style={styles.loadingContainer}>
                <RefreshCw size={40} className="spin" />
                <p>Cargando rutas...</p>
            </div>
        );
    }

    // Order Detail View
    if (selectedOrder) {
        return (
            <OrderDetailView
                order={selectedOrder}
                onBack={() => setSelectedOrder(null)}
                onNavigate={navigateToOrder}
                onComplete={async () => {
                    await dbService.updateOrderStatus(selectedOrder.id, 'completed');
                    await loadOrders();
                    setSelectedOrder(null);
                }}
            />
        );
    }

    return (
        <div style={styles.container}>
            {/* Header */}
            <header style={styles.header}>
                <div style={styles.headerLeft}>
                    <h1 style={styles.title}>Mis Rutas</h1>
                    <span style={styles.subtitle}>{orders.length} órdenes asignadas</span>
                </div>
                <div style={styles.headerRight}>
                    {isOnline ? (
                        <Wifi size={20} color="#10b981" />
                    ) : (
                        <WifiOff size={20} color="#ef4444" />
                    )}
                    <button
                        style={styles.syncButton}
                        onClick={handleSync}
                        disabled={isSyncing || !isOnline}
                    >
                        <RefreshCw size={18} className={isSyncing ? 'spin' : ''} />
                    </button>
                </div>
            </header>

            {/* Sync Status Bar */}
            {syncStatus && syncStatus.pendingActions > 0 && (
                <div style={styles.syncBar}>
                    <AlertCircle size={16} color="#f59e0b" />
                    <span>{syncStatus.pendingActions} cambios pendientes de sincronizar</span>
                </div>
            )}

            {/* Orders List */}
            <div style={styles.ordersList}>
                {orders.length === 0 ? (
                    <div style={styles.emptyState}>
                        <MapPin size={48} color="#94a3b8" />
                        <p>No tienes órdenes asignadas</p>
                        <button style={styles.refreshBtn} onClick={handleSync}>
                            Actualizar
                        </button>
                    </div>
                ) : (
                    orders.map((order, index) => (
                        <div
                            key={order.id}
                            style={styles.orderCard}
                            onClick={() => openOrder(order)}
                        >
                            <div style={styles.orderHeader}>
                                <span style={styles.orderNumber}>#{order.order_number}</span>
                                <span style={{
                                    ...styles.statusBadge,
                                    backgroundColor: getStatusColor(order.status) + '20',
                                    color: getStatusColor(order.status)
                                }}>
                                    {getStatusText(order.status)}
                                </span>
                            </div>

                            <div style={styles.orderBody}>
                                <div style={styles.clientName}>{order.client_name}</div>
                                <div style={styles.address}>
                                    <MapPin size={14} />
                                    {order.address}
                                </div>
                                <div style={styles.orderMeta}>
                                    <span style={styles.metaItem}>
                                        <DollarSign size={14} />
                                        ${(order.amount_due || 0).toLocaleString()}
                                    </span>
                                    <span style={styles.metaItem}>
                                        <Clock size={14} />
                                        {order.order_type}
                                    </span>
                                </div>
                            </div>

                            <div style={styles.orderActions}>
                                <button
                                    style={styles.actionButton}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigateToOrder(order);
                                    }}
                                >
                                    <Navigation size={16} />
                                    Navegar
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// Order Detail View Component
function OrderDetailView({ order, onBack, onNavigate, onComplete }) {
    return (
        <div style={styles.container}>
            <header style={styles.detailHeader}>
                <button style={styles.backButton} onClick={onBack}>
                    ← Volver
                </button>
                <span style={styles.orderNumber}>#{order.order_number}</span>
            </header>

            <div style={styles.detailContent}>
                <div style={styles.detailSection}>
                    <h3>Cliente</h3>
                    <p style={styles.clientNameLarge}>{order.client_name}</p>
                    <p style={styles.nicLabel}>NIC: {order.nic}</p>
                </div>

                <div style={styles.detailSection}>
                    <h3>Dirección</h3>
                    <p>{order.address}</p>
                    <p>{order.neighborhood}, {order.municipality}</p>
                </div>

                <div style={styles.detailSection}>
                    <h3>Información de la Orden</h3>
                    <div style={styles.infoGrid}>
                        <div>
                            <span style={styles.infoLabel}>Tipo</span>
                            <span style={styles.infoValue}>{order.order_type}</span>
                        </div>
                        <div>
                            <span style={styles.infoLabel}>Deuda</span>
                            <span style={styles.infoValue}>${(order.amount_due || 0).toLocaleString()}</span>
                        </div>
                        <div>
                            <span style={styles.infoLabel}>Brigada</span>
                            <span style={styles.infoValue}>{order.brigade_type}</span>
                        </div>
                        <div>
                            <span style={styles.infoLabel}>Prioridad</span>
                            <span style={styles.infoValue}>{order.priority}</span>
                        </div>
                    </div>
                </div>

                <div style={styles.actionButtons}>
                    <button
                        style={{ ...styles.bigButton, backgroundColor: '#3b82f6' }}
                        onClick={() => onNavigate(order)}
                    >
                        <Navigation size={20} />
                        Navegar
                    </button>

                    <button
                        style={{ ...styles.bigButton, backgroundColor: '#10b981' }}
                        onClick={onComplete}
                    >
                        <CheckCircle size={20} />
                        Ejecutar Orden
                    </button>

                    <button
                        style={{ ...styles.bigButton, backgroundColor: '#6366f1' }}
                    >
                        <Camera size={20} />
                        Tomar Foto
                    </button>

                    <button
                        style={{ ...styles.bigButton, backgroundColor: '#22c55e' }}
                        onClick={() => window.open(`https://wa.me/57${order.phone || ''}`, '_system')}
                    >
                        <Phone size={20} />
                        WhatsApp
                    </button>
                </div>
            </div>
        </div>
    );
}

// Styles
const styles = {
    container: {
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        color: '#fff',
        fontFamily: 'Inter, system-ui, sans-serif'
    },
    loadingContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: '16px'
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        backgroundColor: '#1e293b',
        borderBottom: '1px solid #334155'
    },
    headerLeft: {
        display: 'flex',
        flexDirection: 'column'
    },
    headerRight: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
    },
    title: {
        fontSize: '20px',
        fontWeight: 700,
        margin: 0
    },
    subtitle: {
        fontSize: '13px',
        color: '#94a3b8'
    },
    syncButton: {
        background: 'transparent',
        border: '1px solid #475569',
        borderRadius: '8px',
        padding: '8px',
        cursor: 'pointer',
        color: '#fff'
    },
    syncBar: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 20px',
        backgroundColor: '#422006',
        borderBottom: '1px solid #78350f',
        fontSize: '13px',
        color: '#fbbf24'
    },
    ordersList: {
        padding: '16px'
    },
    emptyState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        gap: '16px',
        textAlign: 'center',
        color: '#94a3b8'
    },
    refreshBtn: {
        backgroundColor: '#3b82f6',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        padding: '12px 24px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer'
    },
    orderCard: {
        backgroundColor: '#1e293b',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '12px',
        border: '1px solid #334155',
        cursor: 'pointer'
    },
    orderHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
    },
    orderNumber: {
        fontSize: '14px',
        fontWeight: 700,
        color: '#60a5fa'
    },
    statusBadge: {
        fontSize: '11px',
        fontWeight: 600,
        padding: '4px 10px',
        borderRadius: '20px'
    },
    orderBody: {
        marginBottom: '12px'
    },
    clientName: {
        fontSize: '16px',
        fontWeight: 600,
        marginBottom: '6px'
    },
    address: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '13px',
        color: '#94a3b8',
        marginBottom: '8px'
    },
    orderMeta: {
        display: 'flex',
        gap: '16px'
    },
    metaItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '12px',
        color: '#64748b'
    },
    orderActions: {
        display: 'flex',
        gap: '8px'
    },
    actionButton: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: '#3b82f6',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        padding: '10px 16px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer'
    },
    // Detail View Styles
    detailHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '16px 20px',
        backgroundColor: '#1e293b',
        borderBottom: '1px solid #334155'
    },
    backButton: {
        background: 'transparent',
        border: 'none',
        color: '#60a5fa',
        fontSize: '15px',
        cursor: 'pointer'
    },
    detailContent: {
        padding: '20px'
    },
    detailSection: {
        marginBottom: '24px'
    },
    clientNameLarge: {
        fontSize: '20px',
        fontWeight: 700,
        margin: '8px 0'
    },
    nicLabel: {
        fontSize: '14px',
        color: '#94a3b8'
    },
    infoGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
        marginTop: '12px'
    },
    infoLabel: {
        display: 'block',
        fontSize: '12px',
        color: '#64748b',
        marginBottom: '4px'
    },
    infoValue: {
        fontSize: '15px',
        fontWeight: 600
    },
    actionButtons: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginTop: '32px'
    },
    bigButton: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        padding: '16px',
        fontSize: '16px',
        fontWeight: 600,
        border: 'none',
        borderRadius: '12px',
        color: '#fff',
        cursor: 'pointer'
    }
};
