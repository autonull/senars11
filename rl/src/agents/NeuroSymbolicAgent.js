
import { RLAgent } from '../core/RLAgent.js';
import { SymbolGrounding } from '../core/SymbolGrounding.js';
import { WorkingMemory } from '../core/WorkingMemory.js';
import { SkillLibrary } from '../core/SkillLibrary.js';
import { SeNARSBridge } from '../reasoning/SeNARSBridge.js';
import { ModelBasedStrategy } from '../strategies/model-based.js';
import { HierarchicalStrategy } from '../strategies/hierarchical.js';
import { RuleInducer } from '../reasoning/RuleInducer.js';
import { MeTTaInterpreter } from '@senars/metta';
import { registerTensorPrimitives } from '../core/TensorPrimitives.js';
import fs from 'fs';

export class NeuroSymbolicAgent extends RLAgent {
  constructor(env, config = {}) {
    super(env);
    this.config = {
        encoder: 'mlp',
        reasoning: 'metta',
        grounding: 'learned',
        planning: true,
        skillDiscovery: false,
        usePolicy: false,
        policyScript: null,
        ...config
    };

    // Ensure config is an object for SeNARSBridge and filter out conflicting keys
    const senarsConfig = typeof config === 'object' ? { ...config } : {};
    // 'reasoning' in Agent config is a string (engine selection), but SeNARS expects an object (params)
    // We remove it from the config passed to SeNARS to avoid validation error
    if (typeof senarsConfig.reasoning !== 'object') {
        delete senarsConfig.reasoning;
    }

    this.grounding = new SymbolGrounding();
    this.memory = new WorkingMemory();
    this.skills = new SkillLibrary();

    // If using MeTTa strategy, initialize interpreter
    if (this.config.reasoning === 'metta') {
        this.metta = new MeTTaInterpreter();
        // Register Tensor Primitives for Neuro-Symbolic Logic
        registerTensorPrimitives(this.metta);
    }

    this.bridge = new SeNARSBridge(this, senarsConfig);
    this.planner = new ModelBasedStrategy(this.bridge, this.config);
    this.hierarchical = new HierarchicalStrategy(this.bridge, this.skills, this.config);
    this.inducer = new RuleInducer(this.bridge, this.config);
  }

  async initialize() {
      await this.bridge.initialize();

      if (this.config.reasoning === 'metta' && this.config.policyScript) {
          try {
              const scriptContent = fs.readFileSync(this.config.policyScript, 'utf8');
              this.metta.run(scriptContent);
          } catch (e) {
              console.error(`Failed to load policy script: ${e.message}`);
          }
      }
  }

  // Core interface
  async act(observation, goal) {
      if (!this.bridge.initialized) await this.initialize();

      // 0. Neural Policy (Fast System 1)
      if (this.config.usePolicy && this.metta) {
          const obsStr = `(${observation.join(' ')})`;
          const result = this.metta.run(`! (get-action ${obsStr})`);
          // result is [Value(Tensor)] or [Symbol] depending on get-action return
          // get-action returns (&argmax ...) which returns a Symbol (index string)
          if (result && result.length > 0) {
               const actionStr = result[0].toString();
               const action = Number(actionStr);
               if (!isNaN(action)) return action;
          }
      }

      // 1. Perception -> Symbols
      const symbols = this.grounding.lift(observation);
      const goalSymbols = goal ? this.grounding.lift(goal) : 'goal';

      // 2. Reasoning / Planning
      let actionSymbols;

      // Try Hierarchical
      const option = await this.hierarchical.selectOption(symbols, goalSymbols);
      if (option) {
          actionSymbols = await option.act(observation);
      } else if (this.config.planning) {
          // Model-based planning: "What action leads to goal?"
          actionSymbols = await this.planner.act(symbols, goalSymbols);
      }

      // If planning failed or returned null, reactive fallback
      if (!actionSymbols) {
           return this._randomAction();
      }

      // 3. Symbols -> Action
      const action = this.grounding.ground(actionSymbols);

      // Validate action against environment spec
      const as = this.env?.actionSpace;
      if (as && as.type === 'Discrete' && typeof action !== 'number') {
           // Planning returned a non-action symbol (e.g. goal statement), fallback
           return this._randomAction();
      }

      return action;
  }

  _randomAction() {
      const as = this.env?.actionSpace;
      if (!as) return 0;

      if (as.type === 'Discrete') {
          return Math.floor(Math.random() * as.n);
      }
      // Continuous
      return as.low.map((l, i) => l + Math.random() * (as.high[i] - l));
  }

  async learn(observation, action, reward, nextObservation, done) {
      if (!this.bridge.initialized) await this.initialize();

      // 0. Update Neural Policy
      if (this.config.usePolicy && this.metta) {
          const obsStr = `(${observation.join(' ')})`;
          // Simple target construction for demonstration:
          // If action 0 taken and reward 1, target [1, 0].
          // This is NOT proper Q-learning but shows tensor flow.
          // Ideally we query the network for next Q values here.

          const target = [0, 0];
          // Ensure action is valid index
          if (typeof action === 'number' && action < target.length) {
               target[action] = reward;
          }
          const targetStr = `(${target.join(' ')})`;
          this.metta.run(`! (update-policy ${obsStr} ${targetStr})`);
      }

      // Lift inputs
      const obsSym = this.grounding.lift(observation);
      const nextObsSym = this.grounding.lift(nextObservation);
      const actionSym = typeof action === 'number' ? `action_${action}` : `action_${action[0]}`; // Simplified action symbol

      // 1. Store experience
      const episode = {
          obs: obsSym,
          action: actionSym,
          reward,
          nextObs: nextObsSym,
          done,
          symbol: obsSym
      };

      this.memory.store(episode);

      // 2. Update grounding (if learned)
      if (this.config.grounding === 'learned') {
          this.grounding.updateGrounding(observation, obsSym);
      }

      // 3. Rule Induction
      this.inducer.induce([episode]);

      // 4. Skill discovery / consolidation
      if (this.config.skillDiscovery && done) {
          this.memory.consolidate();
      }
  }

  // Neuro-symbolic specific
  async plan(goal) {
      return this.planner.act(null, goal);
  }

  async explain(decision) {
      if (this.bridge && this.bridge.initialized) {
           const query = `<(${decision}) --> ?explanation>?`;
           try {
               const result = await this.bridge.ask(query);
               if (result && result.term) {
                   return `Explanation: ${result.term}`;
               }
           } catch (e) {
               // Fallback if query fails
           }
      }
      return "Explanation not found";
  }

  async close() {
      if (this.bridge) {
          await this.bridge.close();
      }
  }

  transferTo(newEnv) {
      // compositional transfer logic placeholder
  }
}
