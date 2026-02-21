import { RLAgent } from '../core/RLAgent.js';
import { LearnedGrounding } from '../grounding/LearnedGrounding.js';
import { EpisodicMemory } from '../memory/EpisodicMemory.js';
import { SkillManager } from '../skills/SkillManager.js';
import { SkillDiscovery } from '../skills/SkillDiscovery.js';
import { DualProcessArchitecture } from '../architectures/DualProcessArchitecture.js';
import { MeTTaPolicyArchitecture } from '../architectures/MeTTaPolicyArchitecture.js';
import { EvolutionaryArchitecture } from '../architectures/EvolutionaryArchitecture.js';

export class NeuroSymbolicAgent extends RLAgent {
    constructor(env, config = {}) {
        super(env);
        this.config = {
            encoder: 'mlp',
            reasoning: 'metta',
            grounding: 'learned',
            planning: true,
            skillDiscovery: config.skillDiscovery ?? false,
            usePolicy: false,
            policyScript: null,
            architecture: 'dual-process',
            ...config
        };

        this.grounding = new LearnedGrounding();
        this.memory = new EpisodicMemory();
        this.skills = new SkillManager();

        // Optional skill discovery
        this.skillDiscovery = this.config.skillDiscovery ? new SkillDiscovery() : null;

        // Select Architecture
        if (this.config.architecture === 'metta-policy') {
            this.architecture = new MeTTaPolicyArchitecture(this, this.config);
        } else if (this.config.architecture === 'evolutionary') {
            this.architecture = new EvolutionaryArchitecture(this, this.config);
        } else {
            this.architecture = new DualProcessArchitecture(this, this.config);
        }

        // Bridge aliases
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
        await this.skillDiscovery?.initialize();
    }

    async act(observation, goal) {
        return this.architecture.act(observation, goal);
    }

    async learn(observation, action, reward, nextObservation, done) {
        return this.architecture.learn(observation, action, reward, nextObservation, done);
    }

    async plan(goal) {
        if (this.architecture.planner) {
            return this.architecture.planner.act(null, goal);
        }
        return null;
    }

    async explain(decision) {
        if (this.bridge?.initialized) {
            const query = `<(${decision}) --> ?explanation>?`;
            try {
                const result = await this.bridge.ask(query);
                if (result?.term) {
                    return `Explanation: ${result.term}`;
                }
            } catch {
                // Fallback
            }
        }
        return "Explanation not found";
    }

    /**
     * Discover skills from experiences.
     */
    async discoverSkills(experiences, options = {}) {
        if (!this.skillDiscovery) {
            return [];
        }
        return this.skillDiscovery.discoverSkills(experiences, options);
    }

    /**
     * Get discovered skills.
     */
    getSkills() {
        return this.skillDiscovery ? this.skillDiscovery.getState() : null;
    }

    /**
     * Compose skills for a goal.
     */
    async composeSkills(goal) {
        if (!this.skillDiscovery) {
            return null;
        }
        return this.skillDiscovery.composeSkills(goal);
    }

    async close() {
        await this.architecture.close();
        await this.skillDiscovery?.shutdown();
    }

    transferTo(newEnv) {
        // Compositional transfer logic
        if (this.skillDiscovery) {
            return this.skillDiscovery.transferTo(newEnv);
        }
    }
}
