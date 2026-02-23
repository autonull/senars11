
const SKILL_DEFAULTS = {
    precondition: null,
    termination: null,
    action: null
};

const mergeConfig = (defaults, config) => ({ ...defaults, ...config });

export class Skill {
    constructor(name, config = {}) {
        const merged = mergeConfig(SKILL_DEFAULTS, config);
        this.name = name;
        this.config = merged;
        this.preconditionFn = merged.precondition ?? (() => true);
        this.terminationFn = merged.termination ?? (() => true);
        this.actionFn = merged.action ?? (() => 0);
    }

    precondition(obs) {
        return this.preconditionFn(obs);
    }

    terminated(obs) {
        return this.terminationFn(obs);
    }

    async act(obs) {
        return this.actionFn(obs);
    }
}
