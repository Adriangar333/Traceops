/**
 * configService.js
 * Singleton service for dynamic system configuration
 * Loads config from PostgreSQL and caches in memory
 * 
 * Replaces hardcoded constants in routingEngine.js
 */

// ============================================
// DEFAULT VALUES (fallback when DB empty)
// Same as SettingsPanel.jsx defaults
// ============================================

const DEFAULT_BRIGADE_CAPACITIES = {
    'CANASTA': 15,
    'SCR LIVIANA': 30,
    'SCR MINI CANASTA': 15,
    'SCR PESADA': 25,
    'SCR PESADA DISPONIBILIDAD': 22,
    'SCR PESADA ELITE': 22,
};

const DEFAULT_OS_PRIORITY = {
    'TO502': 1, // RECONEXIÓN SERVICIO MD - Highest priority
    'TO503': 2, // REVISIÓN DE SUSPENSIÓN MD
    'TO501': 3, // SUSPENSIÓN DEL SERVICIO MD
    'TO504': 4, // SUSPENSIÓN MI/MS
    'TO506': 5, // REVISIÓN MI/MS
};

const DEFAULT_ALCANCE_MATRIX = {
    'B': { urban: 'SCR LIVIANA', rural: 'SCR PESADA DISPONIBILIDAD' },
    'T': { urban: 'SCR PESADA', rural: 'SCR PESADA DISPONIBILIDAD' },
    'N': { urban: 'SCR MINI CANASTA', rural: 'SCR PESADA DISPONIBILIDAD' },
    'C': { urban: 'CANASTA', rural: 'SCR PESADA DISPONIBILIDAD' },
    'M': { urban: 'SCR PESADA DISPONIBILIDAD', rural: 'SCR PESADA DISPONIBILIDAD' },
    'W': { urban: 'SCR PESADA DISPONIBILIDAD', rural: 'SCR PESADA DISPONIBILIDAD' },
    'E': { urban: 'SCR PESADA', rural: 'SCR PESADA' },
    'X': { urban: 'SCR PESADA', rural: 'SCR PESADA DISPONIBILIDAD' },
    'Y': { urban: 'SCR PESADA', rural: 'SCR PESADA DISPONIBILIDAD' },
    'D': { urban: 'SCR PESADA DISPONIBILIDAD', rural: 'SCR PESADA DISPONIBILIDAD' },
    'F': { urban: 'SCR PESADA DISPONIBILIDAD', rural: 'SCR PESADA DISPONIBILIDAD' },
    'R': { urban: 'SCR PESADA DISPONIBILIDAD', rural: 'SCR PESADA DISPONIBILIDAD' },
};

const DEFAULT_TIMES = {
    'reconexion': 10,
    'suspension_bornera_cooperativo': 10,
    'suspension_bornera_agresivo': 20,
    'suspension_tendido_cooperativo': 15,
    'suspension_tendido_agresivo': 30,
    'suspension_radical_cooperativo': 20,
    'suspension_radical_agresivo': 35,
    'multifamiliar': 20,
    'cupon_pago': 20,
    'cobros': 15,
};

const DEFAULT_ZONE_PATTERNS = {
    rural: ['CARRETERA', 'VIA ', 'VÍA ', 'KM ', 'KM.', 'KILOMETRO', 'KILÓMETRO', 'VEREDA', 'VDA ', 'VDA.', 'CORREGIMIENTO', 'CORREG ', 'FINCA', 'PARCELA', 'HACIENDA', 'CAMINO', 'TROCHA'],
    urban: ['CL ', 'CL.', 'CALLE', 'CR ', 'CR.', 'CRA ', 'CRA.', 'CARRERA', 'TV ', 'TV.', 'TRANSVERSAL', 'DG ', 'DG.', 'DIAGONAL', 'AV ', 'AV.', 'AVENIDA', 'MZ ', 'MZ.', 'MANZANA', 'URB ', 'URBANIZACION', 'URBANIZACIÓN', 'CONJUNTO', 'EDIFICIO', 'TORRE', 'APTO', 'BARRIO', 'BRR '],
};

const DEFAULT_SCHEDULE = {
    startHour: 7,
    startMinute: 0,
    endHour: 17,
    endMinute: 0,
    workDays: [1, 2, 3, 4, 5, 6],
};

const DEFAULT_COSTS = {
    gasoline: { pesada: 2500000, disponibilidad: 3000000 },
    hourly: { pesada: 69724, liviana: 21468 },
    monthly: { pesada: 12271569, liviana: 3778441 },
};

// ============================================
// CONFIG SERVICE CLASS
// ============================================

class ConfigService {
    constructor() {
        this.pool = null;
        this.config = null;
        this.lastLoad = 0;
        this.TTL = 60 * 1000; // 1 minute cache TTL
        this.loading = false;
    }

    /**
     * Initialize with database pool
     */
    init(pool) {
        this.pool = pool;
        console.log('✅ ConfigService initialized');
    }

    /**
     * Force reload config from DB
     */
    async reload() {
        if (!this.pool) {
            console.warn('ConfigService: No pool configured, using defaults');
            return;
        }

        try {
            const result = await this.pool.query(`
                SELECT config FROM system_config WHERE key = 'main'
            `);

            if (result.rows.length > 0 && result.rows[0].config) {
                this.config = result.rows[0].config;
                console.log('✅ ConfigService: Loaded config from DB');
            } else {
                this.config = {};
                console.log('ℹ️ ConfigService: No config in DB, using defaults');
            }

            this.lastLoad = Date.now();
        } catch (err) {
            console.error('ConfigService: Error loading config:', err.message);
            this.config = {};
        }
    }

    /**
     * Load config if cache expired
     */
    async loadIfNeeded() {
        if (this.loading) {
            // Wait for current load to complete
            await new Promise(r => setTimeout(r, 100));
            return;
        }

        if (!this.config || Date.now() - this.lastLoad > this.TTL) {
            this.loading = true;
            await this.reload();
            this.loading = false;
        }
    }

    // ============================================
    // GETTER METHODS
    // ============================================

    /**
     * Get brigade capacities { type: capacity/day }
     */
    async getBrigadeCapacities() {
        await this.loadIfNeeded();

        if (this.config?.brigadeTypes) {
            // Convert from array to object
            const capacities = {};
            for (const b of this.config.brigadeTypes) {
                capacities[b.type] = b.capacity;
            }
            return capacities;
        }

        return DEFAULT_BRIGADE_CAPACITIES;
    }

    /**
     * Get OS type priorities { osCode: priority }
     */
    async getOsPriority() {
        await this.loadIfNeeded();

        if (this.config?.osTypes) {
            const priorities = {};
            for (const os of this.config.osTypes) {
                priorities[os.code] = os.priority;
            }
            return priorities;
        }

        return DEFAULT_OS_PRIORITY;
    }

    /**
     * Get alcance to brigade matrix
     */
    async getAlcanceMatrix() {
        await this.loadIfNeeded();

        if (this.config?.alcanceMatrix) {
            // Matrix is stored exactly as we need it
            return this.config.alcanceMatrix;
        }

        return DEFAULT_ALCANCE_MATRIX;
    }

    /**
     * Get zone patterns { rural: [], urban: [] }
     */
    async getZonePatterns() {
        await this.loadIfNeeded();

        if (this.config?.zonePatterns) {
            return this.config.zonePatterns;
        }

        return DEFAULT_ZONE_PATTERNS;
    }

    /**
     * Get estimated times (in minutes)
     */
    async getEstimatedTimes() {
        await this.loadIfNeeded();

        if (this.config?.times) {
            // Convert from array format to lookup object
            const times = {};
            for (const t of this.config.times) {
                const key = `${t.operation.toLowerCase().replace(/ /g, '_')}_${t.clientType.toLowerCase()}`;
                times[key] = t.minutes;
            }
            return times;
        }

        return DEFAULT_TIMES;
    }

    /**
     * Get work schedule
     */
    async getSchedule() {
        await this.loadIfNeeded();

        if (this.config?.schedule) {
            return this.config.schedule;
        }

        return DEFAULT_SCHEDULE;
    }

    /**
     * Get costs configuration
     */
    async getCosts() {
        await this.loadIfNeeded();

        if (this.config?.costs) {
            return this.config.costs;
        }

        return DEFAULT_COSTS;
    }

    /**
     * Get special rules
     */
    async getSpecialRules() {
        await this.loadIfNeeded();

        if (this.config?.specialRules) {
            return this.config.specialRules.filter(r => r.active);
        }

        return [];
    }

    /**
     * Get debt threshold for special rules
     */
    async getDebtThreshold() {
        await this.loadIfNeeded();
        return this.config?.debtThreshold || 1000000;
    }

    /**
     * Get full config (for API response)
     */
    async getFullConfig() {
        await this.loadIfNeeded();

        return {
            brigadeCapacities: await this.getBrigadeCapacities(),
            alcanceMatrix: await this.getAlcanceMatrix(),
            osPriority: await this.getOsPriority(),
            zonePatterns: await this.getZonePatterns(),
            schedule: await this.getSchedule(),
            costs: await this.getCosts(),
            debtThreshold: await this.getDebtThreshold(),
        };
    }
}

// ============================================
// SINGLETON INSTANCE
// ============================================
const configService = new ConfigService();

module.exports = {
    configService,
    // Export defaults for reference
    DEFAULTS: {
        BRIGADE_CAPACITIES: DEFAULT_BRIGADE_CAPACITIES,
        OS_PRIORITY: DEFAULT_OS_PRIORITY,
        ALCANCE_MATRIX: DEFAULT_ALCANCE_MATRIX,
        TIMES: DEFAULT_TIMES,
        ZONE_PATTERNS: DEFAULT_ZONE_PATTERNS,
        SCHEDULE: DEFAULT_SCHEDULE,
        COSTS: DEFAULT_COSTS,
    }
};
