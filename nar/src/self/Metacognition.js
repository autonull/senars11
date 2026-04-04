import {BaseComponent} from '@senars/core';
import {IntrospectionEvents} from '@senars/core';

class PerformanceAnalyzer {
    constructor(config = {}) {
        this.config = config;
        this.metrics = {
            cycleCount: 0,
            totalCycleTime: 0,
            termCacheHits: 0,
            termCacheMisses: 0,
        };
    }

    analyze(event) {
        if (event.eventName === IntrospectionEvents.CYCLE_START) {
            this.metrics.cycleCount++;
            this.lastCycleStartTime = event.timestamp;
        }

        if (event.eventName === IntrospectionEvents.CYCLE_END) {
            if (this.lastCycleStartTime) {
                this.metrics.totalCycleTime += event.timestamp - this.lastCycleStartTime;
            }
        }

        if (event.eventName === IntrospectionEvents.TERM_CACHE_HIT) {
            this.metrics.termCacheHits++;
        }

        if (event.eventName === IntrospectionEvents.TERM_CACHE_MISS) {
            this.metrics.termCacheMisses++;
        }

        const findings = [];
        const avgCycleTime = this.metrics.cycleCount > 0 ? this.metrics.totalCycleTime / this.metrics.cycleCount : 0;
        const cacheHitRate = (this.metrics.termCacheHits + this.metrics.termCacheMisses) > 0 ? this.metrics.termCacheHits / (this.metrics.termCacheHits + this.metrics.termCacheMisses) : 0;

        if (avgCycleTime > (this.config.avgCycleTimeThreshold || 100)) {
            findings.push({
                type: 'high_cycle_time',
                value: avgCycleTime,
                belief: `<(SELF, has_property, high_cycle_time) --> TRUE>.`,
            });
        }

        if (cacheHitRate < (this.config.cacheHitRateThreshold || 0.8)) {
            findings.push({
                type: 'low_cache_hit_rate',
                value: cacheHitRate,
                belief: `<(SELF, has_property, low_cache_hit_rate) --> TRUE>.`,
            });
        }

        return findings;
    }
}

export class Metacognition extends BaseComponent {
    constructor(config = {}, eventBus = null, nar = null) {
        super(config, 'Metacognition', eventBus);
        this.nar = nar;
        this.analyzers = this._loadAnalyzers(config.analyzers || ['PerformanceAnalyzer']);
    }

    _loadAnalyzers(analyzerNames) {
        const analyzerClasses = {
            PerformanceAnalyzer,
        };

        return analyzerNames.map(name => {
            const AnalyzerClass = analyzerClasses[name];
            if (AnalyzerClass) {
                return new AnalyzerClass(this.config[name]);
            }
            this.logWarn(`Analyzer "${name}" not found.`);
            return null;
        }).filter(Boolean);
    }

    start() {
        if (!this.eventBus) {
            this.logError('EventBus is not available.');
            return;
        }

        Object.values(IntrospectionEvents).forEach(eventName => {
            this.eventBus.on(eventName, (event) => this.handleEvent(event));
        });

        super.start();
    }

    handleEvent(event) {
        this.logDebug(`Handling event: ${event.eventName}`, event);
        this.analyzers.forEach(analyzer => {
            const findings = analyzer.analyze(event);
            if (findings && findings.length > 0) {
                this.logDebug('Findings:', findings);
                this.processFindings(findings);
            }
        });
    }

    processFindings(findings) {
        findings.forEach(finding => {
            this.logInfo(`Metacognition finding: ${finding.type} - ${finding.value}`);
            if (this.nar && finding.belief) {
                this.nar.input(finding.belief);
            }
        });
    }
}
