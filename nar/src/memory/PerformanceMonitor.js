import {getMemoryUsage} from '@senars/core/src/util/common.js';

export class PerformanceMonitor {
    constructor() {
        this._performance = {
            queryTimes: [],
            indexUpdateTimes: [],
            memoryUsage: [],
            lastMetrics: null,
            metricsInterval: null
        };
    }

    /**
     * Start performance monitoring
     */
    startMonitoring(callback, interval = 30000) { // 30 seconds default
        if (this._performance.metricsInterval) {
            clearInterval(this._performance.metricsInterval);
        }

        this._performance.metricsInterval = setInterval(() => {
            const metrics = this.collectMetrics();
            if (callback) callback(metrics);
        }, interval);
    }

    /**
     * Stop performance monitoring
     */
    stopMonitoring() {
        if (this._performance.metricsInterval) {
            clearInterval(this._performance.metricsInterval);
            this._performance.metricsInterval = null;
        }
    }

    /**
     * Collect performance metrics
     */
    collectMetrics() {
        const metrics = {
            timestamp: Date.now(),
            memoryUsage: this.getMemoryUsage(),
            indexSizes: this.getIndexSizes(),
            queryPerformance: this.getQueryPerformance(),
            systemLoad: this.getSystemLoad()
        };

        this._performance.lastMetrics = metrics;
        this._performance.memoryUsage.push({
            timestamp: metrics.timestamp,
            usage: metrics.memoryUsage
        });

        // Keep only last 100 measurements to prevent memory growth
        if (this._performance.memoryUsage.length > 100) {
            this._performance.memoryUsage = this._performance.memoryUsage.slice(-50);
        }

        return metrics;
    }

    /**
     * Get current memory usage
     */
    getMemoryUsage() {
        const usage = getMemoryUsage();
        if (usage) {
            return {
                heapUsed: usage.heapUsed,
                heapTotal: usage.heapTotal,
                rss: usage.rss,
                external: usage.external
            };
        }
        return {heapUsed: 0, heapTotal: 0, rss: 0, external: 0};
    }

    /**
     * Get index sizes
     */
    getIndexSizes(indexes) {
        const sizes = {};
        for (const [indexName, index] of Object.entries(indexes)) {
            sizes[indexName] = index.size;
        }
        return sizes;
    }

    /**
     * Get query performance metrics
     */
    getQueryPerformance() {
        if (this._performance.queryTimes.length === 0) {
            return {avgQueryTime: 0, maxQueryTime: 0, totalQueries: 0};
        }

        const totalQueries = this._performance.queryTimes.length;
        const avgQueryTime = this._performance.queryTimes.reduce((sum, time) => sum + time, 0) / totalQueries;
        const maxQueryTime = Math.max(...this._performance.queryTimes);

        return {avgQueryTime, maxQueryTime, totalQueries};
    }

    /**
     * Get system load information
     */
    getSystemLoad() {
        // This is a simplified system load measurement
        // In practice, you might use OS-specific APIs or libraries
        return {
            uptime: process.uptime ? process.uptime() : 0,
            pid: process.pid || 0,
            platform: process.platform || 'unknown'
        };
    }

    /**
     * Record query execution time
     */
    recordQueryTime(time) {
        this._performance.queryTimes.push(time);

        // Keep only last 1000 measurements to prevent memory growth
        if (this._performance.queryTimes.length > 1000) {
            this._performance.queryTimes = this._performance.queryTimes.slice(-500);
        }
    }

    /**
     * Record index update time
     */
    recordIndexUpdateTime(time) {
        this._performance.indexUpdateTimes.push(time);

        // Keep only last 1000 measurements to prevent memory growth
        if (this._performance.indexUpdateTimes.length > 1000) {
            this._performance.indexUpdateTimes = this._performance.indexUpdateTimes.slice(-500);
        }
    }

    /**
     * Get performance statistics
     */
    getPerformanceStats(indexes) {
        const currentMetrics = this._performance.lastMetrics || this.collectMetrics(indexes);

        return {
            current: currentMetrics,
            historical: {
                memoryUsage: this._performance.memoryUsage,
                queryTimes: this._performance.queryTimes,
                indexUpdateTimes: this._performance.indexUpdateTimes
            },
            recommendations: this.generatePerformanceRecommendations(currentMetrics)
        };
    }

    /**
     * Generate performance recommendations based on current metrics
     */
    generatePerformanceRecommendations(metrics) {
        const recommendations = [];

        // Memory usage recommendations
        if (metrics.memoryUsage.heapUsed > 0.8 * metrics.memoryUsage.heapTotal) {
            recommendations.push({
                type: 'memory',
                severity: 'warning',
                message: 'High memory usage detected. Consider running optimization.',
                action: 'optimize'
            });
        }

        // Query performance recommendations
        if (metrics.queryPerformance.avgQueryTime > 100) { // 100ms threshold
            recommendations.push({
                type: 'query',
                severity: 'warning',
                message: 'Average query time is high. Consider index optimization.',
                action: 'rebuildIndex'
            });
        }

        // Index size recommendations
        const largeIndexes = Object.entries(metrics.indexSizes)
            .filter(([name, size]) => size > 10000) // 10k threshold
            .map(([name, size]) => ({name, size}));

        if (largeIndexes.length > 0) {
            recommendations.push({
                type: 'index',
                severity: 'info',
                message: `Large indexes detected: ${largeIndexes.map(idx => idx.name).join(', ')}. Consider periodic cleanup.`,
                action: 'cleanup'
            });
        }

        return recommendations;
    }

    /**
     * Optimize index performance
     */
    optimize() {
        const startTime = Date.now();

        // Run garbage collection if available
        if (global.gc) {
            global.gc();
        }

        // Compact performance data
        this.compactPerformanceData();

        const duration = Date.now() - startTime;

        this.recordIndexUpdateTime(duration);

        return {
            success: true,
            duration,
            action: 'optimizePerformance',
            timestamp: Date.now()
        };
    }

    /**
     * Compact performance data to prevent memory growth
     */
    compactPerformanceData() {
        const limits = {
            memoryUsage: 100,
            queryTimes: 1000,
            indexUpdateTimes: 1000
        };

        const ranges = {
            memoryUsage: 50,
            queryTimes: 500,
            indexUpdateTimes: 500
        };

        // Keep only recent performance data
        Object.entries(limits).forEach(([key, limit]) => {
            if (this._performance[key].length > limit) {
                this._performance[key] = this._performance[key].slice(-ranges[key]);
            }
        });
    }
}