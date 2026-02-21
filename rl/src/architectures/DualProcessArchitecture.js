
import { Architecture } from '../core/Architecture.js';
import { SeNARSBridge } from '../reasoning/SeNARSBridge.js';
import { ModelBasedStrategy } from '../strategies/model-based.js';
import { HierarchicalStrategy } from '../strategies/hierarchical.js';
import { RuleInducer } from '../reasoning/RuleInducer.js';
import { MeTTaInterpreter } from '@senars/metta';
import { registerTensorPrimitives } from '../core/TensorPrimitives.js';
import fs from 'fs';

/**
 * Dual Process Architecture
 * Combines Fast (System 1 - Neural Policy) and Slow (System 2 - Symbolic Planning) reasoning.
 * This is the default architecture for the NeuroSymbolicAgent.
 */
export class DualProcessArchitecture extends Architecture {
    constructor(agent, config = {}) {
        super(agent, config);

        // Ensure config is an object for SeNARSBridge and filter out conflicting keys
        const senarsConfig = typeof config === 'object' ? { ...config } : {};
        if (typeof senarsConfig.reasoning !== 'object') {
            delete senarsConfig.reasoning;
        }

        // Initialize MeTTa (System 1)
        if (this.config.reasoning === 'metta') {
            this.metta = new MeTTaInterpreter();
            registerTensorPrimitives(this.metta);
        }

        // Initialize SeNARS (System 2)
        this.bridge = new SeNARSBridge(agent, senarsConfig);
        this.planner = new ModelBasedStrategy(this.bridge, this.config);
        this.hierarchical = new HierarchicalStrategy(this.bridge, agent.skills, this.config);
        this.inducer = new RuleInducer(this.bridge, this.config);
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

        // 0. Neural Policy (Fast System 1)
        if (this.config.usePolicy && this.metta) {
            const obsStr = `(${observation.join(' ')})`;
            const result = this.metta.run(`! (get-action ${obsStr})`);
            if (result && result.length > 0) {
                 const actionStr = result[0].toString();
                 const action = Number(actionStr);
                 if (!isNaN(action)) return action;
            }
        }

        // 1. Perception -> Symbols
        const symbols = this.agent.grounding.lift(observation);
        const goalSymbols = goal ? this.agent.grounding.lift(goal) : 'goal';

        // 2. Reasoning / Planning
        let actionSymbols;

        // Try Hierarchical
        const option = await this.hierarchical.selectOption(symbols, goalSymbols);
        if (option) {
            actionSymbols = await option.act(observation);
        } else if (this.config.planning) {
            // Model-based planning
            actionSymbols = await this.planner.act(symbols, goalSymbols);
        }

        // If planning failed, random fallback
        if (!actionSymbols) {
             return this._randomAction();
        }

        // 3. Symbols -> Action
        const action = this.agent.grounding.ground(actionSymbols);

        // Validate action against environment spec
        const as = this.agent.env?.actionSpace;
        if (as && as.type === 'Discrete' && typeof action !== 'number') {
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

        // 0. Update Neural Policy
        if (this.config.usePolicy && this.metta) {
            const obsStr = `(${observation.join(' ')})`;
            const target = [0, 0];
            if (typeof action === 'number' && action < target.length) {
                 target[action] = reward;
            }
            const targetStr = `(${target.join(' ')})`;
            this.metta.run(`! (update-policy ${obsStr} ${targetStr})`);
        }

        // Lift inputs
        const obsSym = this.agent.grounding.lift(observation);
        const nextObsSym = this.agent.grounding.lift(nextObservation);
        const actionSym = typeof action === 'number' ? `action_${action}` : `action_${action[0]}`;

        // 1. Store experience
        const episode = {
            obs: obsSym,
            action: actionSym,
            reward,
            nextObs: nextObsSym,
            done,
            symbol: obsSym
        };

        this.agent.memory.store(episode);

        // 2. Update grounding (if learned)
        if (this.config.grounding === 'learned') {
            this.agent.grounding.updateGrounding(observation, obsSym);
        }

        // 3. Rule Induction
        this.inducer.induce([episode]);

        // 4. Skill discovery
        if (this.config.skillDiscovery && done) {
            this.agent.memory.consolidate();
        }
    }

    async close() {
        if (this.bridge) await this.bridge.close();
        await super.close();
    }
}
