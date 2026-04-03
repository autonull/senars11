import { Agent } from '../core/RLCore.js';
import { LearnedGrounding } from '../memory/MemorySystem.js';
import { EpisodicMemory } from '../memory/EpisodicMemory.js';
import { SkillManager } from '../skills/SkillManager.js';
import { SkillDiscovery } from '../skills/SkillDiscovery.js';
import { DualProcessArchitecture } from '../architectures/DualProcessArchitecture.js';
import { MeTTaPolicyArchitecture } from '../architectures/MeTTaPolicyArchitecture.js';
import { EvolutionaryArchitecture } from '../architectures/EvolutionaryArchitecture.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

const NEUROSYMBOLIC_DEFAULTS = {
    encoder: 'mlp',
    reasoning: 'metta',
    grounding: 'learned',
    planning: true,
    skillDiscovery: false,
    usePolicy: false,
    policyScript: null,
    architecture: 'dual-process'
};

const ARCHITECTURE_MAP = {
    'metta-policy': MeTTaPolicyArchitecture,
    evolutionary: EvolutionaryArchitecture,
    'dual-process': DualProcessArchitecture
};

export class NeuroSymbolicAgent extends Agent {
    constructor(env, config = {}) {
        const mergedConfig = mergeConfig(NEUROSYMBOLIC_DEFAULTS, config);
        super(env, mergedConfig);

        this.grounding = new LearnedGrounding();
        this.memory = new EpisodicMemory();
        this.skills = new SkillManager();
        this.skillDiscovery = this.config.skillDiscovery ? new SkillDiscovery() : null;

        const ArchClass = ARCHITECTURE_MAP[this.config.architecture] ?? DualProcessArchitecture;
        this.architecture = new ArchClass(this, this.config);

        this._setupBridgeAliases();
    }

    _setupBridgeAliases() {
        if (this.architecture instanceof DualProcessArchitecture) {
            const { bridge, planner, hierarchical, inducer, metta } = this.architecture;
            Object.assign(this, { bridge, planner, hierarchical, inducer, metta });
        } else if (this.architecture instanceof MeTTaPolicyArchitecture) {
            this.metta = this.architecture.metta;
        }
    }

    async initialize() {
        await this.architecture.initialize();
        await this.skillDiscovery?.initialize();
    }

    act(observation, goal) {
        return this.architecture.act(observation, goal);
    }

    learn(observation, action, reward, nextObservation, done) {
        return this.architecture.learn(observation, action, reward, nextObservation, done);
    }

    async plan(goal) {
        return this.architecture.planner?.act(null, goal) ?? null;
    }

    async explain(decision) {
        if (this.bridge?.initialized) {
            try {
                const result = await this.bridge.ask(`<(${decision}) --> ?explanation>?`);
                if (result?.term) {
                    return `Explanation: ${result.term}`;
                }
            } catch (error) {
                this.logWarn?.('Explanation query failed, using fallback', {
                    decision,
                    error: error.message
                });
            }
        }
        return 'Explanation not found';
    }

    async discoverSkills(experiences, options = {}) {
        return this.skillDiscovery?.discoverSkills(experiences, options) ?? [];
    }

    getSkills() {
        return this.skillDiscovery?.getState() ?? null;
    }

    async composeSkills(goal) {
        return this.skillDiscovery?.composeSkills(goal) ?? null;
    }

    async close() {
        await this.architecture.close();
        await this.skillDiscovery?.shutdown();
    }

    transferTo(newEnv) {
        return this.skillDiscovery?.transferTo(newEnv);
    }
}
