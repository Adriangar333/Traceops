/**
 * Metrics Service Stub
 * Basic localStorage-based metrics storage
 */

const METRICS_KEY = 'traceops_metrics';

const getMetrics = () => {
    try {
        return JSON.parse(localStorage.getItem(METRICS_KEY) || '{"routes": [], "deliveries": []}');
    } catch {
        return { routes: [], deliveries: [] };
    }
};

export const calculateSummary = () => {
    const metrics = getMetrics();
    const today = new Date().toDateString();

    const completedRoutes = metrics.routes.filter(r => r.status === 'completed').length;
    const totalRoutes = metrics.routes.length;

    // Last 7 days
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toDateString();
        const dayRoutes = metrics.routes.filter(r =>
            new Date(r.createdAt).toDateString() === dateStr
        );
        last7Days.push({
            label: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][date.getDay()],
            created: dayRoutes.length
        });
    }

    const totalDeliveries = metrics.deliveries.length;
    const totalDistance = metrics.routes.reduce((sum, r) => sum + (r.distanceKm || 0), 0);

    return {
        totalRoutes,
        completedRoutes,
        completionRate: totalRoutes > 0 ? Math.round((completedRoutes / totalRoutes) * 100) : 0,
        totalDeliveries,
        totalDistanceKm: totalDistance.toFixed(1),
        last7Days,
        recentRoutes: metrics.routes.slice(-5).reverse(),
        avgDeliveriesPerRoute: totalRoutes > 0 ? Math.round(totalDeliveries / totalRoutes) : 0,
        avgDistancePerRoute: totalRoutes > 0 ? (totalDistance / totalRoutes).toFixed(1) : 0,
        avgTimePerRoute: 45 // Placeholder
    };
};

export const recordRouteCreated = (routeData) => {
    const metrics = getMetrics();
    metrics.routes.push({
        ...routeData,
        id: Date.now(),
        createdAt: new Date().toISOString(),
        status: 'created'
    });
    localStorage.setItem(METRICS_KEY, JSON.stringify(metrics));
};

export const recordDelivery = (deliveryData) => {
    const metrics = getMetrics();
    metrics.deliveries.push({
        ...deliveryData,
        timestamp: new Date().toISOString()
    });
    localStorage.setItem(METRICS_KEY, JSON.stringify(metrics));
};

export const exportMetrics = () => {
    return getMetrics();
};

export const resetMetrics = () => {
    localStorage.removeItem(METRICS_KEY);
};
