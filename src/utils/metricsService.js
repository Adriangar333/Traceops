// Metrics Service - Track and calculate route efficiency indicators
// Stores data in localStorage for persistence

const METRICS_KEY = 'logistics_metrics';
const ROUTES_HISTORY_KEY = 'logistics_routes_history';

// Get all stored metrics
export const getMetrics = () => {
    const stored = localStorage.getItem(METRICS_KEY);
    return stored ? JSON.parse(stored) : getDefaultMetrics();
};

// Get default metrics structure
const getDefaultMetrics = () => ({
    totalRoutesCreated: 0,
    totalRoutesCompleted: 0,
    totalDeliveries: 0,
    totalDistanceKm: 0,
    totalDurationMinutes: 0,
    routesByDriver: {},
    dailyStats: {},
    lastUpdated: null
});

// Save metrics to localStorage
const saveMetrics = (metrics) => {
    metrics.lastUpdated = new Date().toISOString();
    localStorage.setItem(METRICS_KEY, JSON.stringify(metrics));
};

// Record a new route creation
export const recordRouteCreated = (route, waypoints, stats) => {
    const metrics = getMetrics();
    const today = new Date().toISOString().split('T')[0];

    metrics.totalRoutesCreated++;

    if (stats) {
        metrics.totalDistanceKm += parseFloat(stats.distanceKm) || 0;
        metrics.totalDurationMinutes += (stats.duration || 0) / 60;
    }

    // Daily stats
    if (!metrics.dailyStats[today]) {
        metrics.dailyStats[today] = { created: 0, completed: 0, deliveries: 0, distanceKm: 0 };
    }
    metrics.dailyStats[today].created++;
    metrics.dailyStats[today].distanceKm += parseFloat(stats?.distanceKm) || 0;

    saveMetrics(metrics);

    // Also save to history
    saveRouteToHistory(route, waypoints, stats);
};

// Record route completion
export const recordRouteCompleted = (routeId, driverId, deliveriesCount) => {
    const metrics = getMetrics();
    const today = new Date().toISOString().split('T')[0];

    metrics.totalRoutesCompleted++;
    metrics.totalDeliveries += deliveriesCount;

    // Driver stats
    if (!metrics.routesByDriver[driverId]) {
        metrics.routesByDriver[driverId] = { completed: 0, deliveries: 0 };
    }
    metrics.routesByDriver[driverId].completed++;
    metrics.routesByDriver[driverId].deliveries += deliveriesCount;

    // Daily stats
    if (!metrics.dailyStats[today]) {
        metrics.dailyStats[today] = { created: 0, completed: 0, deliveries: 0, distanceKm: 0 };
    }
    metrics.dailyStats[today].completed++;
    metrics.dailyStats[today].deliveries += deliveriesCount;

    saveMetrics(metrics);
};

// Save route to history
const saveRouteToHistory = (route, waypoints, stats) => {
    const history = getRoutesHistory();
    history.push({
        id: route.id || Date.now(),
        name: route.name,
        waypoints: waypoints.length,
        distanceKm: stats?.distanceKm || 0,
        durationMinutes: stats ? (stats.duration / 60).toFixed(1) : 0,
        createdAt: new Date().toISOString(),
        status: 'created'
    });

    // Keep only last 100 routes
    if (history.length > 100) {
        history.shift();
    }

    localStorage.setItem(ROUTES_HISTORY_KEY, JSON.stringify(history));
};

// Get routes history
export const getRoutesHistory = () => {
    const stored = localStorage.getItem(ROUTES_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
};

// Calculate summary statistics
export const calculateSummary = () => {
    const metrics = getMetrics();
    const history = getRoutesHistory();

    // FETCH LIVE DATA FROM LOGISTICS ROUTES (Synced from DriverView)
    const activeRoutes = JSON.parse(localStorage.getItem('logisticsRoutes') || '[]');
    const liveCompletedCount = activeRoutes.filter(r => r.completedCount && r.waypoints && r.completedCount === r.waypoints.length).length;

    // Merge live count: Use whichever is greater, or just use live count if we assume all routes are in activeRoutes
    // For this demo/feature, we prioritize the live Active Routes state for "Completed"
    const totalCompleted = Math.max(metrics.totalRoutesCompleted, liveCompletedCount);

    const completionRate = metrics.totalRoutesCreated > 0
        ? ((totalCompleted / metrics.totalRoutesCreated) * 100).toFixed(1)
        : 0;

    const avgDeliveriesPerRoute = totalCompleted > 0
        ? (metrics.totalDeliveries / totalCompleted).toFixed(1)
        : 0;

    const avgDistancePerRoute = totalCompleted > 0
        ? (metrics.totalDistanceKm / totalCompleted).toFixed(1)
        : 0;

    const avgTimePerRoute = totalCompleted > 0
        ? (metrics.totalDurationMinutes / totalCompleted).toFixed(0)
        : 0;

    // Get last 7 days stats
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        last7Days.push({
            date: dateStr,
            label: date.toLocaleDateString('es-CO', { weekday: 'short' }),
            ...metrics.dailyStats[dateStr] || { created: 0, completed: 0, deliveries: 0, distanceKm: 0 }
        });
    }

    return {
        totalRoutes: metrics.totalRoutesCreated,
        completedRoutes: totalCompleted,
        totalDeliveries: metrics.totalDeliveries,
        totalDistanceKm: metrics.totalDistanceKm.toFixed(1),
        completionRate,
        avgDeliveriesPerRoute,
        avgDistancePerRoute,
        avgTimePerRoute,
        last7Days,
        topDrivers: getTopDrivers(metrics.routesByDriver),
        recentRoutes: history.slice(-5).reverse()
    };
};

// Get top performing drivers
const getTopDrivers = (routesByDriver) => {
    return Object.entries(routesByDriver)
        .map(([id, stats]) => ({ id, ...stats }))
        .sort((a, b) => b.completed - a.completed)
        .slice(0, 5);
};

// Reset all metrics (for testing)
export const resetMetrics = () => {
    localStorage.removeItem(METRICS_KEY);
    localStorage.removeItem(ROUTES_HISTORY_KEY);
};

// Export metrics as JSON (for reports)
export const exportMetrics = () => {
    return {
        metrics: getMetrics(),
        history: getRoutesHistory(),
        summary: calculateSummary(),
        exportedAt: new Date().toISOString()
    };
};
