/**
 * SCRC Tariff Configuration (Precios x Cantidad)
 * Defines the standard rates for field operations.
 */

// Derived from Requerimientos tecnicos.xlsx
const HOURLY_RATES = {
    'Brigada Pesada': 69724,
    'Brigada Liviana': 21468,
    'DEFAULT': 21468 // Assume Liviana by default
};

const OPERATION_TIMES_MIN = {
    'reconexion': 10,
    'corte': 15, // Promedio (10-20)
    'suspension': 20, // Promedio (10-30)
    'revision': 20,
    'default': 15
};

const TARIFFS = {
    // Keep legacy fixed prices if needed, otherwise rely on calc
    'TO502': { name: 'CORTE', category: 'corte' },
    'TO503': { name: 'RECONEXION', category: 'reconexion' },
    'TO501': { name: 'SUSPENSION', category: 'suspension' },
    'TO506': { name: 'REVISION', category: 'revision' }
};

// Calculate order value based on type, brigade, and status
const calculateOrderValue = (order) => {
    // Only completed orders usually count for PxQ
    if (order.status !== 'completed') return 0;

    const type = order.order_type ? order.order_type.toLowerCase() : 'default';
    const brigadeType = order.brigade_type || 'Brigada Liviana'; // Needs mapping from DB string

    // 1. Determine Rate based on Brigade
    // Map DB values (e.g. 'moto', 'carro') to Excel categories
    let rate = HOURLY_RATES['DEFAULT'];
    if (brigadeType.toLowerCase().includes('pesada') || brigadeType.toLowerCase().includes('canasta')) {
        rate = HOURLY_RATES['Brigada Pesada'];
    } else {
        rate = HOURLY_RATES['Brigada Liviana'];
    }

    // 2. Determine Time
    let minutes = OPERATION_TIMES_MIN[type] || OPERATION_TIMES_MIN['default'];
    if (type.includes('recone')) minutes = 10;
    else if (type.includes('suspen')) minutes = 20;

    // 3. Calculate Value
    // Value = (Minutes / 60) * Rate
    return Math.round((minutes / 60) * rate);
};

module.exports = {
    TARIFFS,
    calculateOrderValue
};
