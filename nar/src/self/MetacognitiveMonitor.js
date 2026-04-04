import { logError } from '../reason/utils/error.js';

export class MetacognitiveMonitor {
    constructor(nar, config = {}) {
        this.nar = nar;
        this.config = {
            maxTraceSize: 1000,
            maxPerformanceHistory: 100,
            monitoringInterval: 1000,
            minThroughput: 0.1,
            maxAvgProcessingTime: 1000,
            maxMemoryUsage: 100000000,
            ...config
        };
        this.reasoningTrace = [];
        this.performanceHistory = [];
        this.performanceMonitors = new Map();
        this._setupMonitoring();
    }

    _setupMonitoring() {
        if (this.nar?.on) {
            this.nar.on('reasoning.step', (data) => this._recordReasoningStep(data));
            this.nar.on('reasoning.metrics', (metrics) => this._analyzePerformance(metrics));
            this.nar.on('reasoning.error', (errorData) => this._recordError(errorData));
            this.nar.on('task.processed', (taskData) => this._recordTaskProcessing(taskData));
            this.nar.on('memory.changed', (memoryData) => this._recordMemoryChange(memoryData));
        }
        if (this.nar?.streamReasoner?.on) {
            this.nar.streamReasoner.on('step', (data) => this._recordReasoningStep(data));
            this.nar.streamReasoner.on('metrics', (metrics) => this._analyzePerformance(metrics));
        }
    }

    _recordReasoningStep(stepData) {
        this.reasoningTrace.push({ timestamp: Date.now(), stepData, context: this._getCurrentContext() });
        if (this.reasoningTrace.length > this.config.maxTraceSize) {
            this.reasoningTrace = this.reasoningTrace.slice(-Math.floor(this.config.maxTraceSize / 2));
        }
    }

    _recordError(errorData) {
        this.reasoningTrace.push({ timestamp: Date.now(), type: 'error', errorData, context: this._getCurrentContext() });
    }

    _recordTaskProcessing(taskData) {
        this.reasoningTrace.push({ timestamp: Date.now(), type: 'task_processing', taskData, context: this._getCurrentContext() });
    }

    _recordMemoryChange(memoryData) {
        this.reasoningTrace.push({ timestamp: Date.now(), type: 'memory_change', memoryData, context: this._getCurrentContext() });
    }

    _analyzePerformance(metrics) {
        const performanceRecord = { ...metrics, timestamp: Date.now(), systemContext: this._getCurrentContext() };
        this.performanceHistory.push(performanceRecord);
        if (this.performanceHistory.length > this.config.maxPerformanceHistory) {
            this.performanceHistory = this.performanceHistory.slice(-Math.floor(this.config.maxPerformanceHistory / 2));
        }
        const issues = this._detectPerformanceIssues(metrics);
        this._updatePerformanceMonitors(performanceRecord);
        return issues;
    }

    _updatePerformanceMonitors(metrics) {
        const metricNames = ['throughput', 'avgProcessingTime', 'memoryUsage', 'cpuThrottleCount'];
        for (const metricName of metricNames) {
            if (metrics[metricName] !== undefined) {
                const currentMonitor = this.performanceMonitors.get(metricName) || {
                    currentValue: 0, trend: 0, stability: 0, history: [], alerts: []
                };
                currentMonitor.history.push({ value: metrics[metricName], timestamp: Date.now() });
                if (currentMonitor.history.length > 50) {
                    currentMonitor.history = currentMonitor.history.slice(-25);
                }
                if (currentMonitor.history.length >= 2) {
                    const recent = currentMonitor.history[currentMonitor.history.length - 1].value;
                    const previous = currentMonitor.history[currentMonitor.history.length - 2].value;
                    currentMonitor.trend = recent - previous;
                }
                if (currentMonitor.history.length > 1) {
                    const values = currentMonitor.history.map(h => h.value);
                    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
                    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
                    currentMonitor.stability = 1 / (1 + Math.sqrt(variance));
                }
                currentMonitor.currentValue = metrics[metricName];
                this.performanceMonitors.set(metricName, currentMonitor);
            }
        }
    }

    _detectPerformanceIssues(currentMetrics) {
        const issues = [];
        if (currentMetrics.throughput != null && currentMetrics.throughput < this.config.minThroughput) {
            issues.push({ type: 'low_throughput', severity: 'medium', value: currentMetrics.throughput, threshold: this.config.minThroughput });
        }
        if (currentMetrics.avgProcessingTime != null && currentMetrics.avgProcessingTime > this.config.maxAvgProcessingTime) {
            issues.push({ type: 'high_processing_time', severity: 'high', value: currentMetrics.avgProcessingTime, threshold: this.config.maxAvgProcessingTime });
        }
        if (currentMetrics.memoryUsage != null && currentMetrics.memoryUsage > this.config.maxMemoryUsage) {
            issues.push({ type: 'memory_pressure', severity: 'high', value: currentMetrics.memoryUsage, threshold: this.config.maxMemoryUsage });
        }
        return issues;
    }

    _getCurrentContext() {
        return {
            memorySize: this.nar?.memory?.getConceptCount?.() || 0,
            taskCount: this.nar?.taskManager?.getPendingTaskCount?.() || 0,
            activeRules: this.nar?.streamReasoner?.ruleProcessor?.ruleExecutor?.getRegisteredRuleCount?.() || 0,
            systemLoad: this.nar?.getSystemLoad?.() || 0,
            activeComponents: this._getActiveComponents(),
            timestamp: Date.now()
        };
    }

    _getActiveComponents() {
        const components = {};
        if (this.nar?.streamReasoner) components.streamReasoner = this.nar.streamReasoner.isRunning;
        if (this.nar?.taskManager) components.taskManager = true;
        if (this.nar?.memory) components.memory = true;
        if (this.nar?.inferenceEngine) components.inferenceEngine = true;
        return components;
    }

    _analyzeResourceUsage() {
        const resourceUsage = { memoryTrend: 'stable', cpuUsage: 'normal', taskProcessingRate: 'normal' };
        if (this.performanceHistory.length >= 5) {
            const recent = this.performanceHistory.slice(-5);
            const memoryValues = recent.map(m => m.memoryUsage).filter(v => v != null);
            if (memoryValues.length >= 2) {
                const first = memoryValues[0];
                const last = memoryValues[memoryValues.length - 1];
                resourceUsage.memoryTrend = last > first * 1.5 ? 'increasing_fast' :
                    last > first * 1.1 ? 'increasing' : last < first * 0.9 ? 'decreasing' : 'stable';
            }
        }
        return resourceUsage;
    }

    _analyzeTaskPatterns() {
        const taskSteps = this.reasoningTrace.filter(step => step.type === 'task_processing');
        const patternAnalysis = { processingRate: 0, commonTaskTypes: {}, bottlenecks: [] };
        if (taskSteps.length > 0) {
            const timeWindow = 60000;
            const recentTasks = taskSteps.filter(step => Date.now() - step.timestamp < timeWindow);
            patternAnalysis.processingRate = recentTasks.length / (timeWindow / 1000);
        }
        return patternAnalysis;
    }

    _analyzePerformanceTrends() {
        const trends = {};
        for (const [metricName, monitor] of this.performanceMonitors) {
            if (monitor.history.length >= 2) {
                const recent = monitor.history.slice(-5);
                trends[metricName] = {
                    currentTrend: monitor.trend, stability: monitor.stability,
                    recentValues: recent.map(h => h.value), isImproving: monitor.trend > 0
                };
            }
        }
        return trends;
    }

    _getPerformanceMonitors() {
        const monitors = {};
        for (const [name, monitor] of this.performanceMonitors) {
            monitors[name] = {
                currentValue: monitor.currentValue, trend: monitor.trend,
                stability: monitor.stability, historyLength: monitor.history.length
            };
        }
        return monitors;
    }

    _getPerformanceTrend() {
        if (this.performanceHistory.length < 2) return 'insufficient_data';
        const recent = this.performanceHistory.slice(-10);
        const avgThroughput = recent.reduce((sum, m) => sum + (m.throughput || 0), 0) / recent.length;
        const earlier = this.performanceHistory.slice(Math.max(0, this.performanceHistory.length - 20), -10);
        if (earlier.length === 0) return avgThroughput > 0 ? 'improving' : 'declining';
        const avgEarlierThroughput = earlier.reduce((sum, m) => sum + (m.throughput || 0), 0) / earlier.length;
        return avgThroughput > avgEarlierThroughput ? 'improving' : avgThroughput < avgEarlierThroughput ? 'declining' : 'stable';
    }

    _getPerformanceAnalysis() {
        if (this.performanceHistory.length === 0) return { status: 'no_data' };
        return {
            currentMetrics: this.performanceHistory[this.performanceHistory.length - 1],
            monitors: this._getPerformanceMonitors()
        };
    }

    _getResourceUsageAnalysis() {
        return {
            traceSize: this.reasoningTrace.length, historySize: this.performanceHistory.length,
            monitorsCount: this.performanceMonitors.size, metaTasksCount: 0
        };
    }

    getReasoningTrace() { return [...this.reasoningTrace]; }

    getMonitorState() {
        return {
            reasoningSteps: this.reasoningTrace.length,
            performance: this._getPerformanceTrend(),
            lastUpdate: Date.now(),
            monitorsActive: this.performanceMonitors.size
        };
    }

    shutdown() {
        this.reasoningTrace = [];
        this.performanceHistory = [];
        this.performanceMonitors.clear();
    }
}
