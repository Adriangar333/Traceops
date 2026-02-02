/**
 * Metrics Service Stub
 * Basic localStorage-based metrics storage
 */

const API_URL = 'https://dashboard-backend.zvkdyr.easypanel.host/api/scrc';

export const fetchDashboardData = async () => {
    try {
        const [statsRes, financialsRes] = await Promise.all([
            fetch(`${API_URL}/stats`),
            fetch(`${API_URL}/financials?startDate=${new Date().toISOString().split('T')[0].substring(0, 8)}01`) // Helper for current month?
        ]);

        if (!statsRes.ok || !financialsRes.ok) throw new Error('Failed to fetch data');

        const stats = await statsRes.json();
        const financials = await financialsRes.json();

        return {
            totalRoutes: parseInt(stats.summary.total),
            completedRoutes: parseInt(stats.summary.completed),
            completionRate: parseInt(stats.summary.total) > 0 ? Math.round((parseInt(stats.summary.completed) / parseInt(stats.summary.total)) * 100) : 0,
            totalDeliveries: parseInt(stats.summary.completed), // Approximation for now
            totalDistanceKm: 0, // Not aggregated by backend yet
            last7Days: [], // Backend needs to provide this
            recentRoutes: [], // Backend needs to provide this
            financials: financials,
            byBrigade: stats.by_brigade,
            avgTimePerRoute: 45
        };
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        return null; // Handle error in UI
    }
};

export const fetchAuditReport = async () => {
    try {
        const res = await fetch(`${API_URL}/audit`);
        if (!res.ok) throw new Error('Failed to fetch audit report');
        return await res.json();
    } catch (error) {
        console.error('Audit report error:', error);
        return [];
    }
};

// Legacy/Stub functions - kept to avoid breaking imports immediately, but non-functional
export const calculateSummary = () => {
    console.warn('calculateSummary is deprecated. Use fetchDashboardData.');
    return {
        totalRoutes: 0,
        completedRoutes: 0,
        completionRate: 0,
        totalDeliveries: 0,
        totalDistanceKm: 0,
        last7Days: [],
        recentRoutes: [],
        avgDeliveriesPerRoute: 0,
        avgDistancePerRoute: 0,
        avgTimePerRoute: 0
    };
};

export const exportMetrics = () => {
    console.log('Export not implemented for real API yet');
};

export const resetMetrics = () => {
    console.log('Reset not applicable for real API');
};
