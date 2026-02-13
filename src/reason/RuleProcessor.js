import {mergeConfig, processDerivation, sleep} from './utils/common.js';
import {logError, ReasonerError} from './utils/error.js';
import {Queue} from '../util/Queue.js';
import {ArrayStamp} from '../Stamp.js';

/**
 * RuleProcessor consumes premise pairs and processes them through rules.
 */
export class RuleProcessor {
    constructor(ruleExecutor, config = {}) {
        this.ruleExecutor = ruleExecutor;

        this.config = mergeConfig({
            maxDerivationDepth: 10,
            backpressureThreshold: 50,
            backpressureInterval: 5,
            maxChecks: 100,
            asyncWaitInterval: 10,
            termFactory: null
        }, config);

        this.asyncResultsQueue = new Queue(100);

        this.syncRuleExecutions = 0;
        this.asyncRuleExecutions = 0;

        this.maxQueueSize = 0;
    }

    async* process(premisePairStream, timeoutMs = 0, signal = null) {
        const startTime = Date.now();
        try {
            for await (const [primaryPremise, secondaryPremise] of premisePairStream) {
                if (signal?.aborted) {
                    break;
                }

                if (this._isTimeoutExceeded(startTime, timeoutMs)) {
                    console.debug(`RuleProcessor: timeout reached after ${timeoutMs}ms`);
                    break;
                }

                await this._checkAndApplyBackpressure();

                const candidateRules = this.ruleExecutor.getCandidateRules(primaryPremise, secondaryPremise);

                for (const rule of candidateRules) {
                    if (signal?.aborted) {
                        break;
                    }

                    if (this._isTimeoutExceeded(startTime, timeoutMs)) {
                        console.debug(`RuleProcessor: timeout reached after ${timeoutMs}ms`);
                        break;
                    }

                    try {
                        if (this._isSynchronousRule(rule)) {
                            yield* this._processSyncRule(rule, primaryPremise, secondaryPremise);
                        } else {
                            this._dispatchAsyncRule(rule, primaryPremise, secondaryPremise);
                        }
                    } catch (error) {
                        logError(error, {
                            ruleId: rule.id ?? rule.name,
                            context: 'rule_processing'
                        }, 'warn');
                        continue;
                    }
                }

                yield* this._yieldAsyncResults();
            }

            yield* this._processRemainingAsyncResults(timeoutMs, startTime, signal);
        } catch (error) {
            logError(error, {context: 'rule_processor_stream'});
            throw new ReasonerError(`Error in RuleProcessor process: ${error.message}`, 'STREAM_ERROR', {originalError: error});
        }
    }

    /**
     * Helper to check if timeout has been exceeded
     * @private
     */
    _isTimeoutExceeded(startTime, timeoutMs) {
        return timeoutMs > 0 && (Date.now() - startTime) > timeoutMs;
    }

    /**
     * Process a synchronous rule and yield results
     * @private
     */
    async* _processSyncRule(rule, primaryPremise, secondaryPremise) {
        const results = this.processSyncRule(rule, primaryPremise, secondaryPremise);
        for (const result of results) {
            yield result;
        }
    }

    processSyncRule(rule, primaryPremise, secondaryPremise) {
        this.syncRuleExecutions++;
        const ruleContext = this._createRuleContext();
        const results = this.ruleExecutor.executeRule(rule, primaryPremise, secondaryPremise, ruleContext);

        return results.map(result => {
            const enrichedResult = this.enrichResult(result, rule);
            return this._processDerivation(enrichedResult);
        }).filter(Boolean);
    }

    enrichResult(result, rule) {
        if (!result || !result.stamp) return result;
        const ruleName = rule.id || rule.name || 'UnknownRule';
        return result.clone({
            stamp: new ArrayStamp({
                id: result.stamp.id,
                creationTime: result.stamp.creationTime,
                source: `DERIVED:${ruleName}`,
                derivations: result.stamp.derivations,
                depth: result.stamp.depth
            })
        });
    }

    _createRuleContext() {
        return {
            termFactory: this.config.termFactory ?? this.config.context?.termFactory ?? null,
            ...(this.config.context ?? {})
        };
    }

    async* _yieldAsyncResults() {
        while (this._getAsyncResultsCount() > 0) {
            await this._checkAndApplyBackpressure();
            const result = this.asyncResultsQueue.dequeue();
            if (result !== undefined) {
                yield result;
            }
        }
    }

    _getAsyncResultsCount() {
        return this.asyncResultsQueue.size;
    }

    _enqueueAsyncResult(result) {
        this.asyncResultsQueue.enqueue(result);
    }

    _isSynchronousRule(rule) {
        return (rule.type ?? '').toLowerCase().includes('nal');
    }

    _dispatchAsyncRule(rule, primaryPremise, secondaryPremise) {
        this.asyncRuleExecutions++;

        this._executeAsyncRule(rule, primaryPremise, secondaryPremise)
            .catch(error => {
                logError(error, {ruleId: rule.id ?? rule.name, context: 'async_rule_execution'}, 'error');
            });
    }

    async _executeAsyncRule(rule, primaryPremise, secondaryPremise) {
        try {
            const results = await (rule.applyAsync?.(primaryPremise, secondaryPremise, this.config.context) ??
                rule.apply?.(primaryPremise, secondaryPremise, this.config.context)) ?? [];
            const resultsArray = Array.isArray(results) ? results : [results];
            const processedResults = resultsArray
                .map(result => this.enrichResult(result, rule))
                .map(this._processDerivation.bind(this))
                .filter(Boolean);

            for (const processedResult of processedResults) {
                this._enqueueAsyncResult(processedResult);
            }
        } catch (error) {
            logError(error, {ruleId: rule.id ?? rule.name, context: 'async_rule_execution'}, 'error');
        }
    }

    _processDerivation(result) {
        return processDerivation(result, this.config.maxDerivationDepth);
    }

    async _checkAndApplyBackpressure() {
        const currentQueueSize = this._getAsyncResultsCount();
        this.maxQueueSize = Math.max(this.maxQueueSize, currentQueueSize);

        if (currentQueueSize > this.config.backpressureThreshold) {
            await sleep(this.config.backpressureInterval);
        }
    }

    /**
     * Process remaining async results after main processing
     * @private
     */
    async* _processRemainingAsyncResults(timeoutMs, startTime, signal = null) {
        let checkCount = 0;
        const initialRemainingTime = timeoutMs > 0 ? timeoutMs - (Date.now() - startTime) : 0;

        while (checkCount < this.config.maxChecks && (timeoutMs === 0 || initialRemainingTime > 0)) {
            if (signal?.aborted) {
                break;
            }

            if (this._isTimeoutExceeded(startTime, timeoutMs)) {
                console.debug(`RuleProcessor: timeout reached after ${timeoutMs}ms (in async results loop)`);
                break;
            }

            checkCount++;

            await sleep(this.config.asyncWaitInterval);

            if (this._getAsyncResultsCount() > 0) {
                yield* this._yieldAsyncResults();
            } else if (checkCount >= this.config.maxChecks) {
                break;
            }
        }
    }

    dispatchAsyncRule(rule, primaryPremise, secondaryPremise) {
        this._dispatchAsyncRule(rule, primaryPremise, secondaryPremise);
    }

    async *yieldAsyncResults() {
        yield* this._yieldAsyncResults();
    }

    getStats() {
        return {
            syncRuleExecutions: this.syncRuleExecutions,
            asyncRuleExecutions: this.asyncRuleExecutions
        };
    }

    getStatus() {
        const currentQueueSize = this._getAsyncResultsCount();
        return {
            ruleExecutor: this.ruleExecutor.constructor.name,
            config: this.config,
            stats: this.getStats(),
            internalState: {
                asyncResultsQueueLength: currentQueueSize,
                maxQueueSize: this.maxQueueSize,
                syncRuleExecutions: this.syncRuleExecutions,
                asyncRuleExecutions: this.asyncRuleExecutions
            },
            backpressure: {
                queueLength: currentQueueSize,
                threshold: this.config.backpressureThreshold,
                isApplyingBackpressure: currentQueueSize > this.config.backpressureThreshold
            },
            timestamp: Date.now()
        };
    }

    resetStats() {
        this.syncRuleExecutions = 0;
        this.asyncRuleExecutions = 0;
    }
}
