import React, { useEffect, useState } from 'react';
import { MapPin, Clock, AlertTriangle, CheckCircle, Building, Trees, Factory } from 'lucide-react';
import { getRouteZoneStats, ZONE_TYPES, getZoneTypeInfo } from '../utils/zoneClassifier';

/**
 * ============================================================================
 * ZONE STATS PANEL
 * ============================================================================
 * 
 * Displays zone classification statistics for a route.
 * Shows urban/rural distribution and ETA adjustments.
 * 
 * Props:
 * - waypoints: Array of route waypoints with lat/lng
 * - onStatsLoaded: Callback when stats are loaded
 * ============================================================================
 */

const ZoneStatsPanel = ({ waypoints, onStatsLoaded }) => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!waypoints || waypoints.length === 0) {
            setLoading(false);
            return;
        }

        const loadStats = async () => {
            setLoading(true);
            setError(null);

            try {
                const result = await getRouteZoneStats(waypoints);
                setStats(result);
                if (onStatsLoaded) onStatsLoaded(result);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        loadStats();
    }, [waypoints]);

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.loadingContainer}>
                    <div style={styles.spinner} />
                    <span style={{ color: '#64748b', fontSize: '13px' }}>Analizando zonas...</span>
                </div>
            </div>
        );
    }

    if (error || !stats) {
        return null; // Silently fail
    }

    const zoneBreakdown = Object.entries(stats.stats.byZone).map(([code, data]) => ({
        code,
        ...data,
        ...getZoneTypeInfo(code)
    }));

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <MapPin size={16} style={{ color: '#8b5cf6' }} />
                <span style={styles.headerText}>Análisis de Zonas</span>
            </div>

            {/* Zone Breakdown */}
            <div style={styles.breakdownContainer}>
                {zoneBreakdown.map(zone => (
                    <div key={zone.code} style={styles.zoneItem}>
                        <div style={{
                            ...styles.zoneIndicator,
                            background: zone.bgColor,
                            borderColor: zone.color
                        }}>
                            <span>{zone.emoji}</span>
                            <span style={{ color: zone.color, fontWeight: '600' }}>{zone.count}</span>
                        </div>
                        <span style={styles.zoneName}>{zone.name}</span>
                    </div>
                ))}
            </div>

            {/* ETA Adjustment */}
            {stats.stats.avgEtaMultiplier !== 1.0 && (
                <div style={{
                    ...styles.etaBar,
                    background: stats.stats.avgEtaMultiplier > 1.1
                        ? 'rgba(245, 158, 11, 0.1)'
                        : 'rgba(34, 197, 94, 0.1)',
                    borderColor: stats.stats.avgEtaMultiplier > 1.1
                        ? 'rgba(245, 158, 11, 0.3)'
                        : 'rgba(34, 197, 94, 0.3)'
                }}>
                    <Clock size={14} style={{
                        color: stats.stats.avgEtaMultiplier > 1.1 ? '#f59e0b' : '#22c55e'
                    }} />
                    <span style={{
                        fontSize: '12px',
                        color: stats.stats.avgEtaMultiplier > 1.1 ? '#b45309' : '#166534'
                    }}>
                        ETA ajustado: {stats.stats.avgEtaMultiplier > 1 ? '+' : ''}
                        {((stats.stats.avgEtaMultiplier - 1) * 100).toFixed(0)}%
                    </span>
                </div>
            )}

            {/* Recommendations */}
            {stats.recommendations?.length > 0 && (
                <div style={styles.recommendations}>
                    {stats.recommendations.map((rec, i) => (
                        <div key={i} style={{
                            ...styles.recommendation,
                            background: rec.type === 'warning'
                                ? 'rgba(245, 158, 11, 0.08)'
                                : 'rgba(59, 130, 246, 0.08)'
                        }}>
                            <span style={{ fontSize: '14px' }}>{rec.icon}</span>
                            <span style={{
                                fontSize: '11px',
                                color: '#64748b',
                                flex: 1
                            }}>
                                {rec.message}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Styles
const styles = {
    container: {
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(10px)',
        borderRadius: '12px',
        padding: '12px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        marginTop: '12px'
    },
    loadingContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        justifyContent: 'center',
        padding: '10px'
    },
    spinner: {
        width: '16px',
        height: '16px',
        border: '2px solid rgba(139, 92, 246, 0.3)',
        borderTopColor: '#8b5cf6',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '12px',
        paddingBottom: '8px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
    },
    headerText: {
        fontSize: '13px',
        fontWeight: '600',
        color: '#e2e8f0'
    },
    breakdownContainer: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        marginBottom: '10px'
    },
    zoneItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
    },
    zoneIndicator: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        borderRadius: '8px',
        border: '1px solid',
        fontSize: '12px'
    },
    zoneName: {
        fontSize: '11px',
        color: '#94a3b8'
    },
    etaBar: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 10px',
        borderRadius: '8px',
        border: '1px solid',
        marginTop: '8px'
    },
    recommendations: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        marginTop: '10px'
    },
    recommendation: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '8px 10px',
        borderRadius: '8px'
    }
};

export default ZoneStatsPanel;
