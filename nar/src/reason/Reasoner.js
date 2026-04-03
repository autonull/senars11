import {EventEmitter} from 'eventemitter3';
import {Logger} from '@senars/core/src/util/Logger.js';
import {getHeapUsed} from '@senars/core/src/util/common.js';
import {SimpleRunner} from './exec/SimpleRunner.js';
import {PipelineRunner} from './exec/PipelineRunner.js';
import {isAsyncRule, isSynchronousRule} from './RuleHelpers.js';

/**
 * The main Reasoner class that manages the continuous reasoning pipeline.
 * It delegates the execution loop to a Runner strategy (Simple or Pipeline).
 */
export class Reasoner extends EventEmitter {
    constructor(premiseSource, strategy, ruleProcessor, config = {}) {
        super();
        this.premiseSource = premiseSource;
        this.strategy = strategy;
        this.ruleProcessor = ruleProcessor;
        this.config = {
            maxDerivationDepth: 10,
            cpuThrottleInterval: 0,
            backpressureThreshold: 100,
            backpressureInterval: 10,
            executionMode: 'simple',
            executionInterval: 100,
            maxDerivationsPerStep: 1000,
            ...config
        };

        this.runner = this.config.executionMode === 'pipeline'
            ? new PipelineRunner(this, this.config)
            : new SimpleRunner(this, this.config);

        this.consumerFeedbackHandlers = [];
    }

    get isRunning() {
        return this.runner.isRunning;
    }

    start() {
        if (this.runner.isRunning) {
            Logger.warn('Reasoner is already running');
            return;
        }
        this.runner.start();
    }

    async stop() {
        await this.runner.stop();
    }

    async step(timeoutMs = 5000, suppressEvents = false) {
        const results = [];
        const startTime = Date.now();
        const focusTasks = this.premiseSource.focusComponent?.getTasks(1000) ?? [];

        if (focusTasks.length === 0) return results;

        const sortedFocusTasks = [...focusTasks];
        this._shuffleArray(focusTasks);
        const processedPairs = new Set();

        try {
            for (const primaryPremise of focusTasks) {
                if (this._shouldStopStep(startTime, timeoutMs, results.length)) break;

                await this._processSinglePremise(primaryPremise, results, startTime, timeoutMs, suppressEvents);
                await this._processDualPremises(
                    primaryPremise,
                    sortedFocusTasks,
                    processedPairs,
                    results,
                    startTime,
                    timeoutMs,
                    suppressEvents
                );
            }
        } catch (error) {
            Logger.debug('Error in step method:', error.message);
        }
        return results;
    }

    _shouldStopStep(startTime, timeoutMs, resultCount) {
        return (Date.now() - startTime > timeoutMs) || (resultCount >= this.config.maxDerivationsPerStep);
    }

    async _processSinglePremise(primaryPremise, results, startTime, timeoutMs, suppressEvents) {
        try {
            const candidateRules = this.ruleProcessor.ruleExecutor.getCandidateRules(primaryPremise, null);
            const forwardResults = await this._processRuleBatch(
                candidateRules, primaryPremise, null, startTime, timeoutMs, suppressEvents
            );
            if (forwardResults.length > 0) {
                results.push(...forwardResults.filter(Boolean));
            }
        } catch (error) {
            Logger.debug('Error processing single premise:', error.message);
        }
    }

    async _processDualPremises(primaryPremise, sortedFocusTasks, processedPairs, results, startTime, timeoutMs, suppressEvents) {
        try {
            const secondaryPremises = await this.strategy.selectSecondaryPremises(primaryPremise, sortedFocusTasks);

            for (const secondaryPremise of secondaryPremises) {
                if (this._shouldStopStep(startTime, timeoutMs, results.length)) break;

                if (this._isProcessedPair(primaryPremise, secondaryPremise, processedPairs)) continue;

                const candidateRules = this.ruleProcessor.ruleExecutor.getCandidateRules(primaryPremise, secondaryPremise);
                const forwardResults = await this._processRuleBatch(
                    candidateRules, primaryPremise, secondaryPremise, startTime, timeoutMs, suppressEvents
                );
                if (forwardResults.length > 0) {
                    results.push(...forwardResults.filter(Boolean));
                }
            }
        } catch (error) {
            Logger.debug('Error processing premise pair:', error.message);
        }
    }

    _isProcessedPair(p1, p2, processedPairs) {
        const id1 = this._getTermId(p1);
        const id2 = this._getTermId(p2);

        if (id1 === id2) return true;

        const pairId = id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
        if (processedPairs.has(pairId)) return true;

        processedPairs.add(pairId);
        return false;
    }

    _getTermId(task) {
        return task?.term?._id || task?.term?._name || task?.term || 'unknown';
    }

    _shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    async _processRuleBatch(candidateRules, p1, p2, startTime, maxTimeMs, suppressEvents = false) {
        const results = [];

        for (const rule of candidateRules) {
            if (Date.now() - startTime > maxTimeMs) break;

            try {
                const derivedTasks = await this._executeRule(rule, p1, p2);

                if (derivedTasks?.length > 0) {
                    for (const task of derivedTasks) {
                        const processedResult = this._processDerivation(task, suppressEvents);
                        if (processedResult) results.push(processedResult);
                    }
                }
            } catch (error) {
                Logger.error(`Error executing rule ${rule.id}:`, error);
            }
        }
        return results;
    }

    async _executeRule(rule, p1, p2) {
        if (isSynchronousRule(rule)) {
            return this.ruleProcessor.processSyncRule(rule, p1, p2);
        } else if (isAsyncRule(rule)) {
            if (this.ruleProcessor && typeof this.ruleProcessor.executeAsyncRule === 'function') {
                return await this.ruleProcessor.executeAsyncRule(rule, p1, p2);
            } else if (rule.apply) {
                return await rule.apply(p1, p2);
            }
        }
        return [];
    }

    _processDerivation(derivation, suppressEvents = false) {
        if (!suppressEvents) this.emit('derivation', derivation);
        return derivation;
    }

    getMetrics() {
        const runnerMetrics = this.runner.getMetrics ? this.runner.getMetrics() : {};
        return {
            ...runnerMetrics,
            ruleProcessorStats: this.ruleProcessor.getStats?.() ?? null
        };
    }

    registerConsumerFeedbackHandler(handler) {
        this.consumerFeedbackHandlers ??= [];
        this.consumerFeedbackHandlers.push(handler);
    }

    notifyConsumption(derivation, processingTime, consumerInfo = {}) {
        if (this.consumerFeedbackHandlers?.length > 0) {
            this.consumerFeedbackHandlers.forEach(handler => {
                try {
                    handler(derivation, processingTime, {
                        ...consumerInfo,
                        timestamp: Date.now(),
                        queueLength: 0
                    });
                } catch (error) {
                    Logger.error('Error in consumer feedback handler:', error);
                }
            });
        }
    }

    getState() {
        return {
            isRunning: this.isRunning,
            config: this.config,
            metrics: this.getMetrics(),
            components: {
                premiseSource: this.premiseSource.constructor.name,
                strategy: this.strategy.constructor.name,
                ruleProcessor: this.ruleProcessor.constructor.name,
                runner: this.runner.constructor.name
            },
            timestamp: Date.now()
        };
    }

    getComponentStatus() {
        return {
            premiseSource: this._getComponentStatus(this.premiseSource, 'PremiseSource'),
            strategy: this._getComponentStatus(this.strategy, 'Strategy'),
            ruleProcessor: this._getComponentStatus(this.ruleProcessor, 'RuleProcessor'),
            runner: this.runner.constructor.name
        };
    }

    _getComponentStatus(component, componentName) {
        const status = {
            name: componentName,
            type: component.constructor.name
        };

        if (typeof component.getStatus === 'function') {
            try {
                return {...status, ...component.getStatus()};
            } catch (e) {
                Logger.warn(`Error getting ${componentName} status:`, e.message);
                return {...status, error: e.message};
            }
        }

        return status;
    }

    getDebugInfo() {
        return {
            state: this.getState(),
            config: this.config,
            metrics: this.getMetrics(),
            componentStatus: this.getComponentStatus(),
            timestamp: Date.now()
        };
    }

    receiveConsumerFeedback(feedback) {
        if (this.runner.receiveConsumerFeedback) {
            this.runner.receiveConsumerFeedback(feedback);
        }
    }

    async cleanup() {
        await this.stop();
        this.removeAllListeners();
    }
}
