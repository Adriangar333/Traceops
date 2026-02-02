/**
 * SCRC Routing Engine
 * Motor de Ruteo para Suspensión, Corte, Reconexión y Cobro
 * 
 * Based on: Criterios Tecnicos SCR.xlsx
 * - Matriz Técnica: OS types -> Brigade types
 * - Distribución Operativa: Technician lists with capacities
 * - Sectores SCR: Geographic zones
 */

// ==========================================
// CONFIGURATION - FROM CRITERIOS TECNICOS
// ==========================================

// Brigade types with daily capacity (from Distribución Operativa)
const BRIGADE_CAPACITIES = {
    'CANASTA': 15,
    'SCR LIVIANA': 30,
    'SCR MINI CANASTA': 15,
    'SCR PESADA': 25,
    'SCR PESADA DISPONIBILIDAD': 22, // Average of 20-25
    'SCR PESADA ELITE': 22 // Average of 20-25
};

// Priority order for OS types (1 = highest priority)
const OS_PRIORITY = {
    'TO502': 1, // CORTE - Highest priority
    'TO503': 2, // REVISION
    'TO501': 3, // SUSPENSION
    'TO504': 4, // SUSPENSION MI/MS
    'TO506': 5  // REVISION MI/MS
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
    'Y': { // Y - Destruir Acometida
        urban: ['SCR PESADA'],
        rural: ['SCR PESADA DISPONIBILIDAD']
    }
};

// ==========================================
// ROUTING ENGINE CLASS
// ==========================================

class RoutingEngine {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Get priority based on OS type
     */
    getPriority(osType) {
        return OS_PRIORITY[osType] || 5;
    }

    /**
     * Determine which brigade types can handle an order
     */
    getEligibleBrigades(order) {
        // Extract alcance code from strategic_line (e.g., "B - Bornera" -> "B")
        const strategicLine = order.strategic_line || '';
        const alcanceCode = strategicLine.charAt(0).toUpperCase();

        // Determine if rural or urban
        const isRural = (order.zone_code || '').toLowerCase().includes('rural') ||
            (order.neighborhood || '').toLowerCase().includes('rural');

        const zoneType = isRural ? 'rural' : 'urban';

        // Get eligible brigades from matrix
        const matrix = ALCANCE_BRIGADE_MATRIX[alcanceCode];
        if (!matrix) {
            // Default to PESADA DISPONIBILIDAD for unknown alcance
            return ['SCR PESADA DISPONIBILIDAD'];
        }

        let eligibleBrigades = [...matrix[zoneType]];

        // Special rule: N - Minicanasta with DEUDA > 1,000,000 requires CANASTA
        if (alcanceCode === 'N' && order.amount_due > 1000000) {
            eligibleBrigades = ['CANASTA'];
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
            const capacity = BRIGADE_CAPACITIES[brigade.type] || 20;
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
            capacities: BRIGADE_CAPACITIES
        };
    }
}

module.exports = { RoutingEngine, BRIGADE_CAPACITIES, ALCANCE_BRIGADE_MATRIX, OS_PRIORITY };
