
import { SeNARSBridge } from '../reasoning/SeNARSBridge.js';
import { RLAgent } from '../core/RLAgent.js';

export class HierarchicalStrategy {
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

        // 2. Select new option using SeNARS
        // Ask: "Which skill is applicable?"
        // <(obs) --> (applicable, ?skill)>?

        // Simplified: use goal
        // <(goal) --> (achieved-by, ?skill)>?

        // For now, return a random skill from library or null
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
