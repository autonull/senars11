import { Component } from '../composable/Component.js';
import { SymbolicTensor, TensorLogicBridge } from '@senars/tensor';
import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
    name: 'primitive',
    type: 'processing',
    inputs: [],
    outputs: [],
    parameters: {},
    learningRate: 0.01,
    symbolThreshold: 0.5,
    featureExtractors: [],
    hiddenDim: 64,
    outputDim: 4,
    temperature: 1.0,
    maxNodes: 100,
    planningHorizon: 10,
    bottleneckThreshold: 0.3,
    noveltyThreshold: 0.5,
    minUsageCount: 10,
    maxSkills: 50
};

export class CognitivePrimitive extends Component {
    constructor(config = {}) {
        super(mergeConfig(DEFAULTS, config));
        this.connections = new Map();
        this.activationLevel = 0;
        this.learningRate = config.learningRate ?? 0.01;
    }

    async process(input, context = {}) {
        throw new Error('CognitivePrimitive must implement process()');
    }

    connect(outputName, target, inputName) {
        if (!this.connections.has(outputName)) this.connections.set(outputName, []);
        this.connections.get(outputName).push({ target, inputName });
        return this;
    }

    updateActivation(delta) {
        this.activationLevel = Math.max(0, Math.min(1, this.activationLevel + delta));
    }

    async learn(feedback, context = {}) { return { updated: false }; }

    getInfo() {
        return {
            name: this.config.name,
            type: this.config.type,
            activation: this.activationLevel,
            connections: Array.from(this.connections.keys())
        };
    }
}

export class PerceptionPrimitive extends CognitivePrimitive {
    constructor(config = {}) {
        super({ ...config, type: 'perception', inputs: ['observation'], outputs: ['features', 'symbols'] });
        this.featureExtractors = config.featureExtractors ?? [];
        this.symbolThreshold = config.symbolThreshold ?? 0.5;
        this.tensorBridge = new TensorLogicBridge();
    }

    async process(input, context = {}) {
        const observation = input.observation ?? input;
        const features = await this._extractFeatures(observation);
        const symbols = await this._liftToSymbols(features);
        return { features, symbols };
    }

    async _extractFeatures(observation) {
        if (this.featureExtractors.length === 0) return observation;
        const results = await Promise.all(this.featureExtractors.map(fn => fn(observation)));
        return results.filter(r => r !== null);
    }

    async _liftToSymbols(features) {
        const tensor = new SymbolicTensor(Array.isArray(features) ? features : [features], [Array.isArray(features) ? features.length : 1]);
        return this.tensorBridge.liftToSymbols(tensor, { threshold: this.symbolThreshold });
    }
}

export class ReasoningPrimitive extends CognitivePrimitive {
    constructor(config = {}) {
        super({ ...config, type: 'reasoning', inputs: ['symbols'], outputs: ['inferences'] });
        this.inferenceDepth = config.inferenceDepth ?? 2;
        this.beliefs = new Map();
    }

    async process(input, context = {}) {
        const { symbols } = input;
        this._updateBeliefs(symbols);
        const inferences = await this._performInference();
        return { inferences, beliefs: new Map(this.beliefs) };
    }

    _updateBeliefs(symbols) {
        const now = Date.now();
        if (Array.isArray(symbols)) {
            symbols.forEach(s => {
                const key = s.symbol;
                const value = { confidence: s.confidence, value: 1.0 };
                this._updateSingleBelief(key, value, now);
            });
        } else if (symbols instanceof Map) {
            symbols.forEach((value, key) => {
                this._updateSingleBelief(key, value, now);
            });
        }
    }

    _updateSingleBelief(key, value, now) {
        const existing = this.beliefs.get(key);
        if (existing) {
            existing.confidence = (existing.confidence + value.confidence) / 2;
            existing.timestamp = now;
        } else {
            this.beliefs.set(key, { ...value, timestamp: now });
        }
    }

    async _performInference() {
        const inferences = [];
        const beliefs = Array.from(this.beliefs.entries());

        for (let i = 0; i < beliefs.length && i < this.inferenceDepth; i++) {
            for (let j = i + 1; j < beliefs.length && j < this.inferenceDepth; j++) {
                const [key1, b1] = beliefs[i];
                const [key2, b2] = beliefs[j];
                if (this._canCombine(key1, key2)) {
                    inferences.push({ type: 'transitive', from: [key1, key2], result: this._combine(b1, b2) });
                }
            }
        }
        return inferences;
    }

    _canCombine(k1, k2) { return k1.split('_')[0] === k2.split('_')[0]; }
    _combine(b1, b2) { return { confidence: (b1.confidence + b2.confidence) / 2, value: b1.value + b2.value }; }
}

export class PlanningPrimitive extends CognitivePrimitive {
    constructor(config = {}) {
        super({ ...config, type: 'planning', inputs: ['state', 'goal'], outputs: ['plan'] });
        this.horizon = config.planningHorizon ?? 10;
    }

    async process(input, context = {}) {
        const { state, goal } = input;
        if (!goal) return { plan: null, reason: 'No goal' };
        const plan = await this._generatePlan(state, goal);
        return { plan, goal };
    }

    async _generatePlan(state, goal) {
        const plan = [];
        let current = state;
        for (let i = 0; i < this.horizon; i++) {
            const action = await this._selectBestAction(current, goal);
            plan.push(action);
            current = this._simulateStep(current, action);
            if (this._isGoalAchieved(current, goal)) break;
        }
        return plan.length > 0 ? plan : null;
    }

    async _selectBestAction(state, goal) { return Math.floor(Math.random() * 4); }
    _simulateStep(state, action) { return state; }
    _isGoalAchieved(state, goal) { return false; }
}

export class ActionPrimitive extends CognitivePrimitive {
    constructor(config = {}) {
        super({ ...config, type: 'action', inputs: ['plan', 'policy', 'state'], outputs: ['action'] });
        this.actionSpace = config.actionSpace ?? null;
    }

    async process(input, context = {}) {
        const { plan, policy, state } = context;
        let action, source;

        if (plan?.length > 0) { action = plan.shift(); source = 'plan'; }
        else if (policy) { action = await this._selectFromPolicy(policy, state); source = 'policy'; }
        else { action = this._explore(); source = 'explore'; }

        return { action, source };
    }

    async _selectFromPolicy(policy, state) {
        return typeof policy.act === 'function' ? policy.act(state) : policy(state);
    }

    _explore() {
        const n = this.actionSpace?.n ?? 4;
        return Math.floor(Math.random() * n);
    }
}

// Alias for compatibility
export const ActionSelectionPrimitive = ActionPrimitive;

export class EmergentArchitecture extends Component {
    constructor(config = {}) {
        super({
            name: config.name ?? 'EmergentArchitecture',
            primitives: config.primitives ?? [],
            integrationMode: config.integrationMode ?? 'emergent',
            ...config
        });

        this.primitives = new Map();
        this.connections = [];
        this.globalState = new Map();
        this.activationHistory = [];

        this._addDefaultPrimitives();
    }

    _addDefaultPrimitives() {
        this.addPrimitive('perception', new PerceptionPrimitive());
        this.addPrimitive('reasoning', new ReasoningPrimitive());
        this.addPrimitive('planning', new PlanningPrimitive());
        this.addPrimitive('action', new ActionPrimitive());
    }

    addPrimitive(name, primitive) {
        this.primitives.set(name, primitive);
        primitive.parent = this;
        this.emit('primitiveAdded', { name, primitive });
        return this;
    }

    getPrimitive(name) { return this.primitives.get(name); }

    connect(from, to, transform = null) {
        this.connections.push({ from, to, transform });
        const fromPrim = this.primitives.get(from);
        const toPrim = this.primitives.get(to);
        if (fromPrim && toPrim) fromPrim.connect('output', toPrim, 'input');
        return this;
    }

    async process(input, context = {}) {
        const results = {};
        let current = input;

        const order = ['perception', 'reasoning', 'planning', 'action'];
        for (const name of order) {
            const prim = this.primitives.get(name);
            if (!prim || !prim.config.enabled) continue;

            const result = await prim.process(current, { ...context, ...results });
            results[name] = result;
            current = { ...current, ...result };
        }

        this.globalState.set('lastInput', input);
        this.globalState.set('lastResults', results);

        return { output: current, results, state: Object.fromEntries(this.globalState) };
    }

    async act(observation, goal = null) {
        const result = await this.process(observation, { goal });
        return result.results.action?.action ?? 0;
    }

    async learn(transition, reward) {
        this.primitives.forEach(prim => {
            if (prim.learn) prim.learn({ transition, reward });
        });
    }

    getState() { return Object.fromEntries(this.globalState); }

    async shutdown() {
        await Promise.all(Array.from(this.primitives.values()).map(p => p.shutdown()));
        await super.shutdown();
    }
}

export const EmergentPresets = {
    minimal: () => new EmergentArchitecture({ name: 'MinimalEmergent', integrationMode: 'emergent' }),
    standard: () => new EmergentArchitecture({ name: 'StandardEmergent', integrationMode: 'emergent' }),
    reasoningFocused: () => new EmergentArchitecture({
        name: 'ReasoningEmergent',
        primitives: { reasoning: new ReasoningPrimitive({ inferenceDepth: 4 }) }
    })
};
