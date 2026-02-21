import { Component } from '../composable/Component.js';
import { SymbolicTensor, TensorLogicBridge } from '../neurosymbolic/TensorLogicBridge.js';
import { CausalReasoner } from '../reasoning/CausalReasoning.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';
import { handleError, NeuroSymbolicError } from '../utils/ErrorHandler.js';

export class NeuroSymbolicBridge extends Component {
    constructor(config = {}) {
        super({
            senarsConfig: config.senarsConfig ?? {},
            mettaConfig: config.mettaConfig ?? {},
            mettaInterpreter: config.mettaInterpreter ?? null,
            tensorBackend: config.tensorBackend ?? null,
            autoGround: config.autoGround ?? true,
            gradientTracking: config.gradientTracking ?? true,
            cacheInference: config.cacheInference ?? true,
            inferenceCacheSize: config.inferenceCacheSize ?? 1000,
            maxReasoningCycles: config.maxReasoningCycles ?? 100,
            ...config
        });

        this.tensorBridge = this.config.tensorBridge ?? new TensorLogicBridge();
        this.causalReasoner = new CausalReasoner();
        this.senarsBridge = null;
        this.metta = this.config.mettaInterpreter;
        this.inferenceCache = new Map();
        this.beliefBase = new Map();
        this.goalStack = [];
        this.metrics = new MetricsTracker({
            narseseConversions: 0,
            mettaExecutions: 0,
            tensorOperations: 0,
            cacheHits: 0,
            cacheMisses: 0
        });
    }

    async onInitialize() {
        try {
            const { SeNARS } = await import('@senars/core');
            this.senarsBridge = new SeNARS(this.config.senarsConfig);
            await this.senarsBridge.start();
            this.emit('senars:initialized');
        } catch (e) {
            this.senarsBridge = null;
        }

        this.metta ? this._initializeMettaIntegration() : null;

        if (!this.config.tensorBackend) {
            try {
                const { NativeBackend } = await import('@senars/tensor');
                this.tensorBridge.backend = new NativeBackend();
            } catch {
                // Fallback to existing backend
            }
        }

        this.emit('initialized', {
            senars: !!this.senarsBridge,
            metta: !!this.metta,
            tensor: !!this.tensorBridge.backend
        });
    }

    _initializeMettaIntegration() {
        const { ground } = this.metta ?? {};
        if (!ground) return;

        ground.register('senars-input', async (narsese) => {
            const result = await this.inputNarsese(narsese.toString());
            return result.success ? { type: 'ok', value: true } : { type: 'error', value: result.error };
        });

        ground.register('senars-ask', async (question) => {
            const result = await this.askNarsese(question.toString());
            return result ? { type: 'ok', value: result } : { type: 'error', value: 'no_answer' };
        });

        ground.register('senars-achieve', async (goal) => {
            const result = await this.achieveGoal(goal.toString());
            return result ? { type: 'ok', value: result } : { type: 'error', value: 'goal_failed' };
        });

        ground.register('tensor-lift', (data, shape) => {
            this.metrics.increment('tensorOperations');
            return { type: 'tensor', value: new SymbolicTensor(Array.from(data), Array.from(shape), { requiresGrad: this.config.gradientTracking }) };
        });

        ground.register('tensor-ground', (symbolicTensor, shape) => {
            this.metrics.increment('tensorOperations');
            return { type: 'tensor', value: this.tensorBridge.groundToTensor(symbolicTensor, Array.from(shape)) };
        });

        ground.register('learn-cause', async (cause, effect, context) => {
            await this.causalReasoner.learn(cause.toString(), effect.toString(), context?.toString() ?? null);
            return { type: 'ok', value: true };
        });
    }

    async inputNarsese(narsese, options = {}) {
        const { priority = 1.0, confidence = 0.9 } = options;
        this.metrics.increment('narseseConversions');

        if (this.senarsBridge) {
            try {
                return this.senarsBridge.nar.input(narsese);
            } catch (e) {
                handleError(e, { narsese });
            }
        }

        const belief = { narsese, priority, confidence, timestamp: Date.now(), truth: { frequency: confidence, confidence: 0.8 } };
        this.beliefBase.set(narsese, belief);
        return { success: true, belief };
    }

    async askNarsese(question, options = {}) {
        const { cycles = this.config.maxReasoningCycles, timeout = 5000 } = options;
        this.metrics.increment('narseseConversions');

        if (this.config.cacheInference) {
            const cached = this.inferenceCache.get(question);
            if (cached && Date.now() - cached.timestamp < 5000) {
                this.metrics.increment('cacheHits');
                return cached.result;
            }
            this.metrics.increment('cacheMisses');
        }

        if (this.senarsBridge) {
            try {
                const result = await this.senarsBridge.ask(question, { cycles });
                if (this.config.cacheInference) {
                    this.inferenceCache.set(question, { result, timestamp: Date.now() });
                }
                return result;
            } catch (e) {
                handleError(e, { question });
            }
        }

        return this._fallbackAsk(question);
    }

    _fallbackAsk(question) {
        const match = question.toString().match(/<(.+?) --> (.+?)>\?/);
        if (!match) return null;

        const [, subject, predicate] = match;
        for (const [key, belief] of this.beliefBase) {
            if (key.includes(subject) && key.includes(predicate)) {
                return { term: key, truth: belief.truth, confidence: belief.confidence };
            }
        }
        return null;
    }

    async achieveGoal(goal, options = {}) {
        const { cycles = this.config.maxReasoningCycles, imagination = true } = options;

        if (this.senarsBridge) {
            try {
                return await this.senarsBridge.achieve(goal, { cycles });
            } catch (e) {
                handleError(e, { goal });
            }
        }

        this.goalStack.push({ goal, timestamp: Date.now() });
        return { success: true, goal, planned: false };
    }

    async executeMetta(program, options = {}) {
        const { timeout = 5000, context = {} } = options;
        this.metrics.increment('mettaExecutions');

        if (!this.metta) {
            throw NeuroSymbolicError.unavailable('MeTTa', 'Interpreter not initialized');
        }

        const contextBindings = Object.entries(context).map(([k, v]) => `(bind ${k} ${v})`).join('\n');
        const fullProgram = `${contextBindings}\n${program}`;

        try {
            const result = await this.metta.run(fullProgram, { timeout });
            return { success: true, result };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    narseseToMetta(narsese) {
        const match = narsese.toString().match(/<(.+?) --> (.+?)>\.?/);
        if (!match) return narsese;
        const [, subject, predicate] = match;
        return `(implies ${this._termToMetta(subject)} ${this._termToMetta(predicate)})`;
    }

    _termToMetta(term) {
        return term.includes('(') ? term.replace(/<(.+?) --> (.+?)>/g, '(inherits $1 $2)') : term.replace(/-->/g, '->');
    }

    mettaToNarsese(mettaExpr) {
        const expr = mettaExpr.toString();

        for (const [pattern, transform] of [
            [/\(implies (.+?) (.+?)\)/, '<$1 --> $2>.'],
            [/\(inherits (.+?) (.+?)\)/, '<$1 --> $2>.']
        ]) {
            const match = expr.match(pattern);
            if (match) {
                const [, antecedent, consequent] = match;
                return this._mettaToTerm(antecedent) + ' --> ' + this._mettaToTerm(consequent) + '.';
            }
        }
        return expr;
    }

    _mettaToTerm(term) {
        return term.trim().replace(/->/g, '-->');
    }

    liftToSymbols(tensor, options = {}) {
        const { threshold = 0.5, annotate = true } = options;
        this.metrics.increment('tensorOperations');

        const symbolic = this.tensorBridge.liftToSymbols(tensor, { threshold });

        if (annotate && this.metta) {
            symbolic.annotations = Array.from(symbolic.symbols).map(([key, { symbol }]) => `(symbol ${key} ${symbol})`);
        }

        return symbolic;
    }

    groundToTensor(symbols, shape, options = {}) {
        const { interpolate = true } = options;
        this.metrics.increment('tensorOperations');
        return this.tensorBridge.groundToTensor(symbols, shape, { interpolate });
    }

    observationToNarsese(observation, options = {}) {
        const { threshold = 0.5, predicates = [] } = options;
        this.metrics.increment('narseseConversions');

        const tensor = new SymbolicTensor(Array.isArray(observation) ? observation : Array.from(observation), [observation.length]);
        const symbolic = this.liftToSymbols(tensor, { threshold });

        return Array.from(symbolic.symbols).map(([index, { confidence }]) => {
            const predicate = predicates[index] ?? `feature_${index}`;
            return `<${predicate} --> observed>. :|:`;
        }).join('\n');
    }

    narseseToTensor(narsese, dimensions, options = {}) {
        const { encoding = 'one-hot' } = options;
        this.metrics.increment('narseseConversions');

        const tensor = new Float32Array(dimensions);
        for (const statement of narsese.split('\n').filter(s => s.trim())) {
            tensor[this._hashStatement(statement, dimensions)] = 1.0;
        }

        return new SymbolicTensor(tensor, dimensions, { requiresGrad: this.config.gradientTracking });
    }

    _hashStatement(statement, dimensions) {
        let hash = 0;
        for (let i = 0; i < statement.length; i++) {
            hash = ((hash << 5) - hash) + statement.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash) % dimensions;
    }

    async learnCausal(transition) {
        const { state, action, nextState, reward } = transition;

        const stateSymbols = this.liftToSymbols(new SymbolicTensor(Array.from(state), [state.length]));
        const nextStateSymbols = this.liftToSymbols(new SymbolicTensor(Array.from(nextState), [nextState.length]));

        await this.causalReasoner.learn(
            JSON.stringify(stateSymbols.symbols),
            JSON.stringify(nextStateSymbols.symbols),
            JSON.stringify({ action, reward })
        );

        const cause = stateSymbols.toNarseseTerm('state');
        const effect = nextStateSymbols.toNarseseTerm('next_state');
        await this.inputNarsese(`<<${cause} &/ ^${action}> ==> ${effect}>.`);
    }

    predictCausal(currentState, action) {
        const stateSymbols = this.liftToSymbols(new SymbolicTensor(Array.from(currentState), [currentState.length]));
        const causes = this.causalReasoner.queryCauses(JSON.stringify(stateSymbols.symbols));

        return {
            predictedState: causes,
            confidence: causes.length > 0 ? 0.8 : 0.5,
            symbolic: stateSymbols
        };
    }

    async perceiveReasonAct(observation, options = {}) {
        const { useNARS = true, useMeTTa = true, useTensor = true, exploration = 0.1, goal = null } = options;

        const tensorObs = new SymbolicTensor(Array.isArray(observation) ? observation : Array.from(observation), [observation.length]);
        const symbolic = this.liftToSymbols(tensorObs);
        const narsese = this.observationToNarsese(observation);

        let reasoningResult = null;
        if (useNARS && this.senarsBridge) {
            await this.inputNarsese(narsese);
            if (goal) await this.inputNarsese(goal);
            await this.senarsBridge?.runCycles(50);
            if (goal) {
                reasoningResult = await this.askNarsese('<(?action) --> candidate_action>?');
            }
        }

        let policyResult = null;
        if (useMeTTa && this.metta) {
            const result = await this.executeMetta(`(agent-act ${JSON.stringify(symbolic.symbols)})`);
            if (result.success) policyResult = result.result;
        }

        const action = this._selectAction(reasoningResult, policyResult, exploration);

        return { action, reasoning: reasoningResult, policy: policyResult, symbolic, narsese };
    }

    _selectAction(reasoning, policy, exploration) {
        if (Math.random() < exploration) {
            return Math.floor(Math.random() * 4);
        }

        if (reasoning?.substitution?.['?action']) {
            const match = reasoning.substitution['?action'].toString().match(/op_(\d+)/);
            if (match) return parseInt(match[1]);
        }

        if (policy) {
            if (Array.isArray(policy)) return policy[0] ?? 0;
            const val = parseFloat(policy.toString());
            return isNaN(val) ? 0 : Math.floor(val);
        }

        return Math.floor(Math.random() * 4);
    }

    getState() {
        return {
            beliefs: Array.from(this.beliefBase.values()),
            goals: this.goalStack,
            causalGraph: this.causalReasoner.getGraph(),
            metrics: this.metrics.getAll(),
            senarsActive: !!this.senarsBridge,
            mettaActive: !!this.metta
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
    }

    static create(config = {}) {
        const bridge = new NeuroSymbolicBridge(config);
        return bridge;
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
}
