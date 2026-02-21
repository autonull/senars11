
export class Skill {
    constructor(name, config = {}) {
        this.name = name;
        this.config = config;
        this.preconditionFn = config.precondition || (() => true);
        this.terminationFn = config.termination || (() => true);
        this.actionFn = config.action || (() => 0);
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
