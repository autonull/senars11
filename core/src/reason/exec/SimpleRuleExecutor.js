import {mergeConfig} from '../utils/common.js';
import {logError} from '../utils/error.js';

/**
 * RuleExecutor indexes all registered rules for fast retrieval.
 */
export class SimpleRuleExecutor {
    constructor(config = {}) {
        this.config = mergeConfig({}, config);
        this.rules = [];
    }

    register(rule) {
        this.rules.push(rule);
        return this;
    }

    registerMany(rules) {
        for (const rule of rules) {
            this.register(rule);
        }
        return this;
    }

    getCandidateRules(primaryPremise, secondaryPremise, context) {
        return this._filterCandidates(this.rules, primaryPremise, secondaryPremise, context);
    }

    /**
     * Filter candidates using canApply method
     * @private
     */
    _filterCandidates(candidates, primaryPremise, secondaryPremise, context) {
        const validRules = [];
        for (const rule of candidates) {
            try {
                if (this._canRuleApply(rule, primaryPremise, secondaryPremise, context)) {
                    validRules.push(rule);
                }
            } catch (error) {
                logError(error, {
                    ruleId: rule.id ?? rule.name,
                    context: 'rule_candidate_check'
                }, 'warn');
            }
        }
        return validRules;
    }

    /**
     * Helper method to determine if a rule can be applied
     * @private
     */
    _canRuleApply(rule, primaryPremise, secondaryPremise, context) {
        return rule.canApply?.(primaryPremise, secondaryPremise, context) ?? true;
    }

    executeRule(rule, primaryPremise, secondaryPremise, context = {}) {
        try {
            const results = rule.apply?.(primaryPremise, secondaryPremise, context) ?? [];
            return Array.isArray(results) ? results : [results];
        } catch (error) {
            logError(error, {
                ruleId: rule.id ?? rule.name,
                context: 'rule_execution'
            }, 'error');
            return [];
        }
    }

    getRuleCount() {
        return this.rules.length;
    }

    clearRules() {
        this.rules = [];
    }

    cleanup() {
        this.clearRules();
    }
}
