const DataLoader = require('dataloader');

/**
 * DataLoader Factory - Creates batch loaders to prevent N+1 queries
 * 
 * How it works:
 * - Instead of: SELECT * FROM routes WHERE driver_id = 1; SELECT * FROM routes WHERE driver_id = 2; ...
 * - DataLoader does: SELECT * FROM routes WHERE driver_id IN (1, 2, 3, ...)
 * 
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Object} Object containing all DataLoaders
 */
const createLoaders = (pool) => {
    return {
        /**
         * Batch load drivers by IDs
         * Used when: Fetching driver details for multiple routes
         */
        driverById: new DataLoader(async (driverIds) => {
            console.log(`[DataLoader] Batching ${driverIds.length} driver requests`);

            try {
                const result = await pool.query(
                    `SELECT * FROM drivers WHERE id = ANY($1::int[])`,
                    [driverIds]
                );

                // Map results back to original order
                const driverMap = new Map(result.rows.map(d => [d.id.toString(), d]));
                return driverIds.map(id => driverMap.get(id.toString()) || null);
            } catch (error) {
                console.error('[DataLoader] Error loading drivers:', error);
                return driverIds.map(() => null);
            }
        }),

        /**
         * Batch load routes by driver IDs
         * Used when: Fetching all routes for multiple drivers
         */
        routesByDriverId: new DataLoader(async (driverIds) => {
            console.log(`[DataLoader] Batching routes for ${driverIds.length} drivers`);

            try {
                const result = await pool.query(
                    `SELECT * FROM routes WHERE driver_id = ANY($1::int[]) ORDER BY created_at DESC`,
                    [driverIds]
                );

                // Group routes by driver_id
                const routesByDriver = new Map();
                driverIds.forEach(id => routesByDriver.set(id.toString(), []));

                result.rows.forEach(route => {
                    const driverId = route.driver_id?.toString();
                    if (driverId && routesByDriver.has(driverId)) {
                        routesByDriver.get(driverId).push(route);
                    }
                });

                return driverIds.map(id => routesByDriver.get(id.toString()) || []);
            } catch (error) {
                console.error('[DataLoader] Error loading routes:', error);
                return driverIds.map(() => []);
            }
        }),

        /**
         * Batch load waypoints by route IDs
         * Used when: Fetching waypoints for multiple routes
         */
        waypointsByRouteId: new DataLoader(async (routeIds) => {
            console.log(`[DataLoader] Batching waypoints for ${routeIds.length} routes`);

            try {
                const result = await pool.query(
                    `SELECT * FROM route_waypoints WHERE route_id = ANY($1::int[]) ORDER BY order_index ASC`,
                    [routeIds]
                );

                // Group waypoints by route_id
                const waypointsByRoute = new Map();
                routeIds.forEach(id => waypointsByRoute.set(id.toString(), []));

                result.rows.forEach(wp => {
                    const routeId = wp.route_id?.toString();
                    if (routeId && waypointsByRoute.has(routeId)) {
                        waypointsByRoute.get(routeId).push({
                            id: wp.id,
                            lat: wp.lat,
                            lng: wp.lng,
                            address: wp.address,
                            orderIndex: wp.order_index,
                            status: wp.status
                        });
                    }
                });

                return routeIds.map(id => waypointsByRoute.get(id.toString()) || []);
            } catch (error) {
                console.error('[DataLoader] Error loading waypoints:', error);
                return routeIds.map(() => []);
            }
        })
    };
};

module.exports = createLoaders;
