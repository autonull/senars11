
import { SeNARSBridge } from '../bridges/SeNARSBridge.js';
import { RLAgent } from '../core/RLAgent.js';

export class HierarchicalPlanner {
    constructor(bridge, skillLibrary, config = {}) {
        this.bridge = bridge;
        this.skills = skillLibrary;
        this.config = config;
        this.currentOption = null;
    }

    /**
     * Select an option (sub-policy) to execute.
     */
    async selectOption(obs, goal) {
        // 1. Check if current option is still valid
        if (this.currentOption && !this.currentOption.terminated(obs)) {
            return this.currentOption;
        }

        this.currentOption = null;

        // 2. Select new option using SeNARS
        if (this.bridge && goal) {
            // Ask: "What skill achieves the goal?"
            // Query: <(?skill) --> (achieved-by, goal)>?
            // Or better: <(goal) --> (achieved-by, ?skill)>?
            // Assuming "achieved-by" is the relation.

            // Format goal term
            const goalTerm = Array.isArray(goal) ? `(${goal.join(' ')})` : String(goal);
            // Narsese syntax: <S --> P>?
            // Here S=goal, P=(achieved_by, ?skill)
            // Note: If goal is compound term like (1 2), wrap it in parens?
            // SymbolGrounding usually returns strings like "state_0_0" or "(1,2)".
            // If goal is already a string, assume it's a term.

            // To be safe, we query: <goal --> (achieved_by, ?skill)>?
            const query = `<${goalTerm} --> (achieved_by, ?skill)>?`;

            const result = await this.bridge.ask(query);

            if (result && result.substitution && result.substitution['?skill']) {
                let skillName = result.substitution['?skill'].toString();
                // Strip quotes if present (some terms might be string literals)
                skillName = skillName.replace(/^"|"$/g, '');

                const skill = this.skills.get(skillName);
                if (skill && (typeof skill.precondition !== 'function' || skill.precondition(obs))) {
                    this.currentOption = skill;
                    return skill;
                }
            }
        }

        // Fallback: return a random available skill from library or null
        const available = this.skills.available(obs);
        if (available.length > 0) {
            const skillName = available[0]; // Simple first available
            this.currentOption = this.skills.get(skillName);
            return this.currentOption;
        }

        return null;
    }

    /**
     * Act using the selected option.
     */
    async act(obs) {
        if (!this.currentOption) {
            // Primitive action selection (fallback)
            return null;
        }

        return this.currentOption.act(obs);
    }
}
