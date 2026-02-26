import { Architecture } from '../core/RLCore.js';
import { SeNARSBridge } from '../bridges/SeNARSBridge.js';
import { Planner } from '../modules/Planner.js';
import { HierarchicalPlanner } from '../modules/HierarchicalPlanner.js';
import { RuleInducer } from '../modules/RuleInducer.js';
import { IntrinsicMotivation } from '../modules/IntrinsicMotivation.js';
import { MeTTaInterpreter } from '@senars/metta';
import { registerTensorPrimitives } from '../core/TensorPrimitives.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import fs from 'fs';

const DUAL_PROCESS_DEFAULTS = {
    reasoning: 'senars',
    planning: true,
    usePolicy: false,
    policyScript: null,
    skillDiscovery: false,
    grounding: 'symbolic'
};

export class DualProcessArchitecture extends Architecture {
    constructor(agent, config = {}) {
        super(agent, mergeConfig(DUAL_PROCESS_DEFAULTS, config));

        const senarsConfig = typeof config === 'object' ? { ...config } : {};
        if (typeof senarsConfig.reasoning !== 'object') delete senarsConfig.reasoning;

        if (this.config.reasoning === 'metta') {
            this.metta = new MeTTaInterpreter();
            registerTensorPrimitives(this.metta);
        }

        this.bridge = new SeNARSBridge(agent, senarsConfig);
        this.planner = new Planner(this.bridge, this.config);
        this.hierarchical = new HierarchicalPlanner(this.bridge, agent.skills, this.config);
        this.inducer = new RuleInducer(this.bridge, this.config);
        this.motivation = new IntrinsicMotivation(this.config);
    }

    async initialize() {
        if (this.initialized) return;

        await this.bridge.initialize();

        if (this.config.reasoning === 'metta' && this.config.policyScript) {
            try {
                const scriptContent = fs.readFileSync(this.config.policyScript, 'utf8');
                this.metta.run(scriptContent);
            } catch (e) {
                console.error(`Failed to load policy script: ${e.message}`);
            }
        }

        await super.initialize();
    }

    async act(observation, goal) {
        if (!this.initialized) await this.initialize();

        if (this.config.usePolicy && this.metta) {
            const obsStr = `(${observation.join(' ')})`;
            const result = this.metta.run(`! (get-action ${obsStr})`);
            if (result?.length > 0) {
                const action = Number(result[0].toString());
                if (!isNaN(action)) return action;
            }
        }

        const symbols = this.agent.grounding.lift(observation);
        const goalSymbols = goal ? this.agent.grounding.lift(goal) : 'goal';

        let actionSymbols;

        const option = await this.hierarchical.selectOption(symbols, goalSymbols);
        if (option) {
            actionSymbols = await option.act(observation);
        } else if (this.config.planning) {
            actionSymbols = await this.planner.act(symbols, goalSymbols);
        }

        if (!actionSymbols) return this._randomAction();

        const action = this.agent.grounding.ground(actionSymbols);

        const as = this.agent.env?.actionSpace;
        if (as?.type === 'Discrete' && typeof action !== 'number') {
            return this._randomAction();
        }

        return action;
    }

    _randomAction() {
        const as = this.agent.env?.actionSpace;
        if (!as) return 0;

        if (as.type === 'Discrete') {
            return Math.floor(Math.random() * as.n);
        }
        return as.low.map((l, i) => l + Math.random() * (as.high[i] - l));
    }

    async learn(observation, action, reward, nextObservation, done) {
        if (!this.initialized) await this.initialize();

        const intrinsicReward = this.motivation.calculate({ obs: observation, action, nextObs: nextObservation });
        const totalReward = reward + intrinsicReward;

        if (this.config.usePolicy && this.metta) {
            const obsStr = `(${observation.join(' ')})`;
            const target = [0, 0];
            if (typeof action === 'number' && action < target.length) {
                target[action] = totalReward;
            }
            const targetStr = `(${target.join(' ')})`;
            this.metta.run(`! (update-policy ${obsStr} ${targetStr})`);
        }

        const obsSym = this.agent.grounding.lift(observation);
        const nextObsSym = this.agent.grounding.lift(nextObservation);
        const actionSym = typeof action === 'number'
            ? `action_${action}`
            : `action_${action[0]}`;

        const episode = { obs: obsSym, action: actionSym, reward, nextObs: nextObsSym, done, symbol: obsSym };
        this.agent.memory.store(episode);

        if (this.config.grounding === 'learned') {
            this.agent.grounding.update(observation, obsSym);
        }

        this.inducer.induce([episode]);

        if (this.config.skillDiscovery && done) {
            this.agent.memory.consolidate();
        }
    }

    async close() {
        if (this.bridge) await this.bridge.close();
        await super.close();
    }
}
