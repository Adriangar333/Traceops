/**
 * SCRC Routing Engine
 * Motor de Ruteo para Suspensión, Corte, Reconexión y Cobro
 * 
 * Based on: Criterios Tecnicos SCR.xlsx
 * Uses DYNAMIC configuration from system_config table
 * Managed via SettingsPanel UI
 */

// Import dynamic configuration service
const { configService, DEFAULTS } = require('./configService');

// ==========================================
// FALLBACK CONFIGURATION (used if configService not initialized)
// ==========================================

// Brigade types with daily capacity (from Distribución Operativa - Criterios Tecnicos SCR.xlsx)
// Sector Norte: CANASTA, SCR LIVIANA, SCR MINI CANASTA, SCR PESADA, SCR PESADA DISPONIBILIDAD
// Sector Centro: CANASTA, SCR LIVIANA, SCR MINI CANASTA, SCR PESADA, SCR MULTIFAMILIAR, SCR MEDIDA ESPECIAL
const BRIGADE_CAPACITIES = {
    'CANASTA': 15,
    'SCR LIVIANA': 30,
    'SCR MINI CANASTA': 15,
    'SCR PESADA': 25,
    'SCR PESADA DISPONIBILIDAD': 22, // Average of 20-25
    'SCR PESADA ELITE': 22, // Average of 20-25
    'SCR MULTIFAMILIAR': 20, // Multifamily buildings
    'SCR MEDIDA ESPECIAL': 15 // LIVIANA variant
};

// Priority order for OS types (1 = highest priority)
// From: Criterios tecnicos SCR.xlsx - Matriz Técnica
const OS_PRIORITY = {
    'TO502': 1, // RECONEXIÓN SERVICIO MD - Highest priority (cliente pagó)
    'TO503': 2, // REVISIÓN DE SUSPENSIÓN MD
    'TO501': 3, // SUSPENSIÓN DEL SERVICIO MD
    'TO504': 4, // SUSPENSIÓN DEL SERVICIO MI/MS (Media Tensión)
    'TO506': 5  // REVISIÓN DE SUSPENSIÓN MI/MS
};

// Estimated times per work type (minutes)
// From: CRITERIOS_TECNICOS_SCR_RESUMEN.md - Tiempos de Operación
const ESTIMATED_TIMES = {
    'reconexion': 10,
    'bornera_cooperativo': 10,
    'bornera_agresivo': 20,
    'tendido_cooperativo': 15,
    'tendido_agresivo': 30,
    'radical_cooperativo': 20,
    'radical_agresivo': 35,
    'multifamiliar': 20,
    'cupon_pago': 20,
    'cobros': 15
};

// Patrones de vías URBANAS (en dirección)
// Criterio real usado por asignadores: tipo de vía determina urbano/rural
const PATRONES_URBANOS = [
    'CL ', 'CL.', 'CALLE',
    'CR ', 'CR.', 'CRA ', 'CRA.', 'CARRERA',
    'TV ', 'TV.', 'TRANSVERSAL',
    'DG ', 'DG.', 'DIAGONAL',
    'AV ', 'AV.', 'AVENIDA',
    'MZ ', 'MZ.', 'MANZANA',
    'URB ', 'URBANIZACION', 'URBANIZACIÓN',
    'CONJUNTO', 'EDIFICIO', 'TORRE', 'APTO', 'APARTAMENTO',
    'BARRIO', 'BRR ', 'BRR.'
];

// Patrones de vías RURALES (en dirección)
const PATRONES_RURALES = [
    'CARRETERA', 'VIA ', 'VÍA ',
    'KM ', 'KM.', 'KILOMETRO', 'KILÓMETRO',
    'VEREDA', 'VDA ', 'VDA.',
    'CORREGIMIENTO', 'CORREG ',
    'FINCA', 'PARCELA', 'HACIENDA',
    'LOTE RURAL', 'SECTOR RURAL',
    'CAMINO', 'TROCHA'
];

// Working hours (jornada laboral)
const JORNADA = {
    inicio: '07:00',
    fin: '17:00',
    duracion_horas: 10
};

// Alcance (Scope) to Brigade mapping from Matriz Técnica
const ALCANCE_BRIGADE_MATRIX = {
    'B': { // B - Bornera
        urban: ['SCR LIVIANA'],
        rural: ['SCR PESADA DISPONIBILIDAD']
    },
    'T': { // T - Tendido
        urban: ['SCR PESADA'],
        rural: ['SCR PESADA DISPONIBILIDAD']
    },
    'M': { // M - Multifamiliar
        urban: ['SCR PESADA DISPONIBILIDAD'],
        rural: ['SCR PESADA DISPONIBILIDAD']
    },
    'N': { // N - Minicanasta
        urban: ['SCR MINI CANASTA', 'CANASTA'], // CANASTA if DEUDA > 1'000.000
        rural: ['SCR PESADA DISPONIBILIDAD']
    },
    'D': { // D - Disponible
        urban: ['SCR PESADA DISPONIBILIDAD'],
        rural: ['SCR PESADA DISPONIBILIDAD']
    },
    'W': { // W - MT AT (Media/Alta Tensión)
        urban: ['SCR PESADA DISPONIBILIDAD'],
        rural: ['SCR PESADA DISPONIBILIDAD']
    },
    'E': { // E - Elite (Mercados Especiales)
        urban: ['SCR PESADA', 'SCR PESADA ELITE'],
        rural: ['SCR PESADA']
    },
    'C': { // C - Canasta
        urban: ['CANASTA'],
        rural: ['SCR PESADA DISPONIBILIDAD']
    },
    'X': { // X - Tendido Retiro Acometida
        urban: ['SCR PESADA'],
        rural: ['SCR PESADA DISPONIBILIDAD']
    },
    'Y': { // Y - Destruir Acometida / Multi-retiro Acometida
        urban: ['SCR PESADA'],
        rural: ['SCR PESADA DISPONIBILIDAD']
    },
    'F': { // F - Brigada FOR (TO503 only)
        urban: ['SCR PESADA DISPONIBILIDAD'],
        rural: ['SCR PESADA DISPONIBILIDAD']
    },
    'R': { // R - Remoto (medidores inteligentes, TO503 only)
        urban: ['SCR PESADA DISPONIBILIDAD'],
        rural: ['SCR PESADA DISPONIBILIDAD']
    }
};

// Alcance code descriptions for UI display
const ALCANCE_DESCRIPTIONS = {
    'B': 'Bornera - Suspensión/reconexión en bornera del medidor',
    'T': 'Tendido - Suspensión/reconexión en el tendido eléctrico',
    'N': 'Minicanasta - Requiere vehículo con mini canasta elevadora',
    'C': 'Canasta - Requiere vehículo con canasta elevadora completa',
    'M': 'Multifamiliar - Edificios o conjuntos residenciales',
    'W': 'MT AT - Media Tensión / Alta Tensión',
    'E': 'Elite - Mercados especiales (clientes prioritarios)',
    'X': 'Tendido Retiro Acometida - Suspensión con retiro físico',
    'Y': 'Destruir Acometida - Destrucción completa de la acometida',
    'D': 'Disponible - Requiere brigada con disponibilidad especial',
    'F': 'Brigada FOR - Fuerza operativa rápida',
    'R': 'Remoto - Gestión remota (medidores inteligentes)'
};

// ==========================================
// ROUTING ENGINE CLASS
// ==========================================

class RoutingEngine {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Get priority based on OS type (async for dynamic config)
     */
    async getPriority(osType) {
        const priorities = await configService.getOsPriority();
        return priorities[osType] || 5;
    }

    /**
     * Determine if an address is in a rural zone
     * Criterio real: tipo de vía en la dirección (CL, CR, TV = urbano | CARRETERA, VEREDA, KM = rural)
     * Uses DYNAMIC patterns from system_config table
     */
    static async esZonaRural(direccion, zona, zonePatterns = null) {
        const dir = (direccion || '').toUpperCase().trim();
        const zonaStr = (zona || '').toUpperCase();

        // Si la zona explícitamente dice RURAL, es rural
        if (zonaStr.includes('RURAL')) {
            return true;
        }

        // Si no hay dirección, asumir rural (más seguro)
        if (!dir) {
            return true;
        }

        // Get zone patterns from config (or use provided ones)
        const patterns = zonePatterns || await configService.getZonePatterns();

        // Primero verificar patrones RURALES (tienen prioridad)
        const esPatronRural = patterns.rural.some(patron => dir.includes(patron));
        if (esPatronRural) {
            return true;
        }

        // Luego verificar patrones URBANOS
        const esPatronUrbano = patterns.urban.some(patron => dir.includes(patron));
        if (esPatronUrbano) {
            return false;
        }

        // Por defecto, si no coincide con nada, asumir rural (más seguro)
        return true;
    }

    /**
     * Get estimated time for a work type
     */
    getEstimatedTime(alcanceCode, osType, clienteCooperativo = true) {
        if (osType === 'TO502') return ESTIMATED_TIMES.reconexion;

        const suffix = clienteCooperativo ? '_cooperativo' : '_agresivo';

        switch (alcanceCode) {
            case 'B': return ESTIMATED_TIMES[`bornera${suffix}`] || 15;
            case 'T':
            case 'X':
            case 'Y': return ESTIMATED_TIMES[`tendido${suffix}`] || 22;
            case 'M': return ESTIMATED_TIMES.multifamiliar;
            default: return ESTIMATED_TIMES[`radical${suffix}`] || 25;
        }
    }

    /**
     * Determine which brigade types can handle an order
     * Uses DYNAMIC config from system_config table
     */
    async getEligibleBrigades(order) {
        // Extract alcance code from strategic_line (e.g., "B - Bornera" -> "B")
        const strategicLine = order.strategic_line || order.linea_estrategica || '';
        const alcanceCode = strategicLine.charAt(0).toUpperCase();

        // Get dynamic config
        const [alcanceMatrix, zonePatterns, debtThreshold] = await Promise.all([
            configService.getAlcanceMatrix(),
            configService.getZonePatterns(),
            configService.getDebtThreshold()
        ]);

        // Determine if rural or urban based on ADDRESS (tipo de vía)
        const isRural = await RoutingEngine.esZonaRural(
            order.address || order.direccion,
            order.zone_code || order.zona,
            zonePatterns
        );

        const zoneType = isRural ? 'rural' : 'urban';

        // Get eligible brigades from DYNAMIC matrix
        const matrixEntry = alcanceMatrix[alcanceCode];
        if (!matrixEntry) {
            // Default to PESADA DISPONIBILIDAD for unknown alcance
            return ['SCR PESADA DISPONIBILIDAD'];
        }

        // Matrix can be string or array - normalize to array
        let eligibleBrigades = Array.isArray(matrixEntry[zoneType])
            ? [...matrixEntry[zoneType]]
            : [matrixEntry[zoneType]];

        // Special rule: N - Minicanasta with DEUDA > threshold requires CANASTA
        const deuda = order.amount_due || order.deuda || 0;
        if (alcanceCode === 'N' && deuda > debtThreshold) {
            eligibleBrigades = ['CANASTA'];
        }

        // Special rule: E - Elite for special markets gets SCR PESADA ELITE
        if (alcanceCode === 'E' && order.mercado_especial) {
            eligibleBrigades = ['SCR PESADA ELITE'];
        }

        return eligibleBrigades;
    }

    /**
     * Cluster orders by municipality/zone for geographic optimization
     */
    async clusterOrdersByZone() {
        const result = await this.pool.query(`
            SELECT 
                municipality,
                neighborhood,
                COUNT(*) as order_count,
                array_agg(id) as order_ids
            FROM scrc_orders
            WHERE status = 'pending'
            GROUP BY municipality, neighborhood
            ORDER BY order_count DESC
        `);
        return result.rows;
    }

    /**
     * Get available brigades with remaining capacity
     */
    async getAvailableBrigades() {
        // Get DYNAMIC brigade capacities from config
        const brigadeCapacities = await configService.getBrigadeCapacities();

        const result = await this.pool.query(`
            SELECT 
                b.*,
                COALESCE(
                    (SELECT COUNT(*) FROM scrc_orders 
                     WHERE assigned_brigade_id = b.id 
                     AND status IN ('assigned', 'in_progress')
                     AND DATE(assignment_date) = CURRENT_DATE
                    ), 0
                ) as orders_today
            FROM brigades b
            WHERE b.status = 'active'
        `);

        return result.rows.map(brigade => {
            const capacity = brigadeCapacities[brigade.type] || 20;
            return {
                ...brigade,
                capacity,
                remaining_capacity: capacity - brigade.orders_today
            };
        }).filter(b => b.remaining_capacity > 0);
    }

    /**
     * Assign orders to brigades based on capacity and eligibility
     */
    async autoAssign(options = {}) {
        const { maxOrders = 1000, dryRun = false } = options;

        const client = await this.pool.connect();
        const assignments = [];

        try {
            if (!dryRun) await client.query('BEGIN');

            // 1. Get pending orders sorted by priority
            const ordersResult = await client.query(`
                SELECT * FROM scrc_orders
                WHERE status = 'pending'
                ORDER BY priority ASC, amount_due DESC, created_at ASC
                LIMIT $1
            `, [maxOrders]);

            const orders = ordersResult.rows;

            // 2. Get available brigades
            const brigades = await this.getAvailableBrigades();

            // Create a map to track brigade assignments
            const brigadeAssignments = new Map();
            brigades.forEach(b => brigadeAssignments.set(b.id, {
                ...b,
                assigned: 0,
                orders: []
            }));

            // 3. Assign orders to brigades
            for (const order of orders) {
                const eligibleTypes = this.getEligibleBrigades(order);

                // Find best matching brigade with capacity
                let bestBrigade = null;
                for (const brigadeType of eligibleTypes) {
                    for (const [id, brigade] of brigadeAssignments) {
                        if (brigade.type === brigadeType &&
                            brigade.assigned < brigade.remaining_capacity) {
                            // Prefer brigades in same zone
                            if (!bestBrigade ||
                                brigade.current_zone === order.municipality) {
                                bestBrigade = brigade;
                            }
                        }
                    }
                    if (bestBrigade) break;
                }

                if (bestBrigade) {
                    bestBrigade.assigned++;
                    bestBrigade.orders.push(order.id);

                    assignments.push({
                        order_id: order.id,
                        order_number: order.order_number,
                        brigade_id: bestBrigade.id,
                        brigade_name: bestBrigade.name,
                        brigade_type: bestBrigade.type
                    });

                    if (!dryRun) {
                        await client.query(`
                            UPDATE scrc_orders
                            SET status = 'assigned',
                                assigned_brigade_id = $1,
                                assigned_at = NOW(),
                                updated_at = NOW()
                            WHERE id = $2
                        `, [bestBrigade.id, order.id]);
                    }
                }
            }

            if (!dryRun) await client.query('COMMIT');

            return {
                success: true,
                total_orders: orders.length,
                assigned: assignments.length,
                unassigned: orders.length - assignments.length,
                assignments,
                brigade_summary: Array.from(brigadeAssignments.values()).map(b => ({
                    id: b.id,
                    name: b.name,
                    type: b.type,
                    assigned_today: b.assigned,
                    remaining_capacity: b.remaining_capacity - b.assigned
                }))
            };

        } catch (err) {
            if (!dryRun) await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Get routing stats for dashboard
     */
    async getRoutingStats() {
        const stats = await this.pool.query(`
            SELECT 
                brigade_type,
                COUNT(*) as total_orders,
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'assigned') as assigned,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                SUM(amount_due) as total_debt
            FROM scrc_orders
            GROUP BY brigade_type
        `);

        const zones = await this.pool.query(`
            SELECT 
                municipality,
                COUNT(*) as order_count,
                SUM(amount_due) as total_debt
            FROM scrc_orders
            WHERE status = 'pending'
            GROUP BY municipality
            ORDER BY order_count DESC
            LIMIT 20
        `);
        return {
            by_brigade_type: stats.rows,
            top_zones: zones.rows,
            capacities: await configService.getBrigadeCapacities()
        };
    }
}

module.exports = {
    RoutingEngine,
    // Fallback constants (for backwards compatibility)
    BRIGADE_CAPACITIES,
    ALCANCE_BRIGADE_MATRIX,
    OS_PRIORITY,
    ESTIMATED_TIMES,
    PATRONES_URBANOS,
    PATRONES_RURALES,
    JORNADA,
    ALCANCE_DESCRIPTIONS,
    // Dynamic config service access
    configService
};

