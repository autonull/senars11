/**
 * Enhanced Integration Layer
 * Unifies bridges, memory, grounding, and provides expanded neuro-symbolic capabilities
 */
import { Component } from '../composable/Component.js';
import { SymbolicTensor, TensorLogicBridge } from '@senars/tensor';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { NarseseUtils } from '../utils/NarseseUtils.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';
import { CausalReasoner, CausalGraph } from '../cognitive/CognitiveSystem.js';

const INTEGRATION_DEFAULTS = {
    // SeNARS integration
    useSeNARS: true,
    senarsConfig: {},
    
    // MeTTa integration
    useMeTTa: true,
    mettaConfig: {},
    mettaInterpreter: null,
    
    // Tensor integration
    useTensor: true,
    tensorConfig: {},
    tensorBackend: null,
    
    // Caching
    cacheInference: true,
    inferenceCacheSize: 1000,
    cacheTtlMs: 5000,
    
    // Reasoning
    maxReasoningCycles: 100,
    defaultPriority: 1.0,
    defaultConfidence: 0.9,
    
    // Grounding
    autoGround: true,
    groundingPrecision: 10,
    
    // Memory
    memoryCapacity: 10000,
    useEpisodicMemory: true,
    
    // Error handling
    defaultTimeout: 5000,
    retryAttempts: 3
};

/**
 * Enhanced Neuro-Symbolic Bridge
 * Unifies SeNARS, MeTTa, and Tensor operations with expanded capabilities
 */
export class NeuroSymbolicBridge extends Component {
    constructor(config = {}) {
        super(mergeConfig(INTEGRATION_DEFAULTS, config));
        
        this.tensorBridge = this.config.tensorBackend ? 
            new TensorLogicBridge(this.config.tensorConfig) : null;
        this.causalReasoner = new CausalReasoner();
        this.senarsBridge = null;
        this.metta = this.config.mettaInterpreter;
        
        // Enhanced memory systems
        this.inferenceCache = new Map();
        this.beliefBase = new Map();
        this.episodicMemory = [];
        this.goalStack = [];
        this.operationHistory = [];
        
        // Metrics
        this.metrics = new MetricsTracker({
            narseseConversions: 0,
            mettaExecutions: 0,
            tensorOperations: 0,
            cacheHits: 0,
            cacheMisses: 0,
            reasoningCycles: 0,
            goalsAchieved: 0,
            operationsExecuted: 0
        });
    }

    async onInitialize() {
        // Initialize SeNARS
        if (this.config.useSeNARS) {
            try {
                const { SeNARS } = await import('@senars/core');
                this.senarsBridge = new SeNARS(this.config.senarsConfig);
                await this.senarsBridge.start();
                this.emit('senars:initialized');
            } catch (e) {
                console.warn('SeNARS initialization failed:', e.message);
                this.senarsBridge = null;
            }
        }

        // Initialize MeTTa integration
        this._initializeMettaIntegration();

        // Initialize Tensor backend
        if (this.config.useTensor && !this.config.tensorBackend) {
            try {
                const { torch } = await import('@senars/tensor');
                if (this.tensorBridge) {
                    this.tensorBridge.backend = torch;
                }
                this.emit('tensor:initialized');
            } catch (e) {
                console.warn('Tensor backend initialization failed:', e.message);
            }
        } else if (this.config.tensorBackend && this.tensorBridge) {
            this.tensorBridge.backend = this.config.tensorBackend;
        }

        this.emit('initialized', {
            senars: !!this.senarsBridge,
            metta: !!this.metta,
            tensor: !!this.tensorBridge?.backend
        });
    }

    _initializeMettaIntegration() {
        const { ground } = this.metta ?? {};
        if (!ground) return;

        const registrations = {
            'senars-input': async (narsese) => {
                const result = await this.inputNarsese(narsese.toString());
                return { type: 'ok', value: result.success };
            },
            'senars-ask': async (question) => {
                const result = await this.askNarsese(question.toString());
                return { type: 'ok', value: result ?? 'no_answer' };
            },
            'senars-achieve': async (goal) => {
                const result = await this.achieveGoal(goal.toString());
                return { type: 'ok', value: result?.success ?? false };
            },
            'tensor-lift': (data, shape) => {
                this.metrics.increment('tensorOperations');
                return {
                    type: 'tensor',
                    value: new SymbolicTensor(
                        Array.from(data),
                        Array.from(shape),
                        { requiresGrad: true }
                    )
                };
            },
            'tensor-ground': (symbolicTensor, shape) => {
                this.metrics.increment('tensorOperations');
                if (!this.tensorBridge) return { type: 'error', value: 'No tensor bridge' };
                return { 
                    type: 'tensor', 
                    value: this.tensorBridge.groundToTensor(symbolicTensor, Array.from(shape))
                };
            },
            'learn-cause': async (cause, effect, context) => {
                await this.causalReasoner.learn(
                    cause.toString(), 
                    effect.toString(), 
                    context?.toString() ?? null
                );
                return { type: 'ok', value: true };
            },
            'remember': async (experience) => {
                this.storeExperience(experience);
                return { type: 'ok', value: true };
            },
            'recall': (pattern) => {
                return { type: 'ok', value: this.recallExperiences(pattern) };
            }
        };

        Object.entries(registrations).forEach(([name, fn]) => {
            ground.register(name, fn);
        });
    }

    // === Narsese Operations ===

    async inputNarsese(narsese, options = {}) {
        const { priority = this.config.defaultPriority, confidence = this.config.defaultConfidence } = options;
        this.metrics.increment('narseseConversions');

        if (this.senarsBridge) {
            try {
                const result = this.senarsBridge.nar.input(narsese);
                this._cacheInference(narsese, { type: 'input', result });
                return { success: true, result };
            } catch (e) {
                this._handleError(e, { narsese, operation: 'input' });
            }
        }

        // Fallback: store in belief base
        const belief = { 
            narsese, 
            priority, 
            confidence, 
            timestamp: Date.now(),
            truth: { frequency: confidence, confidence: 0.8 }
        };
        this.beliefBase.set(narsese, belief);
        return { success: true, belief };
    }

    async askNarsese(question, options = {}) {
        const { cycles = this.config.maxReasoningCycles, timeout = this.config.defaultTimeout } = options;
        this.metrics.increment('narseseConversions');

        // Check cache
        if (this.config.cacheInference) {
            const cached = this._getCachedInference(question);
            if (cached) {
                this.metrics.increment('cacheHits');
                return cached.result;
            }
            this.metrics.increment('cacheMisses');
        }

        // Try SeNARS
        if (this.senarsBridge) {
            try {
                const result = await this.senarsBridge.ask(question, { cycles });
                if (this.config.cacheInference) {
                    this._cacheInference(question, { type: 'ask', result });
                }
                this.metrics.increment('reasoningCycles', cycles);
                return result;
            } catch (e) {
                this._handleError(e, { question, operation: 'ask' });
            }
        }

        // Fallback: pattern matching in belief base
        return this._fallbackAsk(question);
    }

    async achieveGoal(goal, options = {}) {
        const { cycles = this.config.maxReasoningCycles, imagination = true } = options;
        
        this.goalStack.push({ goal, timestamp: Date.now(), status: 'active' });

        if (this.senarsBridge) {
            try {
                const result = await this.senarsBridge.achieve(goal, { cycles });
                this.goalStack[this.goalStack.length - 1].status = result?.success ? 'achieved' : 'failed';
                if (result?.success) {
                    this.metrics.increment('goalsAchieved');
                    this.metrics.increment('operationsExecuted', result.executedOperations?.length ?? 0);
                }
                return result;
            } catch (e) {
                this.goalStack[this.goalStack.length - 1].status = 'failed';
                this._handleError(e, { goal, operation: 'achieve' });
            }
        }

        this.goalStack[this.goalStack.length - 1].status = 'failed';
        return { success: false, goal, planned: false };
    }

    // === Tensor Operations ===

    liftToSymbols(tensor, options = {}) {
        const { threshold = 0.5, annotate = true } = options;
        this.metrics.increment('tensorOperations');

        if (!this.tensorBridge) {
            throw new Error('Tensor bridge not initialized');
        }

        const symbols = this.tensorBridge.liftToSymbols(tensor, { threshold });
        
        if (annotate && this.metta) {
            // Add semantic annotations
            symbols.annotations = {
                timestamp: Date.now(),
                threshold,
                source: 'lift'
            };
        }

        return symbols;
    }

    groundToTensor(symbols, shape, options = {}) {
        this.metrics.increment('tensorOperations');
        
        if (!this.tensorBridge) {
            throw new Error('Tensor bridge not initialized');
        }

        return this.tensorBridge.groundToTensor(symbols, shape, {
            interpolate: options.interpolate ?? true
        });
    }

    observationToNarsese(observation, options = {}) {
        const { threshold = 0.5, predicates = [], prefix = 'obs', simple = false } = options;
        this.metrics.increment('narseseConversions');

        if (simple) {
            return NarseseUtils.observationToNarsese(observation, prefix);
        }

        // Convert to tensor then to symbols
        const data = observation instanceof SymbolicTensor
            ? Array.from(observation.data)
            : Array.isArray(observation) ? observation : [observation];

        const tensor = new SymbolicTensor(data, [data.length]);
        
        if (this.tensorBridge) {
            const symbols = this.liftToSymbols(tensor, { threshold });
            const symbolList = Array.isArray(symbols) ? symbols : Array.from(symbols.symbols ?? []);

            return symbolList
                .map((item, i) => {
                    const index = item.index ?? i;
                    const confidence = item.confidence ?? 1.0;
                    const predicate = predicates[index] ?? `feature_${index}`;
                    return `<${predicate} --> ${prefix}>. :|:`;
                })
                .join('\n');
        }

        return NarseseUtils.observationToNarsese(observation, prefix);
    }

    actionToNarsese(action, options = {}) {
        return NarseseUtils.actionToNarsese(action, options.prefix ?? 'op');
    }

    narseseToTensor(narsese, dimensions, options = {}) {
        this.metrics.increment('narseseConversions');

        const tensor = new Float32Array(dimensions);
        for (const statement of narsese.split('\n').filter(s => s.trim())) {
            tensor[this._hashStatement(statement, dimensions)] = 1.0;
        }

        return new SymbolicTensor(tensor, dimensions, { requiresGrad: true });
    }

    // === Causal Reasoning ===

    async learnCausal(transition) {
        const { state, action, nextState, reward } = transition;

        // Create symbolic representations
        const stateTensor = new SymbolicTensor(Array.from(state), [state.length]);
        const nextStateTensor = new SymbolicTensor(Array.from(nextState), [nextState.length]);

        if (this.tensorBridge) {
            const stateSymbols = this.liftToSymbols(stateTensor);
            const nextStateSymbols = this.liftToSymbols(nextStateTensor);

            await this.causalReasoner.learn(
                JSON.stringify(stateSymbols),
                JSON.stringify(nextStateSymbols),
                JSON.stringify({ action, reward })
            );
        }

        // Input causal rule to SeNARS
        const cause = `state_${state.join('_')}`;
        const effect = `next_state_${nextState.join('_')}`;
        await this.inputNarsese(`<<${cause} &/ ^${action}> ==> ${effect}>.`);

        return { learned: true, cause, effect };
    }

    predictCausal(currentState, action) {
        const stateTensor = new SymbolicTensor(Array.from(currentState), [currentState.length]);
        
        if (this.tensorBridge) {
            const stateSymbols = this.liftToSymbols(stateTensor);
            const causes = this.causalReasoner.queryCauses(JSON.stringify(stateSymbols));

            return {
                predictedState: causes,
                confidence: causes.length > 0 ? 0.8 : 0.5,
                symbolic: stateSymbols
            };
        }

        return {
            predictedState: null,
            confidence: 0.5,
            symbolic: currentState
        };
    }

    // === Experience Memory ===

    storeExperience(experience) {
        const exp = {
            ...experience,
            timestamp: Date.now(),
            id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        };

        this.episodicMemory.push(exp);

        // Limit memory size
        if (this.episodicMemory.length > this.config.memoryCapacity) {
            this.episodicMemory.shift();
        }

        return exp.id;
    }

    recallExperiences(pattern, options = {}) {
        const { limit = 10, sortBy = 'timestamp' } = options;

        let results = this.episodicMemory;

        // Filter by pattern
        if (pattern) {
            const patternKeys = Object.keys(pattern);
            results = results.filter(exp => {
                return patternKeys.every(key => {
                    const expVal = exp[key];
                    const patternVal = pattern[key];
                    
                    if (typeof patternVal === 'object') {
                        return JSON.stringify(expVal).includes(JSON.stringify(patternVal));
                    }
                    return expVal === patternVal;
                });
            });
        }

        // Sort
        results.sort((a, b) => {
            if (sortBy === 'timestamp') return b.timestamp - a.timestamp;
            if (sortBy === 'reward') return b.reward - a.reward;
            return 0;
        });

        return results.slice(0, limit);
    }

    getExperienceStats() {
        const memories = this.episodicMemory;
        if (memories.length === 0) {
            return { count: 0, avgReward: 0, successRate: 0 };
        }

        const totalReward = memories.reduce((sum, exp) => sum + (exp.reward ?? 0), 0);
        const successes = memories.filter(exp => (exp.reward ?? 0) > 0).length;

        return {
            count: memories.length,
            avgReward: totalReward / memories.length,
            successRate: successes / memories.length,
            totalReward
        };
    }

    // === Perception-Reasoning-Action Loop ===

    async perceiveReasonAct(observation, options = {}) {
        const { 
            useNARS = true, 
            useMeTTa = true, 
            useTensor = true,
            exploration = this.config.explorationRate,
            goal = null
        } = options;

        // Perceive: Convert observation to multiple representations
        const tensorObs = new SymbolicTensor(
            Array.isArray(observation) ? observation : Array.from(observation),
            [observation.length]
        );
        
        const symbolic = useTensor && this.tensorBridge ? this.liftToSymbols(tensorObs) : null;
        const narsese = this.observationToNarsese(observation);

        // Reason
        let reasoningResult = null;
        if (useNARS && this.senarsBridge) {
            await this.inputNarsese(narsese);
            if (goal) {
                await this.inputNarsese(goal);
                await this.senarsBridge?.runCycles(50);
                reasoningResult = await this.askNarsese('<(?action) --> candidate_action>?');
            }
        }

        // Policy (MeTTa)
        let policyResult = null;
        if (useMeTTa && this.metta) {
            try {
                const result = await this.metta.run(`(agent-act ${JSON.stringify(symbolic ?? observation)})`);
                policyResult = result;
            } catch (e) {
                console.warn('MeTTa policy execution failed:', e.message);
            }
        }

        // Select action
        const action = this._selectAction(reasoningResult, policyResult, exploration);

        return {
            action,
            reasoning: reasoningResult,
            policy: policyResult,
            symbolic,
            narsese,
            metrics: this.metrics.getAll()
        };
    }

    _selectAction(reasoning, policy, exploration) {
        // Exploration
        if (Math.random() < exploration) {
            return Math.floor(Math.random() * this.config.actionSpaceSize);
        }

        // Use reasoning result
        if (reasoning?.substitution?.['?action']) {
            const match = reasoning.substitution['?action'].toString().match(/op_(\d+)/);
            if (match) return parseInt(match[1]);
        }

        // Use policy result
        if (policy) {
            if (Array.isArray(policy)) return policy[0] ?? 0;
            const val = parseFloat(policy.toString());
            return isNaN(val) ? 0 : Math.floor(val);
        }

        // Default
        return Math.floor(Math.random() * this.config.actionSpaceSize);
    }

    // === Utility Methods ===

    _cacheInference(key, value) {
        if (!this.config.cacheInference) return;
        
        this.inferenceCache.set(key, {
            result: value,
            timestamp: Date.now()
        });

        // Maintain cache size
        if (this.inferenceCache.size > this.config.inferenceCacheSize) {
            const firstKey = this.inferenceCache.keys().next().value;
            this.inferenceCache.delete(firstKey);
        }
    }

    _getCachedInference(key) {
        if (!this.config.cacheInference) return null;
        
        const cached = this.inferenceCache.get(key);
        if (!cached) return null;

        // Check TTL
        if (Date.now() - cached.timestamp > this.config.cacheTtlMs) {
            this.inferenceCache.delete(key);
            return null;
        }

        return cached.result;
    }

    _fallbackAsk(question) {
        const parsed = NarseseUtils.parseQuestion(question);
        if (!parsed) return null;

        const { subject, predicate } = parsed;
        for (const [key, belief] of this.beliefBase) {
            if (key.includes(subject) && key.includes(predicate)) {
                return { term: key, truth: belief.truth, confidence: belief.confidence };
            }
        }
        return null;
    }

    _hashStatement(statement, dimensions) {
        let hash = 0;
        for (let i = 0; i < statement.length; i++) {
            hash = ((hash << 5) - hash) + statement.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash) % dimensions;
    }

    _handleError(error, context) {
        console.error('[NeuroSymbolicBridge Error]', {
            code: error.code ?? 'UNKNOWN_ERROR',
            message: error.message,
            context,
            timestamp: Date.now()
        });
    }

    // === State & Serialization ===

    getState() {
        return {
            beliefs: Array.from(this.beliefBase.values()),
            goals: this.goalStack,
            experiences: this.getExperienceStats(),
            causalGraph: this.causalReasoner.getGraph(),
            metrics: this.metrics.getAll(),
            senarsActive: !!this.senarsBridge,
            mettaActive: !!this.metta,
            tensorActive: !!this.tensorBridge?.backend
        };
    }

    clear() {
        this.inferenceCache.clear();
        this.goalStack = [];
        this.metrics.reset();
    }

    async onShutdown() {
        await this.senarsBridge?.stop();
        this.clear();
        this.episodicMemory = [];
        this.beliefBase.clear();
    }

    // === Factory Methods ===

    static create(config = {}) {
        return new NeuroSymbolicBridge(config);
    }

    static createReasoningFocused(config = {}) {
        return new NeuroSymbolicBridge({
            ...config,
            maxReasoningCycles: 200,
            cacheInference: true,
            inferenceCacheSize: 2000,
            useTensor: config.useTensor ?? false
        });
    }

    static createPolicyFocused(config = {}) {
        return new NeuroSymbolicBridge({
            ...config,
            maxReasoningCycles: 10,
            cacheInference: false,
            useSeNARS: config.useSeNARS ?? false
        });
    }

    static createMinimal(config = {}) {
        return new NeuroSymbolicBridge({
            ...config,
            maxReasoningCycles: 10,
            cacheInference: false,
            useSeNARS: false,
            useMeTTa: false
        });
    }

    static createFull(config = {}) {
        return new NeuroSymbolicBridge({
            ...config,
            useSeNARS: true,
            useMeTTa: true,
            useTensor: true,
            cacheInference: true,
            inferenceCacheSize: 2000,
            maxReasoningCycles: 200
        });
    }
}

export { NeuroSymbolicBridge as EnhancedBridge };
export { NeuroSymbolicBridge as UnifiedBridge };
