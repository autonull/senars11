import {Rule} from './Rule.js';
import {Logger} from '../util/Logger.js';
import {logError, RuleExecutionError} from './utils/error.js';
import {CircuitBreaker} from '../util/CircuitBreaker.js';
import {emitEvent} from '../util/EventUtils.js';
import {LMExecutionTracker} from '../util/ExecutionTracker.js';

/**
 * Language Model Rule for the stream reasoner system.
 */
export class LMRule extends Rule {
    constructor(id, lm, config = {}) {
        super(id, 'lm', config.priority ?? 1.0, config);
        this.lm = lm;
        this.eventBus = config.eventBus || null;

        this.config = {
            condition: this._getDefaultCondition(config),
            prompt: this._getPromptFunction(config),
            process: this._getProcessFunction(config),
            generate: this._getGenerateFunction(config),
            lm_options: {
                temperature: 0.7,
                max_tokens: 200,
                ...config.lm_options,
            },
            singlePremise: config.singlePremise ?? false,
            circuitBreaker: {
                failureThreshold: 5,
                resetTimeout: 60000,
                ...config.circuitBreaker
            },
            ...config,
        };

        this.name = config.name ?? id;
        this.description = config.description ?? 'Language Model Rule for generating inferences using neural models';
        this.enabled = config.enabled ?? true;

        if (config.promptTemplate) {
            this.promptTemplate = config.promptTemplate;
        }

        // Use ExecutionTracker for unified stats tracking
        this._executionTracker = new LMExecutionTracker();

        this.circuitBreaker = new CircuitBreaker({
            ...this.config.circuitBreaker,
            onStateChange: (newState) => {
                this._emitEvent('circuit.state_change', {
                    ruleId: this.id,
                    state: newState,
                    timestamp: Date.now()
                });
            }
        });
    }

    static create(config) {
        const {id, lm, ...rest} = config;
        if (!id || !lm) {
            throw new Error('LMRule.create: `id` and `lm` are required.');
        }
        return new LMRule(id, lm, rest);
    }

    canApply(primaryPremise, secondaryPremise, context) {
        try {
            if (this.circuitBreaker.isOpen()) {
                return false;
            }
            return this.config.condition(primaryPremise, secondaryPremise, context);
        } catch (error) {
            logError(error, {ruleId: this.id, context: 'condition_evaluation'}, 'warn');
            return false;
        }
    }

    async apply(primaryPremise, secondaryPremise, context = {}) {
        if (this.circuitBreaker.isOpen()) {
            return [];
        }

        if (!this.canApply(primaryPremise, secondaryPremise, context)) {
            return [];
        }

        const startTime = Date.now();

        try {
            const prompt = await this.generatePrompt(primaryPremise, secondaryPremise, context);

            this._emitEvent('lm.prompt', {
                ruleId: this.id,
                prompt,
                timestamp: Date.now()
            });

            // Execute LM through Circuit Breaker
            const lmResponse = await this.circuitBreaker.execute(() => this.executeLM(prompt));

            this._emitEvent('lm.response', {
                ruleId: this.id,
                prompt,
                response: lmResponse,
                duration: Date.now() - startTime,
                timestamp: Date.now()
            });

            if (!lmResponse) {
                this._executionTracker.record(false, Date.now() - startTime);
                return [];
            }

            const processedOutput = this.processLMOutput(lmResponse, primaryPremise, secondaryPremise, context);
            const newTasks = this.generateTasks(processedOutput, primaryPremise, secondaryPremise, context);

            this._executionTracker.record(true, Date.now() - startTime);
            return newTasks;
        } catch (error) {
            Logger.error(`Error in LMRule ${this.id}:`, error);

            this._emitEvent('lm.failure', {
                ruleId: this.id,
                error: error.message,
                duration: Date.now() - startTime,
                timestamp: Date.now()
            });

            this._executionTracker.record(false, Date.now() - startTime);
            return [];
        }
    }

    async executeLM(prompt) {
        if (!this.lm) {
            throw new RuleExecutionError(`LM unavailable for rule ${this.id}`, this.id);
        }

        const startTime = Date.now();
        const response = await this._callLMInterface(prompt);
        const tokens = prompt.length + (response?.length ?? 0);
        const duration = Date.now() - startTime;
        this._executionTracker.record(true, duration, tokens);
        return response;
    }

    _emitEvent(eventName, data) {
        emitEvent(this.eventBus, eventName, data);
    }

    _callLMInterface(prompt) {
        // Cache the LM interface method to avoid repeated lookups in hot path
        if (!this._cachedLMInterface) {
            const interfaces = ['generateText', 'process', 'query'];
            for (const method of interfaces) {
                if (typeof this.lm[method] === 'function') {
                    this._cachedLMInterface = method;
                    break;
                }
            }
            if (!this._cachedLMInterface) {
                throw new Error(`LM compatible interface not found for rule ${this.id}`);
            }
        }
        return this.lm[this._cachedLMInterface](prompt, this.config.lm_options);
    }

    generatePrompt(p, s, c) {
        return this.config.prompt(p, s, c);
    }

    processLMOutput(r, p, s, c) {
        return this.config.process(r, p, s, c);
    }

    generateTasks(o, p, s, c) {
        return this.config.generate(o, p, s, c);
    }

    getStats() {
        return {
            stats: this._executionTracker.stats,
            circuit: this.circuitBreaker.getState(),
            ruleInfo: {
                id: this.id,
                name: this.name,
                type: this.type,
                enabled: this.enabled
            }
        };
    }

    _getDefaultCondition(config) {
        return (primaryPremise, secondaryPremise) =>
            !!this.lm && primaryPremise?.term != null && (secondaryPremise != null || config.singlePremise === true);
    }

    _getPromptFunction(config) {
        if (typeof config.promptTemplate === 'string') {
            return (p, s) => this._fillPromptTemplate(config.promptTemplate, p, s);
        } else if (typeof config.promptTemplate === 'function') {
            return config.promptTemplate;
        }
        return () => {
            throw new Error(`Prompt generation not implemented for rule: ${this.id}`);
        };
    }

    _getProcessFunction(config) {
        if (typeof config.process === 'function') return config.process;
        if (typeof config.responseProcessor === 'function') return config.responseProcessor;
        return (r) => r ?? '';
    }

    _getGenerateFunction(config) {
        if (typeof config.generate === 'function') return config.generate;
        if (typeof config.responseProcessor === 'function') return config.responseProcessor;
        return () => [];
    }

    _fillPromptTemplate(template, primaryPremise, secondaryPremise) {
        const fill = (t, prefix, obj) => t
            .replace(`{{${prefix}Term}}`, obj?.term?.toString?.() ?? String(obj?.term ?? 'unknown'))
            .replace(`{{${prefix}Type}}`, obj?.punctuation ?? 'unknown')
            .replace(`{{${prefix}Truth}}`, obj?.truth ?
                `frequency: ${obj.truth.f}, confidence: ${obj.truth.c}` : 'unknown');

        let res = fill(template, 'task', primaryPremise);
        if (secondaryPremise) {
            res = fill(res, 'secondary', secondaryPremise);
        }
        return res;
    }
}
