import {EventEmitter} from 'eventemitter3';
import {Logger} from '../util/Logger.js';
import {getHeapUsed} from '../util/common.js';
import {SimpleRunner} from './exec/SimpleRunner.js';
import {PipelineRunner} from './exec/PipelineRunner.js';
import {isAsyncRule, isSynchronousRule} from './RuleHelpers.js';

/**
 * The main Reasoner class that manages the continuous reasoning pipeline.
 * It delegates the execution loop to a Runner strategy (Simple or Pipeline).
 */
export class Reasoner extends EventEmitter {
    /**
     * @param {PremiseSource} premiseSource - The source of premises
     * @param {Strategy} strategy - The strategy for premise pairing
     * @param {RuleProcessor} ruleProcessor - The processor for rules
     * @param {object} config - Configuration options
     */
    constructor(premiseSource, strategy, ruleProcessor, config = {}) {
        super();
        this.premiseSource = premiseSource;
        this.strategy = strategy;
        this.ruleProcessor = ruleProcessor;
        this.config = {
            maxDerivationDepth: config.maxDerivationDepth ?? 10,
            cpuThrottleInterval: config.cpuThrottleInterval ?? 0,
            backpressureThreshold: config.backpressureThreshold ?? 100,
            backpressureInterval: config.backpressureInterval ?? 10,
            executionMode: config.executionMode ?? 'simple',
            executionInterval: config.executionInterval ?? 100,
            ...config
        };

        if (this.config.executionMode === 'pipeline') {
            this.runner = new PipelineRunner(this, this.config);
        } else {
            this.runner = new SimpleRunner(this, this.config);
        }

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
        try {
            const startTime = Date.now();
            const focusTasks = this.premiseSource.focusComponent?.getTasks(1000) ?? [];
            if (focusTasks.length === 0) return results;

            this._shuffleArray(focusTasks);
            const processedPairs = new Set();

            for (const primaryPremise of focusTasks) {
                if (Date.now() - startTime > timeoutMs) break;

                // Single premise processing (e.g. for LM rules)
                try {
                    const candidateRules = this.ruleProcessor.ruleExecutor.getCandidateRules(primaryPremise, null);
                    const forwardResults = await this._processRuleBatch(
                        candidateRules,
                        primaryPremise,
                        null,
                        startTime,
                        timeoutMs,
                        suppressEvents
                    );
                    if (forwardResults.length > 0) {
                        results.push(...forwardResults.filter(Boolean));
                    }
                } catch (error) {
                    Logger.debug('Error processing single premise:', error.message);
                }

                // Dual premise processing using Strategy
                try {
                    const secondaryPremises = await this.strategy.selectSecondaryPremises(primaryPremise);

                    for (const secondaryPremise of secondaryPremises) {
                        if (Date.now() - startTime > timeoutMs) break;

                        const primaryTermId = this._getTermId(primaryPremise);
                        const secondaryTermId = this._getTermId(secondaryPremise);

                        if (primaryTermId === secondaryTermId) continue;

                        const pairId = primaryTermId < secondaryTermId
                            ? `${primaryTermId}-${secondaryTermId}`
                            : `${secondaryTermId}-${primaryTermId}`;

                        if (processedPairs.has(pairId)) continue;
                        processedPairs.add(pairId);

                        const candidateRules = this.ruleProcessor.ruleExecutor.getCandidateRules(primaryPremise, secondaryPremise);
                        const forwardResults = await this._processRuleBatch(
                            candidateRules,
                            primaryPremise,
                            secondaryPremise,
                            startTime,
                            timeoutMs,
                            suppressEvents
                        );
                        if (forwardResults.length > 0) {
                            results.push(...forwardResults.filter(Boolean));
                        }
                    }
                } catch (error) {
                    Logger.debug('Error processing premise pair:', error.message);
                }
            }
        } catch (error) {
            Logger.debug('Error in step method:', error.message);
        }
        return results;
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

    /**
     * Process a batch of rules for a premise pair
     * @private
     */
    async _processRuleBatch(candidateRules, primaryPremise, secondaryPremise, startTime, maxTimeMs, suppressEvents = false) {
        const results = [];

        for (const rule of candidateRules) {
            if (Date.now() - startTime > maxTimeMs) break;

            if (isSynchronousRule(rule)) {
                const derivedTasks = this.ruleProcessor.processSyncRule(rule, primaryPremise, secondaryPremise);
                for (const task of derivedTasks) {
                    const processedResult = this._processDerivation(task, suppressEvents);
                    if (processedResult) results.push(processedResult);
                }
            } else if (isAsyncRule(rule)) {
                try {
                    let derivedTasks = [];
                    if (this.ruleProcessor && typeof this.ruleProcessor.executeAsyncRule === 'function') {
                        derivedTasks = await this.ruleProcessor.executeAsyncRule(rule, primaryPremise, secondaryPremise);
                    } else if (rule.apply) {
                        derivedTasks = await rule.apply(primaryPremise, secondaryPremise);
                    }

                    for (const task of derivedTasks) {
                        const processedResult = this._processDerivation(task, suppressEvents);
                        if (processedResult) results.push(processedResult);
                    }
                } catch (error) {
                    Logger.error(`Error executing async rule ${rule.id}:`, error);
                }
            }
        }
        return results;
    }

    _processDerivation(derivation, suppressEvents = false) {
        // Return the derivation for centralized processing by the NAR
        // Emit event for subscribers (like NAR) to handle the derivation
        if (!suppressEvents) {
            this.emit('derivation', derivation);
        }
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
                        queueLength: 0 // Simplification for now
                    });
                } catch (error) {
                    Logger.error('Error in consumer feedback handler:', error);
                }
            });
        }
    }

    resetMetrics() {
        // Delegate reset if supported
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

    // Legacy method for compatibility if needed
    getPerformanceMetrics() {
        return {
            throughput: 0,
            avgProcessingTime: 0,
            memoryUsage: getHeapUsed(),
            ...this.getMetrics()
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
