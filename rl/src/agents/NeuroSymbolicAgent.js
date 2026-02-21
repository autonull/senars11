
import { RLAgent } from '../core/RLAgent.js';
import { SymbolGrounding } from '../core/SymbolGrounding.js';
import { WorkingMemory } from '../core/WorkingMemory.js';
import { SkillLibrary } from '../core/SkillLibrary.js';
import { SeNARSBridge } from '../reasoning/SeNARSBridge.js';
import { ModelBasedStrategy } from '../strategies/model-based.js';
import { HierarchicalStrategy } from '../strategies/hierarchical.js';
import { RuleInducer } from '../reasoning/RuleInducer.js';

export class NeuroSymbolicAgent extends RLAgent {
  constructor(env, config = {}) {
    super(env);
    this.config = {
        encoder: 'mlp',           // perception encoder
        reasoning: 'metta',       // 'metta' | 'senars' | 'none'
        grounding: 'learned',     // 'learned' | 'handcoded'
        planning: true,           // enable symbolic planning
        skillDiscovery: false,    // enable hierarchical skill learning
        ...config
    };

    this.grounding = new SymbolGrounding();
    this.memory = new WorkingMemory();
    this.skills = new SkillLibrary();
    this.bridge = new SeNARSBridge(this, config);
    this.planner = new ModelBasedStrategy(this.bridge, config);
    this.hierarchical = new HierarchicalStrategy(this.bridge, this.skills, config);
    this.inducer = new RuleInducer(this.bridge, config);
  }

  async initialize() {
      await this.bridge.initialize();
  }

  // Core interface
  async act(observation) {
      if (!this.bridge.initialized) await this.initialize();

      // 1. Perception -> Symbols
      const symbols = this.grounding.lift(observation);

      // 2. Reasoning / Planning
      let actionSymbols;

      // Try Hierarchical
      const option = await this.hierarchical.selectOption(symbols, 'goal'); // Goal hardcoded for now
      if (option) {
          actionSymbols = await option.act(observation);
      } else if (this.config.planning) {
          // Model-based planning
          // What action leads to goal?
          actionSymbols = await this.planner.act(symbols, 'goal');
      }

      // If planning failed or returned null, reactive fallback
      if (!actionSymbols) {
           // Random fallback
           if (this.env && this.env.actionSpace) {
               const as = this.env.actionSpace;
               if (as.type === 'Discrete') return Math.floor(Math.random() * as.n);
               // Continuous
               return as.low.map((l, i) => l + Math.random() * (as.high[i] - l));
           }
           return 0;
      }

      // 3. Symbols -> Action
      const action = this.grounding.ground(actionSymbols);
      return action;
  }

  async learn(observation, action, reward, nextObservation, done) {
      if (!this.bridge.initialized) await this.initialize();

      // Lift inputs
      const obsSym = this.grounding.lift(observation);
      const nextObsSym = this.grounding.lift(nextObservation);
      const actionSym = typeof action === 'number' ? `action_${action}` : `action_${action[0]}`; // Simplified action symbol

      // 1. Store experience
      const episode = {
          obs: obsSym,
          action: actionSym,
          reward: reward,
          nextObs: nextObsSym,
          done: done,
          symbol: obsSym // Use observation symbol as index key
      };

      this.memory.store(episode);

      // 2. Update grounding (if learned)
      if (this.config.grounding === 'learned') {
          this.grounding.updateGrounding(observation, obsSym);
      }

      // 3. Rule Induction
      // Feed to inducer
      this.inducer.induce([episode]);

      // 4. Skill discovery / consolidation
      if (this.config.skillDiscovery && done) {
          // Consolidate memory at end of episode
          this.memory.consolidate();
      }
  }

  // Neuro-symbolic specific
  async plan(goal) {
      return this.planner.act(null, goal);
  }

  async explain(decision) {
      // Query SeNARS for explanation
      // <(decision) --> ?explanation>?
      return "Explanation not implemented yet";
  }

  transferTo(newEnv) {
      // compositional transfer
      // Clear specific grounding but keep rules?
  }
}
