import { Component } from '../composable/Component.js';
import { SymbolicTensor, TensorLogicBridge } from '../neurosymbolic/TensorLogicBridge.js';
import { CausalGraph, CausalReasoner } from '../reasoning/CausalReasoning.js';
import { Experience } from '../experience/ExperienceSystem.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
    senarsConfig: {},
    mettaInterpreter: null,
    autoGround: true,
    reasoningCycles: 50,
    actionLow: -1,
    actionHigh: 1
};

const NarseseUtils = {
    observationToNarsese(observation, prefix = 'obs') {
        if (Array.isArray(observation)) {
            return observation.map((v, i) => `<f${i} --> ${prefix}>.`).join(' ');
        }
        if (typeof observation === 'object') {
            return Object.entries(observation).map(([k, v]) => `<${k} --> ${prefix}>.`).join(' ');
        }
        return `<${observation} --> ${prefix}>.`;
    },

    actionToNarsese(action, prefix = 'op') {
        if (typeof action === 'number') return `^${prefix}_${action}`;
        if (Array.isArray(action)) return `^${prefix}(${action.join(' ')})`;
        return `^${action}`;
    },

    goalToNarsese(goal) {
        if (typeof goal === 'string') return `${goal}!`;
        if (typeof goal === 'object') {
            const terms = Object.entries(goal).map(([k, v]) => `${k}_${v}`).join(' ');
            return `<(*, ${terms}) --> goal>!`;
        }
        return `${goal}!`;
    },

    parseOperation(operation) {
        const opStr = operation.toString();
        const match = opStr.match(/\^op_?(\d+|\(.*?\))/);
        if (match) {
            const actionStr = match[1];
            if (actionStr.startsWith('(')) {
                return actionStr.slice(1, -1).split(/\s+/).map(Number);
            }
            return parseInt(actionStr);
        }
        return null;
    }
};

export class EnhancedSeNARSBridge extends Component {
    constructor(config = {}) {
        super(mergeConfig(DEFAULTS, config));
        this.bridge = null;
        this.metta = this.config.mettaInterpreter;
        this.tensorBridge = this.config.tensorBridge ?? new TensorLogicBridge();
        this.beliefBase = new Map();
        this.goalStack = [];
        this.inferenceHistory = [];
    }

    async onInitialize() {
        try {
            const { SeNARS } = await import('@senars/core');
            this.bridge = new SeNARS(this.config.senarsConfig);
            await this.bridge.start();

            if (this.metta) this._connectMetta();

            this.emit('initialized', { senars: true, metta: !!this.metta });
        } catch {
            console.warn('SeNARS not available, using fallback mode');
            this.bridge = null;
        }
    }

    _connectMetta() {
        if (!this.metta?.ground) return;

        const ops = {
            'senars-input': (narsese) => this.input(narsese.toString()),
            'senars-ask': (question) => this.ask(question.toString()),
            'senars-achieve': (goal) => this.achieve(goal.toString())
        };

        Object.entries(ops).forEach(([name, fn]) => this.metta.ground.register(name, fn));
    }

    async input(narsese, options = {}) {
        const { priority = 1.0, confidence = 0.9 } = options;

        if (this.bridge) return this.bridge.nar.input(narsese);

        const belief = { narsese, priority, confidence, timestamp: Date.now() };
        this.beliefBase.set(narsese, belief);
        return { success: true, belief };
    }

    async ask(question, options = {}) {
        const { cycles = 50, timeout = 5000 } = options;

        if (this.bridge) return this.bridge.ask(question, { cycles });
        return this._fallbackAsk(question);
    }

    async achieve(goal, options = {}) {
        const { cycles = 100, planning = true } = options;

        this.goalStack.push({ goal, timestamp: Date.now() });

        if (this.bridge) {
            const result = await this.bridge.achieve(goal, { cycles });
            if (result?.executedOperations) {
                this.inferenceHistory.push({
                    type: 'achieve',
                    goal,
                    operations: result.executedOperations,
                    timestamp: Date.now()
                });
            }
            return result;
        }

        return this._fallbackAchieve(goal);
    }

    async runCycles(count) {
        if (this.bridge) return this.bridge.runCycles(count);
        return this._processBeliefs();
    }

    observationToNarsese(observation, context = {}) {
        const { prefix = 'obs', confidence = 0.9 } = context;
        return NarseseUtils.observationToNarsese(observation, prefix);
    }

    actionToNarsese(action, context = {}) {
        const { prefix = 'op' } = context;
        return NarseseUtils.actionToNarsese(action, prefix);
    }

    tensorToNarsese(tensor, options = {}) {
        const symbols = this.tensorBridge.liftToSymbols(tensor, options);
        const terms = symbols.map(s => `${s.symbol || `f${s.index}`}:${(s.confidence ?? 1).toFixed(2)}`);
        return `<(*, ${terms.join(' ')}) --> tensor>.`;
    }

    narseseToTensor(narsese, shape) {
        const match = narsese.match(/\(\*,\s*(.*?)\)/);
        if (!match) return null;

        const symbols = match[1].split(',').map(s => s.trim());
        return this.tensorBridge.groundToTensor(
            symbols.map((s, i) => ({ index: i, symbol: s, confidence: 1.0 })),
            shape
        );
    }

    _fallbackAsk(question) {
        const questionStr = question.toString();
        for (const [narsese, belief] of this.beliefBase) {
            if (narsese.includes(questionStr)) {
                return { term: narsese, truth: { confidence: belief.confidence, priority: belief.priority } };
            }
        }
        return null;
    }

    _fallbackAchieve(goal) {
        const goalStr = goal.toString();
        const relevant = Array.from(this.beliefBase.values()).filter(b => b.narsese.includes(goalStr));

        if (relevant.length > 0) {
            return { achieved: true, evidence: relevant.map(r => r.narsese) };
        }
        return { achieved: false };
    }

    _processBeliefs() {
        const now = Date.now();
        this.beliefBase.forEach((belief, key) => {
            const age = (now - belief.timestamp) / 60000;
            belief.priority *= Math.exp(-age * 0.1);
            if (belief.priority < 0.1) this.beliefBase.delete(key);
        });
        return { processed: this.beliefBase.size };
    }

    getBeliefs(options = {}) {
        const { minPriority = 0.1, limit = 100 } = options;
        return Array.from(this.beliefBase.values())
            .filter(b => b.priority >= minPriority)
            .sort((a, b) => b.priority - a.priority)
            .slice(0, limit);
    }

    getGoals() { return [...this.goalStack]; }
    clearGoals() { this.goalStack = []; }
    getHistory(limit = 100) { return this.inferenceHistory.slice(-limit); }

    async onShutdown() {
        if (this.bridge) await this.bridge.dispose();
        this.clearGoals();
    }
}

export class MeTTaPolicyNetwork extends Component {
    constructor(config = {}) {
        super({
            mettaInterpreter: null,
            tensorBridge: new TensorLogicBridge(),
            policyScript: null,
            inputDim: 64,
            hiddenDim: 128,
            outputDim: 16,
            actionType: 'discrete',
            ...config
        });

        this.metta = this.config.mettaInterpreter;
        this.tensorBridge = this.config.tensorBridge;
        this.policyLoaded = false;
        this.parameters = new Map();
    }

    async onInitialize() {
        if (!this.metta) {
            try {
                const { MeTTaInterpreter } = await import('@senars/metta');
                this.metta = new MeTTaInterpreter();
                const { registerTensorPrimitives } = await import('../core/TensorPrimitives.js');
                registerTensorPrimitives(this.metta);
            } catch {
                console.warn('MeTTa not available, using fallback policy');
            }
        }

        if (this.config.policyScript) await this.loadPolicy(this.config.policyScript);
        if (!this.policyLoaded) this._initializeDefaultPolicy();
    }

    async loadPolicy(scriptOrPath) {
        if (!this.metta) return false;

        try {
            let script = scriptOrPath;
            if (typeof scriptOrPath === 'string' && !scriptOrPath.includes('(')) {
                const fs = await import('fs');
                script = fs.readFileSync(scriptOrPath, 'utf8');
            }
            this.metta.run(script);
            this.policyLoaded = true;
            this.emit('policyLoaded', { script: scriptOrPath });
            return true;
        } catch (e) {
            console.error('Failed to load policy:', e);
            return false;
        }
    }

    _initializeDefaultPolicy() {
        if (!this.metta) return;

        const policyScript = `
            (= (get-action $obs) (let* (($x (&tensor $obs)) ($logits (forward $x))) (&argmax $logits)))
            (= (get-action-continuous $obs) (let* (($x (&tensor $obs)) ($output (forward $x))) (&tanh $output)))
        `;
        this.metta.run(policyScript);
        this.policyLoaded = true;
    }

    async selectAction(observation, options = {}) {
        if (!this.metta || !this.policyLoaded) return this._fallbackAction('discrete');

        const { temperature = 1.0, sample = false } = options;
        const obsStr = this._observationToString(observation);

        try {
            const result = this.metta.run(`! (get-action ${obsStr})`);
            if (result?.length > 0) {
                const action = parseInt(result[0].toString());
                if (!isNaN(action)) return action;
            }
        } catch {
            console.warn('Policy execution failed');
        }

        return this._fallbackAction('discrete');
    }

    async selectContinuousAction(observation, options = {}) {
        if (!this.metta || !this.policyLoaded) return this._fallbackAction('continuous');

        const { actionLow = -1, actionHigh = 1 } = options;
        const obsStr = this._observationToString(observation);

        try {
            const result = this.metta.run(`! (get-action-continuous ${obsStr})`);
            if (result?.length > 0) {
                const output = result[0];
                if (output.type === 'Value' && output.value?.data) {
                    return Array.from(output.value.data).map(v => {
                        const normalized = (v + 1) / 2;
                        return actionLow + normalized * (actionHigh - actionLow);
                    });
                }
            }
        } catch {
            console.warn('Continuous policy execution failed');
        }

        return this._fallbackAction('continuous');
    }

    async updatePolicy(transition, options = {}) {
        if (!this.metta || !this.policyLoaded) return null;

        const { learningRate = 0.01, gamma = 0.99 } = options;
        const { state, action, reward, nextState, done } = transition;
        const obsStr = this._observationToString(state);
        const target = done ? reward : reward + gamma * reward;
        const targetStr = this._createTargetTensor(action, target);

        try {
            const result = this.metta.run(`! (update-policy ${obsStr} ${targetStr})`);
            return { success: true, result };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    _observationToString(observation) {
        const data = observation instanceof SymbolicTensor
            ? Array.from(observation.data)
            : Array.isArray(observation) ? observation : [observation];
        return `(${data.map(v => v.toFixed(4)).join(' ')})`;
    }

    _createTargetTensor(action, value) {
        return `(${action.toFixed(4)} ${value.toFixed(4)})`;
    }

    _fallbackAction(type) {
        if (type === 'continuous') {
            const { actionLow = -1, actionHigh = 1, outputDim } = this.config;
            return Array.from({ length: outputDim }, () => actionLow + Math.random() * (actionHigh - actionLow));
        }
        return Math.floor(Math.random() * this.config.outputDim);
    }

    getParameters() { return Object.fromEntries(this.parameters); }

    setParameters(params) {
        Object.entries(params).forEach(([key, value]) => this.parameters.set(key, value));
    }

    async onShutdown() { this.parameters.clear(); }
}

export class UnifiedNeuroSymbolicAgent extends Component {
    constructor(config = {}) {
        super({
            senarsConfig: {},
            mettaConfig: {},
            policyScript: null,
            tensorConfig: {},
            actionSpace: null,
            actionType: 'auto',
            integrationMode: 'full',
            reasoningCycles: 50,
            ...config
        });

        this.senarsBridge = null;
        this.policyNetwork = null;
        this.tensorBridge = new TensorLogicBridge(this.config.tensorConfig);
        this.causalReasoner = null;
        this.experienceBuffer = [];
        this.currentGoal = null;
        this.actionHistory = [];
    }

    async onInitialize() {
        if (this.config.integrationMode !== 'metta-only') {
            this.senarsBridge = new EnhancedSeNARSBridge({
                ...this.config.senarsConfig,
                tensorBridge: this.tensorBridge
            });
            await this.senarsBridge.initialize();
        }

        if (this.config.integrationMode !== 'senars-only') {
            this.policyNetwork = new MeTTaPolicyNetwork({
                ...this.config.mettaConfig,
                policyScript: this.config.policyScript,
                tensorBridge: this.tensorBridge,
                actionType: this._detectActionType()
            });
            await this.policyNetwork.initialize();
        }

        this.causalReasoner = new CausalReasoner({ graph: new CausalGraph({ maxNodes: 100 }) });
        await this.causalReasoner.initialize();

        this.emit('initialized', {
            senars: !!this.senarsBridge,
            metta: !!this.policyNetwork,
            actionType: this._detectActionType()
        });
    }

    _detectActionType() {
        if (this.config.actionType !== 'auto') return this.config.actionType;
        if (this.config.actionSpace) {
            if (this.config.actionSpace.type === 'Discrete') return 'discrete';
            if (this.config.actionSpace.type === 'Box') return 'continuous';
        }
        return 'discrete';
    }

    async act(observation, options = {}) {
        const { useReasoning = true, usePolicy = true, explorationRate = 0.1, goal = this.currentGoal } = options;
        const actionType = this._detectActionType();
        let action = null, source = 'unknown';

        if (useReasoning && this.senarsBridge) {
            const reasoningAction = await this._reasoningAction(observation, goal);
            if (reasoningAction !== null) {
                action = reasoningAction;
                source = 'reasoning';
            }
        }

        if (!action && usePolicy && this.policyNetwork) {
            action = actionType === 'continuous'
                ? await this.policyNetwork.selectContinuousAction(observation, { explorationRate })
                : await this.policyNetwork.selectAction(observation, { explorationRate });
            source = 'policy';
        }

        if (!action) {
            action = this._randomAction(actionType);
            source = 'random';
        }

        this.actionHistory.push({ observation, action, source, timestamp: Date.now() });
        if (this.actionHistory.length > 1000) this.actionHistory.shift();

        return action;
    }

    async _reasoningAction(observation, goal) {
        if (!this.senarsBridge) return null;

        const obsNarsese = this.senarsBridge.observationToNarsese(observation);
        await this.senarsBridge.input(obsNarsese);
        await this.senarsBridge.runCycles(this.config.reasoningCycles);

        if (goal) {
            const goalNarsese = NarseseUtils.goalToNarsese(goal);
            const result = await this.senarsBridge.achieve(goalNarsese, { cycles: this.config.reasoningCycles });
            if (result?.executedOperations?.length > 0) {
                return NarseseUtils.parseOperation(result.executedOperations[0]);
            }
        }

        const result = await this.senarsBridge.ask('<(?action) --> good_action>?');
        if (result?.substitution?.['?action']) {
            return NarseseUtils.parseOperation(result.substitution['?action']);
        }

        return null;
    }

    _randomAction(actionType) {
        const { actionSpace, actionLow = -1, actionHigh = 1 } = this.config;
        if (actionType === 'continuous') {
            const dim = actionSpace?.shape?.[0] ?? 4;
            return Array.from({ length: dim }, () => actionLow + Math.random() * (actionHigh - actionLow));
        }
        const n = actionSpace?.n ?? 4;
        return Math.floor(Math.random() * n);
    }

    async learn(transition, reward, options = {}) {
        const { state, action, nextState, done } = transition;

        const experience = new Experience({
            state, action, reward, nextState, done,
            info: { timestamp: Date.now() }
        });
        this.experienceBuffer.push(experience);

        if (this.policyNetwork) await this.policyNetwork.updatePolicy(transition, options);
        if (this.causalReasoner) this._updateCausalModel(transition);

        if (this.senarsBridge && reward !== 0) {
            const valence = reward > 0 ? 'good' : 'bad';
            await this.senarsBridge.input(`<(*, ${this._stateToTerm(nextState)}) --> ${valence}>.`);
        }

        if (this.experienceBuffer.length > 10000) this.experienceBuffer.shift();

        return { stored: true, experience };
    }

    _stateToTerm(state) {
        if (Array.isArray(state)) return state.map(v => Math.round(v * 10)).join('_');
        return String(state);
    }

    _updateCausalModel(transition) {
        const { state, action, nextState, reward } = transition;
        const graph = this.causalReasoner.graph;

        const stateVars = this._extractVariables(state);
        const nextVars = this._extractVariables(nextState);

        Object.entries(stateVars).forEach(([varId, value]) => {
            if (!graph.nodes.has(varId)) graph.addNode(varId, { type: 'state', value });
            graph.observe(varId, value);
        });

        if (this.experienceBuffer.length > 100) {
            const trajectories = this._extractTrajectories();
            graph.learnStructure(trajectories, { minStrength: 0.1 });
        }
    }

    _extractVariables(state) {
        if (Array.isArray(state)) return Object.fromEntries(state.map((v, i) => [`var_${i}`, v]));
        if (typeof state === 'object') return state;
        return { value: state };
    }

    _extractTrajectories() {
        const trajectories = [];
        let current = [];

        this.experienceBuffer.forEach(exp => {
            current.push({ state: exp.state, action: exp.action, nextState: exp.nextState, reward: exp.reward });
            if (exp.done && current.length > 1) {
                trajectories.push({ states: current.map(e => e.state) });
                current = [];
            }
        });

        return trajectories;
    }

    setGoal(goal) {
        this.currentGoal = goal;
        if (this.senarsBridge) this.senarsBridge.input(NarseseUtils.goalToNarsese(goal));
        this.emit('goalSet', { goal });
    }

    getGoal() { return this.currentGoal; }
    clearGoal() {
        this.currentGoal = null;
        this.senarsBridge?.clearGoals();
    }

    getExperiences(options = {}) {
        const { limit = 100, filter = null } = options;
        let experiences = [...this.experienceBuffer];
        if (filter) experiences = experiences.filter(filter);
        return experiences.slice(-limit);
    }

    getActionHistory(limit = 100) { return this.actionHistory.slice(-limit); }

    getStats() {
        return {
            experienceCount: this.experienceBuffer.length,
            actionHistoryCount: this.actionHistory.length,
            currentGoal: this.currentGoal,
            actionType: this._detectActionType(),
            senarsBeliefs: this.senarsBridge?.getBeliefs()?.length ?? 0,
            causalGraphNodes: this.causalReasoner?.graph?.nodes?.size ?? 0
        };
    }

    async onShutdown() {
        await this.senarsBridge?.shutdown();
        await this.policyNetwork?.shutdown();
        await this.causalReasoner?.shutdown();
        this.experienceBuffer = [];
        this.actionHistory = [];
    }
}

export class UnifiedAgentFactory {
    static create(config = {}) { return new UnifiedNeuroSymbolicAgent(config); }

    static async createWithDefaults(env) {
        const config = { actionSpace: env.actionSpace, reasoningCycles: 50, integrationMode: 'full' };
        const agent = this.create(config);
        await agent.initialize();
        return agent;
    }

    static createDiscrete(config = {}) { return this.create({ ...config, actionType: 'discrete' }); }
    static createContinuous(config = {}) { return this.create({ ...config, actionType: 'continuous' }); }
}
