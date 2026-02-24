import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

const SKILL_DEFAULTS = {
    precondition: null,
    termination: null,
    policy: null,
    initiationSet: null,
    terminalSet: null,
    subSkills: [],
    abstractionLevel: 0,
    discoverySource: 'manual',
    experienceCapacity: 1000,
    experiencePruneThreshold: 500
};

export class Skill extends Component {
    constructor(name, config = {}) {
        const mergedConfig = mergeConfig(SKILL_DEFAULTS, { name, ...config });
        super(mergedConfig);

        this.experience = [];
        this.successRate = 0;
        this.usageCount = 0;
        this.parent = null;
        this.children = new Map();
    }

    async onInitialize() {
        this.children.forEach(skill => skill.initialize());
        this.setState('active', false);
        this.setState('currentStep', 0);
    }

    canInitiate(obs, context = {}) {
        return this.config.initiationSet?.(obs, context)
            ?? this.config.precondition?.(obs, context)
            ?? true;
    }

    shouldTerminate(obs, context = {}) {
        return this.config.termination?.(obs, context)
            ?? this.config.terminalSet?.(obs, context)
            ?? false;
    }

    async act(obs, context = {}) {
        this.setState('active', true);
        this.setState('currentStep', this.getState('currentStep') + 1);
        this.usageCount++;

        const action = this.config.policy
            ? await this.config.policy(obs, context, this)
            : this.children.size > 0
                ? await this._executeHierarchical(obs, context)
                : this._defaultPolicy(obs, context);

        this.experience.push({ obs, action, context: { ...context }, step: this.getState('currentStep'), timestamp: Date.now() });

        if (this.shouldTerminate(obs, context)) {
            this.setState('active', false);
            this.setState('currentStep', 0);
        }

        return action;
    }

    async _executeHierarchical(obs, context) {
        const selected = this._selectSubSkill(obs, context);
        return selected?.act(obs, context) ?? this._defaultPolicy(obs, context);
    }

    _selectSubSkill(obs, context) {
        for (const skill of this.children.values()) {
            if (skill.canInitiate(obs, context)) return skill;
        }
        return null;
    }

    _defaultPolicy(obs, context) {
        return Math.floor(Math.random() * (context.actionSpace ?? 2));
    }

    async learn(reward, done = false) {
        if (done) {
            const success = reward > 0;
            this.successRate = (this.successRate * this.usageCount + (success ? 1 : 0)) / (this.usageCount + 1);
        }

        const last = this.experience.at(-1);
        if (last && this.config.policy?.update) {
            await this.config.policy.update(last, reward, done);
        }

        if (this.experience.length > this.config.experienceCapacity) {
            this.experience = this.experience.slice(-this.config.experiencePruneThreshold);
        }
    }

    addSubSkill(name, skill) {
        skill.parent = this;
        this.children.set(name, skill);
        return this;
    }

    removeSubSkill(name) {
        const skill = this.children.get(name);
        if (skill) {
            skill.parent = null;
            this.children.delete(name);
        }
        return this;
    }

    toSymbolicTerm() {
        return {
            type: 'Skill',
            name: this.config.name,
            abstractionLevel: this.config.abstractionLevel,
            successRate: this.successRate,
            usageCount: this.usageCount,
            subSkills: Array.from(this.children.keys())
        };
    }

    getSuccessRate() {
        return this.usageCount > 0 ? this.successRate : 0.5;
    }

    isApplicable(state, bridge) {
        if (!this.config.precondition) return true;
        const stateNarsese = bridge?.observationToNarsese(state) ?? '';
        return stateNarsese.includes(this.config.precondition);
    }

    isTerminated(state, bridge) {
        return this.config.termination?.(state)
            ?? (this.config.postcondition ? (bridge?.observationToNarsese(state) ?? '').includes(this.config.postcondition) : false);
    }

    update(experience, success) {
        this.successRate += success ? 1 : 0;
        this.usageCount++;
    }
}
