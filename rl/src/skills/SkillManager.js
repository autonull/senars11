const mergeConfig = (defaults, config) => ({ ...defaults, ...config });

const SKILL_MANAGER_DEFAULTS = {
    maxSkills: 1000,
    autoPrune: false,
    pruneThreshold: 0.1
};

export class SkillManager {
    constructor(config = {}) {
        this.config = mergeConfig(SKILL_MANAGER_DEFAULTS, config);
        this.skills = new Map();
    }

    register(name, skill) {
        if (this.config.autoPrune && this.skills.size >= this.config.maxSkills) {
            this._pruneLowPerforming();
        }
        this.skills.set(name, skill);
    }

    get(name) {
        return this.skills.get(name);
    }

    available(context) {
        return Array.from(this.skills.entries())
            .filter(([, skill]) => !skill.precondition || skill.precondition(context))
            .map(([name]) => name);
    }

    list() {
        return Array.from(this.skills.keys());
    }

    remove(name) {
        return this.skills.delete(name);
    }

    clear() {
        this.skills.clear();
    }

    get stats() {
        return { totalSkills: this.skills.size };
    }

    _pruneLowPerforming() {
        const lowPerformers = Array.from(this.skills.entries())
            .filter(([, skill]) => skill.getSuccessRate?.() < this.config.pruneThreshold)
            .map(([name]) => name);

        lowPerformers.forEach(name => this.skills.delete(name));
    }
}
