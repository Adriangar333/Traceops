import React, { useState, useEffect } from 'react';
import {
    Package, Archive, Repeat, Plus, Search,
    ArrowRight, ArrowDownCircle, ArrowUpCircle,
    TrendingUp, Boxes, ScanLine
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

// Helper for movement type
const MovementType = ({ type }) => {
    const config = {
        in: { icon: ArrowDownCircle, color: '#34d399', text: 'Entrada' },
        out: { icon: ArrowUpCircle, color: '#ef4444', text: 'Salida' },
        transfer: { icon: Repeat, color: '#60a5fa', text: 'Traslado' }
    };
    const c = config[type] || config.in;
    const Icon = c.icon;

    return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: c.color, fontSize: 13, fontWeight: 600 }}>
            <Icon size={16} /> {c.text}
        </span>
    );
};

const InventoryManagement = () => {
    const [activeTab, setActiveTab] = useState('products');
    const [products, setProducts] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [movements, setMovements] = useState([]);
    const [loading, setLoading] = useState(false);

    // UI States
    const [showProductModal, setShowProductModal] = useState(false);
    const [showMovementModal, setShowMovementModal] = useState(false);

    // Forms
    const [newProduct, setNewProduct] = useState({ sku: '', name: '', category: '', unit: 'unidad', min_stock: 5 });
    const [newMovement, setNewMovement] = useState({
        type: 'in',
        product_id: '',
        quantity: 1,
        from_warehouse_id: '',
        to_warehouse_id: '',
        reference: '',
        notes: ''
    });

    const categories = ['Materiales', 'Herramientas', 'EPP', 'Tecnología', 'Papelería'];

    const fetchData = async () => {
        setLoading(true);
        try {
            const headers = { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` };
            const baseUrl = import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host/api';

            const [pRes, wRes, mRes] = await Promise.all([
                fetch(`${baseUrl}/inventory/products`, { headers }),
                fetch(`${baseUrl}/inventory/warehouses`, { headers }),
                fetch(`${baseUrl}/inventory/movements`, { headers })
            ]);

            if (pRes.ok) setProducts(await pRes.json());
            if (wRes.ok) setWarehouses(await wRes.json());
            if (mRes.ok) setMovements(await mRes.json());

        } catch (error) {
            console.error('Error fetching inventory data:', error);
            toast.error('Error cargando inventario');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Handlers
    const handleCreateProduct = async () => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host/api'}/inventory/products`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify(newProduct)
            });

            if (!res.ok) throw new Error('Failed to create');

            toast.success('Producto creado');
            setShowProductModal(false);
            fetchData();
        } catch (error) {
            toast.error('Error al crear producto');
        }
    };

    const handleCreateMovement = async () => {
        // Validate required fields
        if (!newMovement.product_id) {
            toast.error('Selecciona un producto');
            return;
        }
        if (newMovement.type === 'in' && !newMovement.to_warehouse_id) {
            toast.error('Selecciona el almacén de destino');
            return;
        }
        if (newMovement.type === 'out' && !newMovement.from_warehouse_id) {
            toast.error('Selecciona el almacén de origen');
            return;
        }
        if (newMovement.type === 'transfer' && (!newMovement.from_warehouse_id || !newMovement.to_warehouse_id)) {
            toast.error('Selecciona origen y destino');
            return;
        }
        if (!newMovement.quantity || newMovement.quantity <= 0) {
            toast.error('La cantidad debe ser mayor a 0');
            return;
        }

        try {
            // Parse IDs to integers for PostgreSQL
            const payload = {
                ...newMovement,
                product_id: parseInt(newMovement.product_id),
                from_warehouse_id: newMovement.from_warehouse_id ? parseInt(newMovement.from_warehouse_id) : null,
                to_warehouse_id: newMovement.to_warehouse_id ? parseInt(newMovement.to_warehouse_id) : null,
                quantity: parseInt(newMovement.quantity)
            };

            const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host/api'}/inventory/movements`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || err.details || 'Error al registrar movimiento');
            }

            toast.success('Movimiento registrado');
            setShowMovementModal(false);
            setNewMovement({ type: 'in', product_id: '', quantity: 1, from_warehouse_id: '', to_warehouse_id: '', reference: '', notes: '' });
            fetchData();
        } catch (error) {
            toast.error(error.message);
        }
    };

    // Helper Components
    const TabButton = ({ id, label, icon: Icon }) => (
        <button
            onClick={() => setActiveTab(id)}
            style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 24px',
                background: activeTab === id ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                border: activeTab === id ? '1px solid #6366f1' : '1px solid transparent',
                borderRadius: 12,
                color: activeTab === id ? '#818cf8' : '#94a3b8',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontWeight: 600
            }}
        >
            <Icon size={18} />
            {label}
        </button>
    );

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0f172a', color: '#f8fafc' }}>
            {/* Header */}
            <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Boxes className="text-indigo-400" />
                        Control de Inventario
                    </h1>
                    <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>
                        Gestiona stock, almacenes y movimientos
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <TabButton id="products" label="Productos" icon={Package} />
                    <TabButton id="warehouses" label="Almacenes" icon={Archive} />
                    <TabButton id="movements" label="Movimientos" icon={Repeat} />
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, padding: 32, overflowY: 'auto' }}>

                {/* PRODUCTS TAB */}
                {activeTab === 'products' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
                            <button
                                onClick={() => setShowProductModal(true)}
                                style={{
                                    background: '#4f46e5', color: 'white', border: 'none',
                                    padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600
                                }}
                            >
                                <Plus size={18} /> Nuevo Producto
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
                            {products.map(product => (
                                <div key={product.id} style={{
                                    background: '#1e293b', borderRadius: 16, padding: 20,
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    display: 'flex', flexDirection: 'column', gap: 12
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                        <div style={{
                                            background: '#334155', width: 48, height: 48, borderRadius: 12,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 20
                                        }}>
                                            📦
                                        </div>
                                        <span style={{ fontSize: 12, background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 4, color: '#94a3b8' }}>
                                            {product.sku}
                                        </span>
                                    </div>

                                    <div>
                                        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: 0 }}>{product.name}</h3>
                                        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>{product.category}</p>
                                    </div>

                                    <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontSize: 13, color: '#94a3b8' }}>Stock Total</div>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: product.total_stock < product.min_stock ? '#f87171' : '#34d399' }}>
                                            {product.total_stock}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* WAREHOUSES TAB */}
                {activeTab === 'warehouses' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
                        {warehouses.map(wh => (
                            <div key={wh.id} style={{
                                background: '#1e293b', borderRadius: 16, padding: 24,
                                border: '1px solid rgba(255,255,255,0.05)',
                                position: 'relative', overflow: 'hidden'
                            }}>
                                <div style={{
                                    position: 'absolute', right: -20, top: -20, width: 100, height: 100,
                                    background: 'rgba(99, 102, 241, 0.1)', borderRadius: '50%'
                                }} />

                                <h3 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>{wh.name}</h3>
                                <p style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <TrendingUp size={16} /> {wh.location}
                                </p>

                                <span style={{
                                    display: 'inline-block', marginTop: 16,
                                    background: wh.type === 'main' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                    color: wh.type === 'main' ? '#60a5fa' : '#fbbf24',
                                    padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600
                                }}>
                                    {wh.type === 'main' ? 'Bodega Principal' : 'Móvil / Vehículo'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* MOVEMENTS TAB */}
                {activeTab === 'movements' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
                            <button
                                onClick={() => setShowMovementModal(true)}
                                style={{
                                    background: '#4f46e5', color: 'white', border: 'none',
                                    padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600
                                }}
                            >
                                <Repeat size={18} /> Registrar Movimiento
                            </button>
                        </div>

                        <div style={{ background: '#1e293b', borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ background: '#0f172a', color: '#94a3b8', fontSize: 13, textTransform: 'uppercase' }}>
                                    <tr>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Tipo</th>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Producto</th>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Cantidad</th>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Origen / Destino</th>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Fecha</th>
                                        <th style={{ padding: 16, textAlign: 'left' }}>Ref</th>
                                    </tr>
                                </thead>
                                <tbody style={{ color: '#e2e8f0', fontSize: 14 }}>
                                    {movements.map(mov => (
                                        <tr key={mov.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: 16 }}>
                                                <MovementType type={mov.type} />
                                            </td>
                                            <td style={{ padding: 16 }}>
                                                <div style={{ fontWeight: 600 }}>{mov.product_name}</div>
                                                <div style={{ fontSize: 12, color: '#94a3b8' }}>{mov.sku}</div>
                                            </td>
                                            <td style={{ padding: 16, fontWeight: 700 }}>{mov.quantity}</td>
                                            <td style={{ padding: 16, fontSize: 13, color: '#94a3b8' }}>
                                                {mov.type === 'in' && `B. ${mov.to_warehouse}`}
                                                {mov.type === 'out' && `De ${mov.from_warehouse}`}
                                                {mov.type === 'transfer' && `${mov.from_warehouse} ➔ ${mov.to_warehouse}`}
                                            </td>
                                            <td style={{ padding: 16 }}>{format(new Date(mov.created_at), 'dd/MM/yyyy HH:mm')}</td>
                                            <td style={{ padding: 16, color: '#64748b' }}>{mov.reference || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {/* MODAL: New Product */}
            {showProductModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
                }}>
                    <div style={{ background: '#1e293b', padding: 24, borderRadius: 16, width: 400, border: '1px solid rgba(255,255,255,0.1)' }}>
                        <h3 style={{ margin: '0 0 20px', color: '#f8fafc' }}>Nuevo Producto</h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <input
                                placeholder="SKU (Código único)"
                                value={newProduct.sku}
                                onChange={e => setNewProduct({ ...newProduct, sku: e.target.value.toUpperCase() })}
                                style={{ background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white' }}
                            />
                            <input
                                placeholder="Nombre del Producto"
                                value={newProduct.name}
                                onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                                style={{ background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white' }}
                            />
                            <select
                                value={newProduct.category}
                                onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}
                                style={{ background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white' }}
                            >
                                <option value="">Seleccionar Categoría</option>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <input
                                type="number"
                                placeholder="Stock Mínimo"
                                value={newProduct.min_stock}
                                onChange={e => setNewProduct({ ...newProduct, min_stock: parseInt(e.target.value) })}
                                style={{ background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white' }}
                            />

                            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                                <button onClick={() => setShowProductModal(false)} style={{ flex: 1, padding: 12, background: 'transparent', border: '1px solid #475569', color: '#94a3b8', borderRadius: 8, cursor: 'pointer' }}>Cancelar</button>
                                <button onClick={handleCreateProduct} style={{ flex: 1, padding: 12, background: '#4f46e5', border: 'none', color: 'white', borderRadius: 8, cursor: 'pointer' }}>Crear</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: New Movement */}
            {showMovementModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
                }}>
                    <div style={{ background: '#1e293b', padding: 24, borderRadius: 16, width: 450, border: '1px solid rgba(255,255,255,0.1)' }}>
                        <h3 style={{ margin: '0 0 20px', color: '#f8fafc' }}>Registrar Movimiento</h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Tabs for Type */}
                            <div style={{ display: 'flex', background: '#0f172a', padding: 4, borderRadius: 8 }}>
                                {['in', 'out', 'transfer'].map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setNewMovement({ ...newMovement, type })}
                                        style={{
                                            flex: 1, padding: '8px', border: 'none', borderRadius: 6,
                                            background: newMovement.type === type ? '#334155' : 'transparent',
                                            color: newMovement.type === type ? 'white' : '#64748b',
                                            cursor: 'pointer', fontWeight: 600, textTransform: 'capitalize'
                                        }}
                                    >
                                        {type === 'in' ? 'Entrada' : type === 'out' ? 'Salida' : 'Traslado'}
                                    </button>
                                ))}
                            </div>

                            <select
                                value={newMovement.product_id}
                                onChange={e => setNewMovement({ ...newMovement, product_id: e.target.value })}
                                style={{ background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white' }}
                            >
                                <option value="">Seleccionar Producto</option>
                                {products.map(p => <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>)}
                            </select>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                {newMovement.type !== 'in' && (
                                    <select
                                        value={newMovement.from_warehouse_id}
                                        onChange={e => setNewMovement({ ...newMovement, from_warehouse_id: e.target.value })}
                                        style={{ background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white' }}
                                    >
                                        <option value="">Origen</option>
                                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                    </select>
                                )}

                                {newMovement.type !== 'out' && (
                                    <select
                                        value={newMovement.to_warehouse_id}
                                        onChange={e => setNewMovement({ ...newMovement, to_warehouse_id: e.target.value })}
                                        style={{ background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white' }}
                                    >
                                        <option value="">Destino</option>
                                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                    </select>
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                                <input
                                    type="number"
                                    placeholder="Cant."
                                    value={newMovement.quantity}
                                    onChange={e => setNewMovement({ ...newMovement, quantity: parseInt(e.target.value) })}
                                    style={{ background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white' }}
                                />
                                <input
                                    placeholder="Referencia (opcional)"
                                    value={newMovement.reference}
                                    onChange={e => setNewMovement({ ...newMovement, reference: e.target.value })}
                                    style={{ background: '#0f172a', border: '1px solid #334155', padding: 12, borderRadius: 8, color: 'white' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                                <button onClick={() => setShowMovementModal(false)} style={{ flex: 1, padding: 12, background: 'transparent', border: '1px solid #475569', color: '#94a3b8', borderRadius: 8, cursor: 'pointer' }}>Cancelar</button>
                                <button onClick={handleCreateMovement} style={{ flex: 1, padding: 12, background: '#4f46e5', border: 'none', color: 'white', borderRadius: 8, cursor: 'pointer' }}>Registrar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryManagement;
