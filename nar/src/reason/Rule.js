import {deepMergeConfig as mergeConfig} from './utils/common.js';
import {logError} from './utils/error.js';

/**
 * Base Rule class for the new reasoner design
 */
export class Rule {
    constructor(id, type = 'general', priority = 1.0, config = {}) {
        this.id = id;
        this.type = type; // 'nal', 'lm', or other types
        this.priority = priority;
        this.config = mergeConfig({
            enabled: true
        }, config);
        this.enabled = this.config.enabled;
    }

    /**
     * Determine if this rule can be applied to the given premises
     * @param {Task} primaryPremise - The primary premise
     * @param {Task} secondaryPremise - The secondary premise
     * @param {object} context - The execution context
     * @returns {boolean} - Whether the rule can be applied
     */
    canApply(primaryPremise, secondaryPremise, context) {
        return this.enabled;
    }

    /**
     * Apply the rule to the given premises
     * @param {Task} primaryPremise - The primary premise
     * @param {Task} secondaryPremise - The secondary premise
     * @param {object} context - The execution context
     * @returns {Array<Task>} - Array of derived tasks
     */
    apply(primaryPremise, secondaryPremise, context) {
        // Default implementation - should be overridden by subclasses
        return [];
    }

    /**
     * Apply the rule asynchronously (for LM rules and other async operations)
     * @param {Task} primaryPremise - The primary premise
     * @param {Task} secondaryPremise - The secondary premise
     * @param {object} context - The execution context
     * @returns {Promise<Array<Task>>} - Promise resolving to array of derived tasks
     */
    async applyAsync(primaryPremise, secondaryPremise, context) {
        // Default implementation - should be overridden by subclasses that need async processing
        try {
            return this.apply(primaryPremise, secondaryPremise, context);
        } catch (error) {
            logError(error, {ruleId: this.id, context: 'async_rule_application'});
            return [];
        }
    }

    /**
     * Enable the rule
     */
    enable() {
        this.enabled = true;
        this.config.enabled = true;
        return this;
    }

    /**
     * Disable the rule
     */
    disable() {
        this.enabled = false;
        this.config.enabled = false;
        return this;
    }
}