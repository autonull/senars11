
import { RLAgent } from '../core/RLAgent.js';
import { SymbolGrounding } from '../core/SymbolGrounding.js';
import { WorkingMemory } from '../core/WorkingMemory.js';
import { SkillLibrary } from '../core/SkillLibrary.js';
import { DualProcessArchitecture } from '../architectures/DualProcessArchitecture.js';
import { MeTTaPolicyArchitecture } from '../architectures/MeTTaPolicyArchitecture.js';

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
        architecture: 'dual-process', // Default
        ...config
    };

    this.grounding = new SymbolGrounding();
    this.memory = new WorkingMemory();
    this.skills = new SkillLibrary();

    // Select Architecture
    if (this.config.architecture === 'metta-policy') {
        this.architecture = new MeTTaPolicyArchitecture(this, this.config);
    } else {
        // Default to Dual Process (the original implementation)
        this.architecture = new DualProcessArchitecture(this, this.config);
    }

    // Bridge aliases for backward compatibility if accessed directly
    if (this.architecture instanceof DualProcessArchitecture) {
        this.bridge = this.architecture.bridge;
        this.planner = this.architecture.planner;
        this.hierarchical = this.architecture.hierarchical;
        this.inducer = this.architecture.inducer;
        this.metta = this.architecture.metta;
    } else if (this.architecture instanceof MeTTaPolicyArchitecture) {
        this.metta = this.architecture.metta;
    }
  }

  async initialize() {
      await this.architecture.initialize();
  }

  // Core interface
  async act(observation, goal) {
      return this.architecture.act(observation, goal);
  }

  async learn(observation, action, reward, nextObservation, done) {
      return this.architecture.learn(observation, action, reward, nextObservation, done);
  }

  // Neuro-symbolic specific
  async plan(goal) {
      if (this.architecture.planner) {
          return this.architecture.planner.act(null, goal);
      }
      return null;
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
      await this.architecture.close();
  }

  transferTo(newEnv) {
      // compositional transfer logic placeholder
  }
}
