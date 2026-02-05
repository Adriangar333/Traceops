/**
 * GraphQL Resolvers for TraceOps
 * 
 * Each resolver function receives:
 * - parent: Result from parent resolver (for nested fields)
 * - args: Arguments passed to the query/mutation
 * - context: Contains db pool and DataLoaders
 * - info: Query info (rarely used)
 */

const resolvers = {
    // === Query Resolvers ===
    Query: {
        /**
         * Get all drivers
         */
        drivers: async (_, __, { db }) => {
            try {
                const result = await db.query(
                    'SELECT * FROM drivers ORDER BY name ASC'
                );
                return result.rows.map(row => ({
                    id: row.id,
                    name: row.name,
                    email: row.email,
                    phone: row.phone,
                    status: row.status || 'active',
                    createdAt: row.created_at?.toISOString()
                }));
            } catch (error) {
                console.error('[GraphQL] Error fetching drivers:', error);
                throw new Error('Failed to fetch drivers');
            }
        },

        /**
         * Get single driver by ID
         */
        driver: async (_, { id }, { loaders }) => {
            const driver = await loaders.driverById.load(id);
            if (!driver) return null;

            return {
                id: driver.id,
                name: driver.name,
                email: driver.email,
                phone: driver.phone,
                status: driver.status || 'active',
                createdAt: driver.created_at?.toISOString()
            };
        },

        /**
         * Get routes with optional filters
         */
        routes: async (_, { driverId, status }, { db }) => {
            try {
                let query = 'SELECT * FROM routes WHERE 1=1';
                const params = [];

                if (driverId) {
                    params.push(driverId);
                    query += ` AND driver_id = $${params.length}`;
                }
                if (status) {
                    params.push(status);
                    query += ` AND status = $${params.length}`;
                }

                query += ' ORDER BY created_at DESC';

                const result = await db.query(query, params);
                return result.rows.map(row => ({
                    id: row.id,
                    name: row.name,
                    status: row.status,
                    optimizationMethod: row.optimization_method,
                    totalDistance: row.total_distance,
                    totalDuration: row.total_duration,
                    createdAt: row.created_at?.toISOString(),
                    driverId: row.driver_id
                }));
            } catch (error) {
                console.error('[GraphQL] Error fetching routes:', error);
                throw new Error('Failed to fetch routes');
            }
        },

        /**
         * Get single route by ID
         */
        route: async (_, { id }, { db }) => {
            try {
                const result = await db.query(
                    'SELECT * FROM routes WHERE id = $1',
                    [id]
                );

                if (result.rows.length === 0) return null;

                const row = result.rows[0];
                return {
                    id: row.id,
                    name: row.name,
                    status: row.status,
                    optimizationMethod: row.optimization_method,
                    totalDistance: row.total_distance,
                    totalDuration: row.total_duration,
                    createdAt: row.created_at?.toISOString(),
                    driverId: row.driver_id
                };
            } catch (error) {
                console.error('[GraphQL] Error fetching route:', error);
                throw new Error('Failed to fetch route');
            }
        },

        /**
         * Get dashboard statistics
         */
        dashboardStats: async (_, __, { db }) => {
            try {
                const [driversResult, routesResult, activeResult, deliveriesResult] = await Promise.all([
                    db.query('SELECT COUNT(*) FROM drivers'),
                    db.query('SELECT COUNT(*) FROM routes'),
                    db.query("SELECT COUNT(*) FROM routes WHERE status = 'active'"),
                    db.query("SELECT COUNT(*) FROM route_waypoints WHERE status = 'delivered'")
                ]);

                return {
                    totalDrivers: parseInt(driversResult.rows[0].count) || 0,
                    totalRoutes: parseInt(routesResult.rows[0].count) || 0,
                    activeRoutes: parseInt(activeResult.rows[0].count) || 0,
                    completedDeliveries: parseInt(deliveriesResult.rows[0].count) || 0
                };
            } catch (error) {
                console.error('[GraphQL] Error fetching stats:', error);
                return { totalDrivers: 0, totalRoutes: 0, activeRoutes: 0, completedDeliveries: 0 };
            }
        }
    },

    // === Type Resolvers (for nested fields) ===
    Driver: {
        /**
         * Resolve routes for a driver using DataLoader (prevents N+1)
         */
        routes: async (parent, _, { loaders }) => {
            return loaders.routesByDriverId.load(parent.id.toString());
        }
    },

    Route: {
        /**
         * Resolve driver for a route using DataLoader
         */
        driver: async (parent, _, { loaders }) => {
            if (!parent.driverId) return null;
            const driver = await loaders.driverById.load(parent.driverId.toString());
            if (!driver) return null;

            return {
                id: driver.id,
                name: driver.name,
                email: driver.email,
                phone: driver.phone,
                status: driver.status
            };
        },

        /**
         * Resolve waypoints for a route using DataLoader
         */
        waypoints: async (parent, _, { loaders }) => {
            return loaders.waypointsByRouteId.load(parent.id.toString());
        }
    },

    Waypoint: {
        pod: async (parent, _, { db }) => {
            if (!parent.routeId || parent.orderIndex === undefined) return null;

            try {
                const res = await db.query(
                    "SELECT * FROM delivery_proofs WHERE route_id = $1 AND waypoint_index = $2",
                    [parent.routeId, parent.orderIndex]
                );

                if (res.rows.length === 0) return null;

                const row = res.rows[0];
                return {
                    id: row.id,
                    waypointId: parent.id,
                    photoUrl: row.photo ? `data:image/jpeg;base64,${row.photo}` : null,
                    signatureUrl: row.signature ? `data:image/png;base64,${row.signature}` : null,
                    notes: row.notes,
                    deliveredAt: row.created_at?.toISOString(),
                    location: { lat: row.latitude, lng: row.longitude }
                };
            } catch (error) {
                console.error('[GraphQL] Error resolving POD:', error);
                return null;
            }
        }
    },

    // === Mutation Resolvers ===
    Mutation: {
        /**
         * Create a new driver
         */
        createDriver: async (_, { name, email, phone }, { db }) => {
            try {
                const result = await db.query(
                    `INSERT INTO drivers (name, email, phone, status, created_at) 
                     VALUES ($1, $2, $3, 'active', NOW()) 
                     RETURNING *`,
                    [name, email, phone]
                );

                const row = result.rows[0];
                return {
                    id: row.id,
                    name: row.name,
                    email: row.email,
                    phone: row.phone,
                    status: row.status,
                    createdAt: row.created_at?.toISOString()
                };
            } catch (error) {
                console.error('[GraphQL] Error creating driver:', error);
                throw new Error('Failed to create driver');
            }
        },

        /**
         * Assign a route to a driver
         */
        assignRoute: async (_, { routeId, driverId }, { db }) => {
            try {
                const result = await db.query(
                    `UPDATE routes SET driver_id = $1 WHERE id = $2 RETURNING *`,
                    [driverId, routeId]
                );

                if (result.rows.length === 0) {
                    throw new Error('Route not found');
                }

                const row = result.rows[0];
                return {
                    id: row.id,
                    name: row.name,
                    status: row.status,
                    driverId: row.driver_id
                };
            } catch (error) {
                console.error('[GraphQL] Error assigning route:', error);
                throw new Error('Failed to assign route');
            }
        },

        /**
         * Update waypoint delivery status
         */
        updateWaypointStatus: async (_, { waypointId, status }, { db }) => {
            try {
                const result = await db.query(
                    `UPDATE waypoints SET status = $1 WHERE id = $2 RETURNING *`,
                    [status, waypointId]
                );

                if (result.rows.length === 0) {
                    throw new Error('Waypoint not found');
                }

                const row = result.rows[0];
                return {
                    id: row.id,
                    lat: row.lat,
                    lng: row.lng,
                    address: row.address,
                    orderIndex: row.order_index,
                    status: row.status
                };
            } catch (error) {
                console.error('[GraphQL] Error updating waypoint:', error);
                throw new Error('Failed to update waypoint');
            }
        }
    }
};

module.exports = resolvers;
