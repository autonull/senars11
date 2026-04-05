import {Component} from '../composable/Component.js';
import {SymbolicTensor, TensorLogicBridge} from '@senars/tensor';
import {CausalGraph, CausalReasoner} from '../systems/CognitiveSystem.js';
import {Experience} from '../experience/ExperienceSystem.js';
import {mergeConfig, NarseseUtils} from '../utils/index.js';
import {NeuroSymbolicBridge} from '../bridges/NeuroSymbolicBridge.js';
import {TensorLogicPolicy} from '../policies/TensorLogicPolicy.js';
import {extractVariables} from '../utils/extractVariables.js';

const AGENT_DEFAULTS = {
    senarsConfig: {},
    mettaConfig: {},
    policyScript: null,
    tensorConfig: {},
    actionSpace: null,
    actionType: 'auto',
    integrationMode: 'full',
    reasoningCycles: 50,
    experienceBufferLimit: 10000,
    actionHistoryLimit: 1000,
    maxCausalNodes: 100,
    minCausalStrength: 0.1
};

const formatObservation = (observation) => {
    const data = observation instanceof SymbolicTensor
        ? Array.from(observation.data)
        : Array.isArray(observation) ? observation : [observation];
    return `(${data.map(v => v.toFixed(4)).join(' ')})`;
};

const stateToTerm = (state) => Array.isArray(state) ? state.map(v => Math.round(v * 10)).join('_') : String(state);

export class UnifiedNeuroSymbolicAgent extends Component {
    constructor(config = {}) {
        super(mergeConfig(AGENT_DEFAULTS, config));

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
            this.senarsBridge = new NeuroSymbolicBridge({
                ...this.config.senarsConfig,
                tensorBridge: this.tensorBridge,
                useSeNARS: true
            });
            await this.senarsBridge.initialize();
        }

        if (this.config.integrationMode !== 'senars-only') {
            this.policyNetwork = new TensorLogicPolicy({
                ...this.config.mettaConfig,
                policyScript: this.config.policyScript,
                actionType: this._detectActionType(),
                policyType: this.config.policyScript ? 'metta' : 'softmax'
            });
            await this.policyNetwork.initialize();
        }

        this.causalReasoner = new CausalReasoner({graph: new CausalGraph({maxNodes: this.config.maxCausalNodes})});
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
        const {useReasoning = true, usePolicy = true, explorationRate = 0.1, goal = this.currentGoal} = options;
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
            const result = await this.policyNetwork.selectAction(observation, {explorationRate});
            action = result.action;
            source = 'policy';
        }

        if (!action) {
            action = this._randomAction(actionType);
            source = 'random';
        }

        this.actionHistory.push({observation, action, source, timestamp: Date.now()});
        if (this.actionHistory.length > this.config.actionHistoryLimit) this.actionHistory.shift();

        return action;
    }

    async _reasoningAction(observation, goal) {
        if (!this.senarsBridge) return null;

        // Use simple encoding for compatibility with previous behavior if needed
        const obsNarsese = this.senarsBridge.observationToNarsese(observation, {simple: true});
        await this.senarsBridge.inputNarsese(obsNarsese);

        if (this.senarsBridge.senarsBridge) {
            await this.senarsBridge.senarsBridge.runCycles(this.config.reasoningCycles);
        }

        if (goal) {
            const goalNarsese = NarseseUtils.goalToNarsese(goal);
            const result = await this.senarsBridge.achieveGoal(goalNarsese, {cycles: this.config.reasoningCycles});

            if (result?.executedOperations?.length > 0) {
                return NarseseUtils.parseOperation(result.executedOperations[0]);
            }
        }

        const result = await this.senarsBridge.askNarsese('<(?action) --> good_action>?');
        if (result?.substitution?.['?action']) {
            return NarseseUtils.parseOperation(result.substitution['?action']);
        }

        return null;
    }

    _randomAction(actionType) {
        const {actionSpace, actionLow = -1, actionHigh = 1} = this.config;
        if (actionType === 'continuous') {
            const dim = actionSpace?.shape?.[0] ?? 4;
            return Array.from({length: dim}, () => actionLow + Math.random() * (actionHigh - actionLow));
        }
        const n = actionSpace?.n ?? 4;
        return Math.floor(Math.random() * n);
    }

    async learn(transition, reward, options = {}) {
        const {state, action, nextState, done} = transition;

        const experience = new Experience({
            state, action, reward, nextState, done,
            info: {timestamp: Date.now()}
        });
        this.experienceBuffer.push(experience);

        if (this.policyNetwork) await this.policyNetwork.update(transition, options);
        if (this.causalReasoner) this._updateCausalModel(transition);

        if (this.senarsBridge && reward !== 0) {
            const valence = reward > 0 ? 'good' : 'bad';
            await this.senarsBridge.inputNarsese(`<(*, ${stateToTerm(nextState)}) --> ${valence}>.`);
        }

        if (this.experienceBuffer.length > this.config.experienceBufferLimit) this.experienceBuffer.shift();

        return {stored: true, experience};
    }

    _updateCausalModel(transition) {
        const {state, action, nextState, reward} = transition;
        const graph = this.causalReasoner.graph;

        const stateVars = this._extractVariables(state);
        const nextVars = this._extractVariables(nextState);

        Object.entries(stateVars).forEach(([varId, value]) => {
            if (!graph.nodes.has(varId)) graph.addNode(varId, {type: 'state', value});
            graph.observe(varId, value);
        });

        if (this.experienceBuffer.length > 100) {
            const trajectories = this._extractTrajectories();
            graph.learnStructure(trajectories, {minStrength: this.config.minCausalStrength});
        }
    }

    _extractVariables(state) {
        return extractVariables(state);
    }

    _extractTrajectories() {
        const trajectories = [];
        let current = [];

        this.experienceBuffer.forEach(exp => {
            current.push({state: exp.state, action: exp.action, nextState: exp.nextState, reward: exp.reward});
            if (exp.done && current.length > 1) {
                trajectories.push({states: current.map(e => e.state)});
                current = [];
            }
        });

        return trajectories;
    }

    setGoal(goal) {
        this.currentGoal = goal;
        if (this.senarsBridge) this.senarsBridge.inputNarsese(NarseseUtils.goalToNarsese(goal));
        this.emit('goalSet', {goal});
    }

    getGoal() {
        return this.currentGoal;
    }

    clearGoal() {
        this.currentGoal = null;
        this.senarsBridge?.clearGoals();
    }

    getExperiences(options = {}) {
        const {limit = 100, filter = null} = options;
        let experiences = [...this.experienceBuffer];
        if (filter) experiences = experiences.filter(filter);
        return experiences.slice(-limit);
    }

    getActionHistory(limit = 100) {
        return this.actionHistory.slice(-limit);
    }

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
    static create(config = {}) {
        return new UnifiedNeuroSymbolicAgent(config);
    }

    static async createWithDefaults(env) {
        const config = {actionSpace: env.actionSpace, reasoningCycles: 50, integrationMode: 'full'};
        const agent = this.create(config);
        await agent.initialize();
        return agent;
    }

    static createDiscrete(config = {}) {
        return this.create({...config, actionType: 'discrete'});
    }

    static createContinuous(config = {}) {
        return this.create({...config, actionType: 'continuous'});
    }
}
