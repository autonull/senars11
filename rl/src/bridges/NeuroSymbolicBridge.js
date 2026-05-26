/**
 * Neuro-Symbolic Bridge
 * Bidirectional integration between SeNARS, MeTTa, and Tensor Logic
 */
import {Component} from '../composable/Component.js';
import {mergeConfig, MetricsTracker} from '../utils/index.js';
import {handleError, Logger, NeuroSymbolicError} from '@senars/core';
import {SymbolicTensor, TensorLogicBridge} from '@senars/tensor';

const DEFAULTS = {
    useSeNARS: true,
    senarsConfig: {},
    mettaConfig: {},
    autoGround: true,
    gradientTracking: true,
    cacheInference: true,
    inferenceCacheSize: 1000,
    maxReasoningCycles: 100,
    cacheTtlMs: 5000,
    defaultPriority: 1.0,
    defaultConfidence: 0.9,
    defaultTimeout: 5000,
    defaultThreshold: 0.5,
    explorationRate: 0.1,
    actionSpaceSize: 4
};

export class NeuroSymbolicBridge extends Component {
    constructor(config = {}) {
        super(mergeConfig(DEFAULTS, config));
        this.tensorBridge = new TensorLogicBridge();
        this.metrics = new MetricsTracker({
            narseseConversions: 0,
            mettaExecutions: 0,
            tensorOperations: 0,
            cacheHits: 0,
            cacheMisses: 0
        });
        this.inferenceCache = new Map();
        this.beliefBase = new Map();
        this.goalStack = [];
        this.senars = null;
        this.metta = null;
        this.mettaBridge = null;
    }

    static create(config = {}) {
        return new NeuroSymbolicBridge(config);
    }

    static createReasoningFocused(config = {}) {
        return new NeuroSymbolicBridge({
            ...config,
            maxReasoningCycles: 200,
            cacheInference: true,
            inferenceCacheSize: 2000
        });
    }

    static createPolicyFocused(config = {}) {
        return new NeuroSymbolicBridge({
            ...config,
            maxReasoningCycles: 10,
            cacheInference: false
        });
    }

    static createMinimal(config = {}) {
        return new NeuroSymbolicBridge({
            ...config,
            maxReasoningCycles: 10,
            cacheInference: false,
            gradientTracking: false
        });
    }

    async onInitialize() {
        await Promise.all([
            this._initializeSeNARS(),
            this._initializeTensorBackend()
        ]);
        this._initializeMettaIntegration();

        this.emit('initialized', {
            senars: !!this.senars,
            metta: !!this.metta,
            tensor: !!this.tensorBridge
        });
    }

    async _initializeSeNARS() {
        if (!this.config.useSeNARS) {
            return;
        }

        try {
            const {SeNARS} = await import('@senars/nar');
            this.senars = new SeNARS(this.config.senarsConfig);
            await this.senars.start();

            if (this.metta) {
                const {SeNARSBridge: MettaSeNARSBridge} = await import('@senars/metta');
                this.mettaBridge = new MettaSeNARSBridge(this.senars.nar, this.metta);
                this.mettaBridge.registerPrimitives(this.metta.ground);
            }

            this.emit('senars:initialized');
        } catch (e) {
            Logger.warn('SeNARS initialization failed:', e);
            this.senars = null;
        }
    }

    _initializeMettaIntegration() {
        const {ground} = this.metta ?? {};
        if (!ground) {
            return;
        }

        const registrations = {
            'senars-input': async (narsese) => {
                const result = await this.inputNarsese(narsese.toString());
                return {type: 'ok', value: result.success};
            },
            'senars-ask': async (question) => {
                const result = await this.askNarsese(question.toString());
                return {type: 'ok', value: result ?? 'no_answer'};
            },
            'senars-achieve': async (goal) => {
                const result = await this.achieveGoal(goal.toString());
                return {type: 'ok', value: result ?? 'goal_failed'};
            },
            'tensor-lift': (data, shape) => {
                this.metrics.increment('tensorOperations');
                return {
                    type: 'tensor',
                    value: new SymbolicTensor(
                        Array.from(data),
                        Array.from(shape),
                        {requiresGrad: this.config.gradientTracking}
                    )
                };
            },
            'tensor-ground': (symbolicTensor, shape) =>
                this.tensorBridge.groundToTensor(symbolicTensor, Array.from(shape))
        };

        Object.entries(registrations).forEach(([name, fn]) => ground.register(name, fn));
    }

    async _initializeTensorBackend() {
        try {
            const tensor = await import('@senars/tensor');
            if (tensor.torch) {
                this.tensorBridge.backend = tensor.torch;
            }
        } catch {
            // Backend unavailable - will use fallback operations
        }
    }

    /**
     * Input Narsese statement to SeNARS or local belief base
     */
    async inputNarsese(narsese, options = {}) {
        const {priority = this.config.defaultPriority, confidence = this.config.defaultConfidence} = options;
        this.metrics.increment('narseseConversions');

        if (this.senars) {
            try {
                return this.senars.nar.input(narsese);
            } catch (e) {
                handleError(e, {narsese});
            }
        }

        const belief = {
            narsese,
            priority,
            confidence,
            timestamp: Date.now(),
            truth: {frequency: confidence, confidence: 0.8}
        };
        this.beliefBase.set(narsese, belief);
        return {success: true, belief};
    }

    /**
     * Ask question to SeNARS or local belief base
     */
    async askNarsese(question, options = {}) {
        const {cycles = this.config.maxReasoningCycles, timeout = this.config.defaultTimeout} = options;
        this.metrics.increment('narseseConversions');

        if (this.config.cacheInference) {
            const cached = this.inferenceCache.get(question);
            if (cached && Date.now() - cached.timestamp < this.config.cacheTtlMs) {
                this.metrics.increment('cacheHits');
                return cached.result;
            }
            this.metrics.increment('cacheMisses');
        }

        if (this.senars) {
            try {
                const result = await this.senars.ask(question, {cycles});
                if (this.config.cacheInference) {
                    this.inferenceCache.set(question, {result, timestamp: Date.now()});
                }
                return result;
            } catch (e) {
                handleError(e, {question});
            }
        }

        return this._fallbackAsk(question);
    }

    _fallbackAsk(question) {
        const parsed = this._parseQuestion(question);
        if (!parsed) {
            return null;
        }

        const {subject, predicate} = parsed;
        for (const [key, belief] of this.beliefBase) {
            if (key.includes(subject) && key.includes(predicate)) {
                return {term: key, truth: belief.truth, confidence: belief.confidence};
            }
        }
        return null;
    }

    _parseQuestion(question) {
        const match = question.match(/<(\w+)\s*-->\s*(\w+)>/);
        return match ? {subject: match[1], predicate: match[2]} : null;
    }

    /**
     * Achieve goal via SeNARS planning or fallback
     */
    async achieveGoal(goal, options = {}) {
        const {cycles = this.config.maxReasoningCycles, imagination = true} = options;
        this.goalStack.push({goal, timestamp: Date.now()});

        if (this.senars) {
            try {
                return await this.senars.achieve(goal, {cycles});
            } catch (e) {
                handleError(e, {goal});
            }
        }

        return {success: true, goal, planned: false};
    }

    /**
     * Execute MeTTa program with optional context
     */
    async executeMetta(program, options = {}) {
        const {timeout = this.config.defaultTimeout, context = {}} = options;
        this.metrics.increment('mettaExecutions');

        if (!this.metta) {
            throw NeuroSymbolicError.unavailable('MeTTa', 'Interpreter not initialized');
        }

        const contextBindings = Object.entries(context).map(([k, v]) => `(bind ${k} ${v})`).join('\n');
        const fullProgram = `${contextBindings}\n${program}`;

        try {
            const result = await this.metta.run(fullProgram, {timeout});
            return {success: true, result};
        } catch (e) {
            return {success: false, error: e.message};
        }
    }

    /**
     * Convert Narsese to MeTTa expression
     */
    async narseseToMetta(narsese) {
        const {toMetta} = await import('../utils/NarseseUtils.js');
        return toMetta(narsese);
    }

    /**
     * Convert MeTTa expression to Narsese
     */
    async mettaToNarsese(mettaExpr) {
        const {toNarsese} = await import('../utils/NarseseUtils.js');
        return toNarsese(mettaExpr);
    }

    /**
     * Lift tensor to symbolic representation
     */
    liftToSymbols(tensor, options = {}) {
        const {threshold = this.config.defaultThreshold, annotate = true} = options;
        this.metrics.increment('tensorOperations');

        const symbols = this.tensorBridge.liftToSymbols(tensor, {threshold});

        if (Array.isArray(symbols) && annotate && this.metta) {
            symbols.forEach(sym => {
                this.metta.ground?.register(sym.symbol, () => sym.value);
            });
        }

        return symbols;
    }

    /**
     * Ground symbols to tensor
     */
    groundToTensor(symbols, shape, options = {}) {
        this.metrics.increment('tensorOperations');
        return this.tensorBridge.groundToTensor(symbols, shape, {interpolate: options.interpolate ?? true});
    }

    /**
     * Convert observation to Narsese
     */
    async observationToNarsese(observation, options = {}) {
        const {threshold = this.config.defaultThreshold, predicates = [], prefix = 'obs', simple = false} = options;
        this.metrics.increment('narseseConversions');

        if (simple) {
            const {observationToNarsese} = await import('../utils/NarseseUtils.js');
            return observationToNarsese(observation, prefix);
        }

        const data = observation instanceof SymbolicTensor
            ? Array.from(observation.data)
            : Array.isArray(observation) ? observation : [observation];

        const symTensor = new SymbolicTensor(data, [data.length]);
        const symbols = this.liftToSymbols(symTensor, {threshold});
        const symbolList = Array.isArray(symbols) ? symbols : Array.from(symbols.symbols ?? []);

        return symbolList
            .map((item, i) => {
                const index = item.index ?? i;
                const predicate = predicates[index] ?? `feature_${index}`;
                return `<${predicate} --> ${prefix}>. :|:`;
            })
            .join('\n');
    }

    /**
     * Convert action to Narsese
     */
    async actionToNarsese(action, options = {}) {
        const {actionToNarsese} = await import('../utils/NarseseUtils.js');
        return actionToNarsese(action, options.prefix ?? 'op');
    }

    /**
     * Convert Narsese to tensor
     */
    narseseToTensor(narsese, dimensions, options = {}) {
        this.metrics.increment('narseseConversions');
        const tensor = new Float32Array(dimensions);

        for (const statement of narsese.split('\n').filter(s => s.trim())) {
            tensor[this._hashStatement(statement, dimensions)] = 1.0;
        }

        return new SymbolicTensor(tensor, dimensions, {requiresGrad: this.config.gradientTracking});
    }

    _hashStatement(statement, dimensions) {
        let hash = 0;
        for (let i = 0; i < statement.length; i++) {
            hash = ((hash << 5) - hash) + statement.charCodeAt(i);
            hash &= hash;
        }
        return Math.abs(hash) % dimensions;
    }

    /**
     * Learn causal relation from transition
     */
    async learnCausal(transition) {
        const {state, action, nextState, reward} = transition;

        const stateTensor = new SymbolicTensor(Array.from(state), [state.length]);
        const stateSymbols = this.liftToSymbols(stateTensor);

        const nextStateTensor = new SymbolicTensor(Array.from(nextState), [nextState.length]);
        const nextStateSymbols = this.liftToSymbols(nextStateTensor);

        const cause = stateSymbols.map(s => s.symbol).join('_');
        const effect = nextStateSymbols.map(s => s.symbol).join('_');

        await this.inputNarsese(`<<${cause} &/ ^${action}> ==> ${effect}>.`);
        return {learned: true, cause, effect};
    }

    /**
     * Predict next state given current state and action
     */
    predictCausal(currentState, action) {
        const stateTensor = new SymbolicTensor(Array.from(currentState), [currentState.length]);
        const stateSymbols = this.liftToSymbols(stateTensor);

        return {
            predictedState: stateSymbols,
            confidence: stateSymbols.length > 0 ? 0.8 : 0.5,
            symbolic: stateSymbols
        };
    }

    /**
     * Perceive-Reason-Act cycle
     */
    async perceiveReasonAct(observation, options = {}) {
        const {
            useNARS = true,
            useMeTTa = true,
            useTensor = true,
            exploration = this.config.explorationRate,
            goal = null
        } = options;

        const tensorObs = new SymbolicTensor(
            Array.isArray(observation) ? observation : Array.from(observation),
            [observation.length]
        );
        const symbolic = this.liftToSymbols(tensorObs);
        const narsese = await this.observationToNarsese(observation);

        let reasoningResult = null;
        if (useNARS && this.senars) {
            await this.inputNarsese(narsese);
            if (goal) {
                await this.inputNarsese(goal);
            }
            await this.senars.runCycles(50);
            if (goal) {
                reasoningResult = await this.askNarsese('<(?action) --> candidate_action>?');
            }
        }

        let policyResult = null;
        if (useMeTTa && this.metta) {
            const result = await this.executeMetta(`(agent-act ${JSON.stringify(symbolic)})`);
            if (result.success) {
                policyResult = result.result;
            }
        }

        const action = this._selectAction(reasoningResult, policyResult, exploration);
        return {action, reasoning: reasoningResult, policy: policyResult, symbolic, narsese};
    }

    _selectAction(reasoning, policy, exploration) {
        if (Math.random() < exploration) {
            return Math.floor(Math.random() * this.config.actionSpaceSize);
        }

        if (reasoning?.substitution?.['?action']) {
            const match = reasoning.substitution['?action'].toString().match(/op_(\d+)/);
            if (match) {
                return parseInt(match[1]);
            }
        }

        if (policy) {
            if (Array.isArray(policy)) {
                return policy[0] ?? 0;
            }
            const val = parseFloat(policy.toString());
            return isNaN(val) ? 0 : Math.floor(val);
        }

        return Math.floor(Math.random() * this.config.actionSpaceSize);
    }

    /**
     * Get bridge state
     */
    getState() {
        return {
            beliefs: Array.from(this.beliefBase.values()),
            goals: this.goalStack,
            metrics: this.metrics.getAll(),
            senarsActive: !!this.senars,
            mettaActive: !!this.metta
        };
    }

    /**
     * Clear bridge state
     */
    clear() {
        this.inferenceCache.clear();
        this.goalStack = [];
        this.metrics.reset();
    }

    async onShutdown() {
        await this.senars?.stop();
        this.clear();
    }
}
