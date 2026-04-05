import {mergeConfig} from '../utils/index.js';

const DEFAULTS = {
    defaultCycles: 50,
    fallbackStrategy: 'first-available'
};

export class HierarchicalPlanner {
    constructor(bridge, skillLibrary, config = {}) {
        this.bridge = bridge;
        this.skills = skillLibrary;
        this.config = mergeConfig(DEFAULTS, config);
        this.currentOption = null;
    }

    async selectOption(obs, goal) {
        if (this.currentOption && !this.currentOption.terminated(obs)) {
            return this.currentOption;
        }

        this.currentOption = null;

        if (this.bridge && goal) {
            const skill = await this._querySkillForGoal(goal, obs);
            if (skill) {
                this.currentOption = skill;
                return skill;
            }
        }

        const available = this.skills.available(obs);
        if (available.length > 0) {
            this.currentOption = this.skills.get(available[0]);
            return this.currentOption;
        }

        return null;
    }

    async _querySkillForGoal(goal, obs) {
        const goalTerm = Array.isArray(goal) ? `(${goal.join(' ')})` : String(goal);
        const query = `<${goalTerm} --> (achieved_by, ?skill)>?`;

        try {
            const result = await this.bridge.ask(query);
            if (result?.substitution?.['?skill']) {
                const skillName = result.substitution['?skill'].toString().replace(/^"|"$/g, '');
                const skill = this.skills.get(skillName);
                if (skill && (typeof skill.precondition !== 'function' || skill.precondition(obs))) {
                    return skill;
                }
            }
        } catch {
            // Query failed, will use fallback
        }
        return null;
    }

    async act(obs) {
        return this.currentOption?.act(obs) ?? null;
    }
}
