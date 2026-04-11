/**
 * MetricsMonitor for the new reason system
 * Provides comprehensive monitoring and metrics collection for the reasoning process
 */
import {logError, Logger} from '@senars/core';
import {getMemoryUsage} from '@senars/core/src/util/common.js';

export class MetricsMonitor {
    constructor(config = {}) {
        this.config = {
            historySize: 1000,
            reportingInterval: 1000, // ms
            anomalyDetectionEnabled: true,
            thresholdAlerts: true,
            collectDetailed: true,
            ...config
        };

        this.eventBus = config.eventBus || null;
        this.nar = config.nar || null;

        // Initialize metrics
        this.metrics = {
            reasoningSteps: 0,
            inferences: 0,
            ruleApplications: 0,
            ruleApplicationsByType: new Map(),
            processingTime: 0,
            memoryUsage: 0,
            taskProcessing: {
                totalProcessed: 0,
                successful: 0,
                failed: 0,
                avgProcessingTime: 0
            },
            performance: {
                throughput: 0,
                avgLatency: 0,
                efficiency: 0,
                cpuUsage: 0
            },
            resourceUsage: {
                memory: 0,
                cpu: 0,
                heapUsed: 0,
                heapTotal: 0
            },
            quality: {
                derivationQuality: 0,
                truthValueStability: 0,
                confidenceTrend: 0
            }
        };

        // Tracking history for trend analysis
        this.history = {
            reasoningSteps: [],
            throughput: [],
            memoryUsage: [],
            processingTime: []
        };

        this.anomalyDetectors = new Map();
        this.thresholdAlerts = new Map();
        this._startTime = Date.now();
        this._lastUpdateTime = Date.now();
        this._initMonitoring();
    }

    _initMonitoring() {
        // Set up monitoring intervals and event listeners
        this._setupEventHandlers();
        this._setupAnomalyDetectors();
        this._setupThresholdAlerts();

        // Start only if explicitly enabled in config, otherwise wait for start()
        if (this.config.enabled && this.config.reportingInterval > 0) {
            this.start();
        }
    }

    start() {
        if (this._reportingInterval || this.config.reportingInterval <= 0) {
            return;
        }

        this._reportingInterval = setInterval(() => {
            this._updatePerformanceMetrics();
            this._emitMetricsEvent();
        }, this.config.reportingInterval);
    }

    stop() {
        if (this._reportingInterval) {
            clearInterval(this._reportingInterval);
            this._reportingInterval = null;
        }
    }

    _setupEventHandlers() {
        // Set up event listening if event bus is provided
        if (this.eventBus) {
            this.eventBus.on('reasoning.step', (data) => this._handleStep(data));
            this.eventBus.on('reasoning.inference', (data) => this._handleInference(data));
            this.eventBus.on('rule.application', (data) => this._handleRuleApplication(data));
            this.eventBus.on('task.processed', (data) => this._handleTaskProcessed(data));
            this.eventBus.on('error', (data) => this._handleError(data));
        }
    }

    _setupAnomalyDetectors() {
        if (this.config.anomalyDetectionEnabled) {
            // Set up detectors for different metrics
            this.anomalyDetectors.set('throughput', this._createThroughputAnomalyDetector());
            this.anomalyDetectors.set('memory', this._createMemoryAnomalyDetector());
            this.anomalyDetectors.set('latency', this._createLatencyAnomalyDetector());
        }
    }

    _setupThresholdAlerts() {
        if (this.config.thresholdAlerts) {
            // Set up basic threshold alerts
            this.thresholdAlerts.set('memory_high', {
                metric: 'memoryUsage',
                threshold: 0.8, // 80% of max
                condition: (value, max) => value > max * 0.8,
                severity: 'high'
            });

            this.thresholdAlerts.set('low_throughput', {
                metric: 'throughput',
                threshold: 0.1, // less than 0.1 per second
                condition: (value) => value < 0.1,
                severity: 'medium'
            });
        }
    }

    _createThroughputAnomalyDetector() {
        return {
            baseline: null,
            anomalies: [],
            detect: (currentValue, history) => {
                if (history.length < 10) {
                    return false;
                }

                const recentAvg = history.slice(-5).reduce((sum, val) => sum + val, 0) / 5;
                const baseline = history.slice(-10, -5).reduce((sum, val) => sum + val, 0) / 5 || 1;

                // Significant deviation (> 50%) from baseline
                return Math.abs(currentValue - baseline) > baseline * 0.5;
            }
        };
    }

    _createMemoryAnomalyDetector() {
        return {
            baseline: null,
            anomalies: [],
            detect: (currentValue, history) => {
                if (history.length < 5) {
                    return false;
                }

                const recentAvg = history.slice(-5).reduce((sum, val) => sum + val, 0) / 5;
                // Memory usage increasing rapidly
                return currentValue > recentAvg * 1.5;
            }
        };
    }

    _createLatencyAnomalyDetector() {
        return {
            baseline: null,
            anomalies: [],
            detect: (currentValue, history) => {
                if (history.length < 5) {
                    return false;
                }

                const recentAvg = history.slice(-5).reduce((sum, val) => sum + val, 0) / 5;
                // Latency spiking significantly
                return currentValue > recentAvg * 2.0;
            }
        };
    }

    _handleStep(data) {
        this.metrics.reasoningSteps++;
        this.history.reasoningSteps.push({
            value: this.metrics.reasoningSteps,
            timestamp: Date.now()
        });
        this._trimHistory('reasoningSteps');

        this._updatePerformanceMetrics();
        this._emitMetricsEvent();
    }

    _handleInference(data) {
        this.metrics.inferences++;
        this._updatePerformanceMetrics();
    }

    _handleRuleApplication(data) {
        this.metrics.ruleApplications++;

        // Track by rule type
        if (data?.ruleType) {
            const count = this.metrics.ruleApplicationsByType.get(data.ruleType) || 0;
            this.metrics.ruleApplicationsByType.set(data.ruleType, count + 1);
        }

        this._updatePerformanceMetrics();
    }

    _handleTaskProcessed(data) {
        this.metrics.taskProcessing.totalProcessed++;

        if (data?.success) {
            this.metrics.taskProcessing.successful++;
        } else {
            this.metrics.taskProcessing.failed++;
        }

        if (data?.processingTime) {
            this.metrics.taskProcessing.avgProcessingTime =
                (this.metrics.taskProcessing.avgProcessingTime * (this.metrics.taskProcessing.totalProcessed - 1) +
                    data.processingTime) / this.metrics.taskProcessing.totalProcessed;
        }

        this._updatePerformanceMetrics();
    }

    _handleError(data) {
        // Track error metrics
        this.metrics.errors = (this.metrics.errors || 0) + 1;
    }

    /**
     * Update performance metrics with comprehensive calculations
     */
    _updatePerformanceMetrics() {
        const now = Date.now();
        const elapsed = (now - this._startTime) / 1000; // in seconds
        const interval = (now - this._lastUpdateTime) / 1000; // in seconds

        if (elapsed > 0) {
            this.metrics.performance.throughput = this.metrics.reasoningSteps / elapsed;
        }

        if (this.metrics.taskProcessing.totalProcessed > 0) {
            this.metrics.performance.avgLatency = this.metrics.taskProcessing.avgProcessingTime;
        }

        // Calculate efficiency as ratio of successful tasks
        if (this.metrics.taskProcessing.totalProcessed > 0) {
            this.metrics.performance.efficiency =
                this.metrics.taskProcessing.successful / this.metrics.taskProcessing.totalProcessed;
        }

        // Update resource usage if possible
        this._updateResourceUsage();

        // Update history for trend analysis
        this.history.throughput.push({
            value: this.metrics.performance.throughput,
            timestamp: now
        });
        this.history.memoryUsage.push({
            value: this.metrics.resourceUsage.memory,
            timestamp: now
        });
        this.history.processingTime.push({
            value: this.metrics.taskProcessing.avgProcessingTime,
            timestamp: now
        });

        this._trimHistory('throughput');
        this._trimHistory('memoryUsage');
        this._trimHistory('processingTime');

        // Check for anomalies
        this._checkAnomalies();

        // Update last update time
        this._lastUpdateTime = now;
    }

    /**
     * Update resource usage metrics
     */
    _updateResourceUsage() {
        const memUsage = getMemoryUsage();
        if (memUsage) {
            this.metrics.resourceUsage.heapUsed = memUsage.heapUsed;
            this.metrics.resourceUsage.heapTotal = memUsage.heapTotal;
            this.metrics.resourceUsage.memory = memUsage.heapUsed;
        }
    }

    /**
     * Check for metric anomalies
     */
    _checkAnomalies() {
        if (!this.config.anomalyDetectionEnabled) {
            return;
        }

        // Check throughput anomalies
        const throughputDetector = this.anomalyDetectors.get('throughput');
        if (throughputDetector && this.history.throughput.length > 5) {
            const currentValue = this.metrics.performance.throughput;
            const throughputHistory = this.history.throughput.map(h => h.value);

            if (throughputDetector.detect(currentValue, throughputHistory)) {
                this._handleAnomaly('throughput', currentValue);
            }
        }

        // Check memory anomalies
        const memoryDetector = this.anomalyDetectors.get('memory');
        if (memoryDetector && this.history.memoryUsage.length > 5) {
            const currentValue = this.metrics.resourceUsage.memory;
            const memoryHistory = this.history.memoryUsage.map(h => h.value);

            if (memoryDetector.detect(currentValue, memoryHistory)) {
                this._handleAnomaly('memory', currentValue);
            }
        }

        // Check for threshold alerts
        this._checkThresholdAlerts();
    }

    /**
     * Check for threshold alerts
     */
    _checkThresholdAlerts() {
        if (!this.config.thresholdAlerts) {
            return;
        }

        for (const [alertName, alertConfig] of this.thresholdAlerts) {
            const value = this.metrics[alertConfig.metric];
            if (value !== undefined && alertConfig.condition(value, this.config.maxMemory || Infinity)) {
                this._handleThresholdAlert(alertName, alertConfig, value);
            }
        }
    }

    /**
     * Handle detected anomaly
     */
    _handleAnomaly(type, value) {
        // Emit anomaly event
        if (this.eventBus) {
            this.eventBus.emit('metrics.anomaly', {
                type,
                value,
                timestamp: Date.now(),
                severity: 'medium'
            });
        }

        // Log anomaly
        //Logger.warn(`Metric anomaly detected: ${type} = ${value}`);
    }

    /**
     * Handle threshold alert
     */
    _handleThresholdAlert(alertName, config, value) {
        // Emit threshold alert event
        if (this.eventBus) {
            this.eventBus.emit('metrics.threshold_alert', {
                alertName,
                metric: config.metric,
                value,
                threshold: config.threshold,
                severity: config.severity,
                timestamp: Date.now()
            });
        }

        // Log alert
        Logger.warn(`Threshold alert: ${alertName} - ${config.metric} = ${value}, threshold = ${config.threshold}`);
    }

    /**
     * Trim history to maintain size limits
     */
    _trimHistory(key) {
        if (this.history[key] && this.history[key].length > this.config.historySize) {
            this.history[key] = this.history[key].slice(-Math.floor(this.config.historySize / 2));
        }
    }

    /**
     * Emit metrics event
     */
    _emitMetricsEvent() {
        if (this.eventBus) {
            this.eventBus.emit('metrics.updated', this.getMetricsSnapshot());
        }
    }

    /**
     * Get current metrics snapshot
     */
    getMetricsSnapshot() {
        return {
            ...this.metrics,
            uptime: Date.now() - this._startTime,
            timestamp: Date.now(),
            historySizes: {
                reasoningSteps: this.history.reasoningSteps.length,
                throughput: this.history.throughput.length,
                memoryUsage: this.history.memoryUsage.length,
                processingTime: this.history.processingTime.length
            }
        };
    }

    /**
     * Get detailed metrics including trends and analysis
     */
    getDetailedMetrics() {
        return {
            ...this.getMetricsSnapshot(),
            trends: this._calculateTrends(),
            efficiencyMetrics: this._calculateEfficiencyMetrics(),
            resourceUtilization: this._calculateResourceUtilization()
        };
    }

    /**
     * Calculate metric trends
     */
    _calculateTrends() {
        const trends = {};

        // Calculate throughput trend
        if (this.history.throughput.length >= 10) {
            const recent = this.history.throughput.slice(-5);
            const earlier = this.history.throughput.slice(-10, -5);

            if (earlier.length > 0) {
                const recentAvg = recent.reduce((sum, h) => sum + h.value, 0) / recent.length;
                const earlierAvg = earlier.reduce((sum, h) => sum + h.value, 0) / earlier.length;
                trends.throughput = recentAvg > earlierAvg ? 'improving' : recentAvg < earlierAvg ? 'declining' : 'stable';
            }
        }

        return trends;
    }

    /**
     * Calculate efficiency metrics
     */
    _calculateEfficiencyMetrics() {
        return {
            successRate: this.metrics.taskProcessing.totalProcessed > 0 ?
                this.metrics.taskProcessing.successful / this.metrics.taskProcessing.totalProcessed : 0,
            failureRate: this.metrics.taskProcessing.totalProcessed > 0 ?
                this.metrics.taskProcessing.failed / this.metrics.taskProcessing.totalProcessed : 0,
            ruleApplicationSuccessRate: this.metrics.ruleApplications > 0 ?
                this.metrics.inferences / this.metrics.ruleApplications : 0
        };
    }

    /**
     * Calculate resource utilization
     */
    _calculateResourceUtilization() {
        return {
            memoryUtilization: this.metrics.resourceUsage.heapTotal > 0 ?
                this.metrics.resourceUsage.heapUsed / this.metrics.resourceUsage.heapTotal : 0,
            averageProcessingTime: this.metrics.taskProcessing.avgProcessingTime,
            tasksPerSecond: this.metrics.performance.throughput
        };
    }

    /**
     * Record a reasoning step
     */
    recordStep(stepData = {}) {
        this.metrics.reasoningSteps++;
        if (stepData.processingTime) {
            this.metrics.processingTime += stepData.processingTime;
        }
        this._updatePerformanceMetrics();
    }

    /**
     * Record an inference
     */
    recordInference(inferenceData = {}) {
        this.metrics.inferences++;
        this._updatePerformanceMetrics();
    }

    /**
     * Record rule application
     */
    recordRuleApplication(ruleData = {}) {
        this.metrics.ruleApplications++;

        if (ruleData?.ruleType) {
            const count = this.metrics.ruleApplicationsByType.get(ruleData.ruleType) || 0;
            this.metrics.ruleApplicationsByType.set(ruleData.ruleType, count + 1);
        }

        this._updatePerformanceMetrics();
    }

    /**
     * Get rule application statistics
     */
    getRuleApplicationStats() {
        const stats = {};
        for (const [ruleType, count] of this.metrics.ruleApplicationsByType) {
            stats[ruleType] = count;
        }
        return stats;
    }

    /**
     * Perform self-optimization based on metrics
     */
    async performSelfOptimization() {
        try {
            const detailedMetrics = this.getDetailedMetrics();
            const optimizations = [];

            // Identify optimization opportunities based on metrics
            if (detailedMetrics.efficiencyMetrics.successRate < 0.8) {
                optimizations.push({
                    type: 'quality_improvement',
                    priority: 'high',
                    reason: 'Low task processing success rate'
                });
            }

            if (detailedMetrics.resourceUtilization.memoryUtilization > 0.8) {
                optimizations.push({
                    type: 'memory_optimization',
                    priority: 'high',
                    reason: 'High memory utilization'
                });
            }

            if (detailedMetrics.trends?.throughput === 'declining') {
                optimizations.push({
                    type: 'performance_improvement',
                    priority: 'medium',
                    reason: 'Declining throughput trend'
                });
            }

            // Emit optimization recommendations
            if (this.eventBus && optimizations.length > 0) {
                this.eventBus.emit('metrics.optimization_recommendations', {
                    optimizations,
                    timestamp: Date.now()
                });
            }

            return optimizations;
        } catch (error) {
            logError(error, {context: 'self_optimization'}, 'error');
            return [];
        }
    }

    /**
     * Reset all metrics
     */
    reset() {
        this.metrics = {
            reasoningSteps: 0,
            inferences: 0,
            ruleApplications: 0,
            ruleApplicationsByType: new Map(),
            processingTime: 0,
            memoryUsage: 0,
            taskProcessing: {
                totalProcessed: 0,
                successful: 0,
                failed: 0,
                avgProcessingTime: 0
            },
            performance: {
                throughput: 0,
                avgLatency: 0,
                efficiency: 0,
                cpuUsage: 0
            },
            resourceUsage: {
                memory: 0,
                cpu: 0,
                heapUsed: 0,
                heapTotal: 0
            },
            quality: {
                derivationQuality: 0,
                truthValueStability: 0,
                confidenceTrend: 0
            },
            errors: 0
        };

        // Reset history
        for (const key in this.history) {
            this.history[key] = [];
        }

        this._startTime = Date.now();
        this._lastUpdateTime = Date.now();
    }

    /**
     * Shutdown the metrics monitor
     */
    shutdown() {
        if (this._reportingInterval) {
            clearInterval(this._reportingInterval);
            this._reportingInterval = null;
        }

        // Clear event handlers if possible
        if (this.eventBus) {
            this.eventBus.removeAllListeners('reasoning.step');
            this.eventBus.removeAllListeners('reasoning.inference');
            this.eventBus.removeAllListeners('rule.application');
            this.eventBus.removeAllListeners('task.processed');
            this.eventBus.removeAllListeners('error');
            this.eventBus.removeAllListeners('metrics.updated');
            this.eventBus.removeAllListeners('metrics.anomaly');
            this.eventBus.removeAllListeners('metrics.threshold_alert');
            this.eventBus.removeAllListeners('metrics.optimization_recommendations');
        }
    }

    /**
     * Get performance summary
     */
    getPerformanceSummary() {
        const snapshot = this.getMetricsSnapshot();
        return {
            throughput: snapshot.performance.throughput,
            efficiency: snapshot.performance.efficiency,
            avgLatency: snapshot.performance.avgLatency,
            memoryUtilization: snapshot.resourceUsage.heapTotal > 0 ?
                snapshot.resourceUsage.heapUsed / snapshot.resourceUsage.heapTotal : 0,
            successRate: snapshot.taskProcessing.totalProcessed > 0 ?
                snapshot.taskProcessing.successful / snapshot.taskProcessing.totalProcessed : 0,
            uptime: snapshot.uptime,
            totalTasksProcessed: snapshot.taskProcessing.totalProcessed
        };
    }
}