/**
 * ReasoningAboutReasoning - Meta-cognitive reasoning orchestrator
 */
import { logError } from '../reason/utils/error.js';
import { MetacognitiveMonitor } from './MetacognitiveMonitor.js';
import { SelfAnalyzer } from './SelfAnalyzer.js';

export class ReasoningAboutReasoning {
    constructor(nar, config = {}) {
        this.nar = nar;
        this.config = {
            maxTraceSize: 1000,
            maxPerformanceHistory: 100,
            monitoringInterval: 1000,
            reasoningInterval: 30000,
            selfCorrectionEnabled: true,
            ...config
        };
        this.selfModels = new Map();
        this.monitor = new MetacognitiveMonitor(nar, this.config);
        this.analyzer = new SelfAnalyzer(nar, this.monitor, this.config);

        this._startPeriodicSelfAnalysis();
    }

    _startPeriodicSelfAnalysis() {
        if (this.config.reasoningInterval > 0) {
            this._periodicAnalysisInterval = setInterval(async () => {
                try { await this.performMetaCognitiveReasoning(); }
                catch (error) { logError(error, { context: 'periodic_meta_cognition' }, 'warn'); }
            }, this.config.reasoningInterval);
        }
    }

    async performMetaCognitiveReasoning() {
        const result = await this.analyzer.performMetaCognitiveReasoning();
        // Attach monitor data
        result.monitorState = this.monitor.getMonitorState();
        return result;
    }

    async performSelfCorrection(issues = null) {
        return this.analyzer.performSelfCorrection(issues);
    }

    querySystemState(query) {
        return {
            reasoningTrace: this.monitor.getReasoningTrace().slice(-10),
            performanceTrend: this.monitor._getPerformanceTrend(),
            currentContext: this.monitor._getCurrentContext(),
            selfModels: Array.from(this.selfModels.entries()),
            performanceMonitors: this.monitor._getPerformanceMonitors(),
            activeMetaTasks: this.analyzer.metaCognitiveTasks.length
        };
    }

    getReasoningTrace() { return this.monitor.getReasoningTrace(); }

    getReasoningState() {
        const monitorState = this.monitor.getMonitorState();
        return {
            active: this.nar?.isRunning || false,
            reasoningSteps: monitorState.reasoningSteps,
            performance: monitorState.performance,
            lastUpdate: Date.now(),
            systemLoad: this.monitor._getCurrentContext(),
            monitorsActive: monitorState.monitorsActive,
            pendingMetaTasks: this.analyzer.metaCognitiveTasks.length
        };
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    async getSystemAnalysis() {
        return this.analyzer.getSystemAnalysis();
    }

    shutdown() {
        if (this._periodicAnalysisInterval) {
            clearInterval(this._periodicAnalysisInterval);
            this._periodicAnalysisInterval = null;
        }
        this.monitor.shutdown();
        this.analyzer.shutdown();
    }
}
