import {deepMergeConfig as mergeConfig, processDerivation, sleep} from './utils/common.js';
import {Logger} from '../util/Logger.js';
import {logError, ReasonerError} from './utils/error.js';
import {Queue} from '../util/Queue.js';
import {Stamp, ArrayStamp} from '../Stamp.js';
import {isSynchronousRule} from './RuleHelpers.js';
import {RuleCompiler} from './exec/RuleCompiler.js';
import {RuleExecutor as PatternRuleExecutor} from './exec/RuleExecutor.js';
import {Unifier} from '../term/Unifier.js';
import {StandardDiscriminators} from './exec/Discriminators.js';
import {NAL4} from './rules/nal/definitions/NAL4.js';
import {NAL5} from './rules/nal/definitions/NAL5.js';

/**
 * RuleProcessor consumes premise pairs and processes them through rules.
 */
export class RuleProcessor {
    constructor(ruleExecutor, config = {}) {
        this.ruleExecutor = ruleExecutor; // Legacy imperative executor

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

        this._initPatternEngine();
    }

    _initPatternEngine() {
        const termFactory = this.config.termFactory;
        if (!termFactory) return;

        this.unifier = new Unifier(termFactory);
        this.ruleCompiler = new RuleCompiler(termFactory, StandardDiscriminators);

        const rules = [...NAL4, ...NAL5];
        const decisionTree = this.ruleCompiler.compile(rules);
        this.patternExecutor = new PatternRuleExecutor(decisionTree, this.unifier, StandardDiscriminators);
    }

    async* process(premisePairStream, timeoutMs = 0, signal = null) {
        const startTime = Date.now();

        try {
            for await (const [primaryPremise, secondaryPremise] of premisePairStream) {
                if (signal?.aborted || this._isTimeout(startTime, timeoutMs)) break;

                await this._checkAndApplyBackpressure();
                yield* this._processPair(primaryPremise, secondaryPremise, signal, startTime, timeoutMs);
                yield* this._yieldAsyncResults();
            }

            yield* this._drainAsyncResults(timeoutMs, startTime, signal);
        } catch (error) {
            logError(error, {context: 'rule_processor_stream'});
            throw new ReasonerError(`RuleProcessor error: ${error.message}`, 'STREAM_ERROR', {originalError: error});
        }
    }

    _isTimeout(startTime, timeoutMs) {
        if (timeoutMs > 0 && (Date.now() - startTime) > timeoutMs) {
            Logger.debug(`RuleProcessor: timeout reached after ${timeoutMs}ms`);
            return true;
        }
        return false;
    }

    async* _processPair(p1, p2, signal, startTime, timeoutMs) {
        const context = this._createContext();

        // 1. Legacy Rules
        const candidateRules = this.ruleExecutor.getCandidateRules(p1, p2, context);
        for (const rule of candidateRules) {
            if (signal?.aborted || this._isTimeout(startTime, timeoutMs)) break;

            try {
                if (isSynchronousRule(rule)) {
                    // Execute sync rule
                    const results = this.processSyncRule(rule, p1, p2);
                    for (const res of results) yield res;
                } else {
                    this._dispatchAsyncRule(rule, p1, p2);
                }
            } catch (error) {
                logError(error, { ruleId: rule.id ?? rule.name, context: 'rule_processing' }, 'warn');
            }
        }

        // 2. Pattern Rules
        if (this.patternExecutor) {
            yield* this._executePatternRules(p1, p2);
        }
    }

    processSyncRule(rule, p1, p2) {
        this.syncRuleExecutions++;
        const results = this.ruleExecutor.executeRule(rule, p1, p2, this._createContext());

        return results.map(r => this._processDerivation(this._enrichResult(r, rule))).filter(Boolean);
    }

    async* _executePatternRules(p1, p2) {
        try {
            const results = this.patternExecutor.execute(p1, p2, this._createContext());
            for (const result of results) {
                const task = this._createDerivedTask(result, p1, p2, 'PatternRule');
                if (task) yield this._processDerivation(task);
            }
        } catch (error) {
            logError(error, {context: 'pattern_rule_processing'}, 'warn');
        }
    }

    async executeAsyncRule(rule, p1, p2) {
        this.asyncRuleExecutions++;
        try {
            const context = this._createContext();
            const results = await (rule.applyAsync?.(p1, p2, context) ?? rule.apply?.(p1, p2, context)) ?? [];

            return (Array.isArray(results) ? results : [results])
                .map(r => this._enrichResult(r, rule))
                .map(r => this._processDerivation(r))
                .filter(Boolean);
        } catch (error) {
            logError(error, {ruleId: rule.id ?? rule.name, context: 'async_rule_execution'}, 'error');
            return [];
        }
    }

    _createDerivedTask(result, p1, p2, ruleName) {
        if (!result?.term) return null;

        const TaskClass = p1.constructor;
        const newStamp = Stamp.derive([p1.stamp, p2.stamp], { source: `DERIVED:${ruleName}` });

        return new TaskClass({
            term: result.term,
            truth: result.truth,
            punctuation: result.punctuation,
            stamp: newStamp,
            budget: p1.budget
        });
    }

    _enrichResult(result, rule) {
        if (!result?.stamp) return result;
        const ruleName = rule.id || rule.name || 'UnknownRule';
        const s = result.stamp;

        const newStamp = typeof s.clone === 'function'
            ? s.clone({ source: `DERIVED:${ruleName}` })
            : new ArrayStamp({ ...s, source: `DERIVED:${ruleName}` }); // Fallback

        return result.clone({ stamp: newStamp });
    }

    _createContext() {
        return {
            termFactory: this.config.termFactory ?? this.config.context?.termFactory ?? null,
            unifier: this.unifier,
            ...(this.config.context ?? {})
        };
    }

    _dispatchAsyncRule(rule, p1, p2) {
        this.executeAsyncRule(rule, p1, p2).then(results => {
            results.forEach(r => this.asyncResultsQueue.enqueue(r));
        });
    }

    async* _yieldAsyncResults() {
        while (this.asyncResultsQueue.size > 0) {
            await this._checkAndApplyBackpressure();
            const result = this.asyncResultsQueue.dequeue();
            if (result !== undefined) yield result;
        }
    }

    // Renamed back to _checkAndApplyBackpressure to match test expectation/previous name
    async _checkAndApplyBackpressure() {
        const size = this.asyncResultsQueue.size;
        this.maxQueueSize = Math.max(this.maxQueueSize, size);

        if (size > this.config.backpressureThreshold) {
            await sleep(this.config.backpressureInterval);
        }
    }

    async* _drainAsyncResults(timeoutMs, startTime, signal) {
        let checkCount = 0;
        const hasTimeLimit = timeoutMs > 0;

        while (checkCount < this.config.maxChecks) {
            if (signal?.aborted || (hasTimeLimit && this._isTimeout(startTime, timeoutMs))) break;

            checkCount++;
            await sleep(this.config.asyncWaitInterval);

            if (this.asyncResultsQueue.size > 0) {
                yield* this._yieldAsyncResults();
            } else if (checkCount >= this.config.maxChecks) {
                break;
            }
        }
    }

    _processDerivation(result) {
        return processDerivation(result, this.config.maxDerivationDepth, this.config.budgetManager);
    }

    getStats() {
        return {
            syncRuleExecutions: this.syncRuleExecutions,
            asyncRuleExecutions: this.asyncRuleExecutions
        };
    }

    getStatus() {
        const size = this.asyncResultsQueue.size;
        return {
            ruleExecutor: this.ruleExecutor.constructor.name,
            config: this.config,
            stats: this.getStats(),
            internalState: {
                asyncResultsQueueLength: size,
                maxQueueSize: this.maxQueueSize,
                syncRuleExecutions: this.syncRuleExecutions,
                asyncRuleExecutions: this.asyncRuleExecutions
            },
            backpressure: {
                queueLength: size,
                threshold: this.config.backpressureThreshold,
                isApplyingBackpressure: size > this.config.backpressureThreshold
            },
            timestamp: Date.now()
        };
    }

    resetStats() {
        this.syncRuleExecutions = 0;
        this.asyncRuleExecutions = 0;
    }
}
