import {deepMergeConfig as mergeConfig} from '../utils/common.js';
import {logError} from '@senars/core';

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
        return candidates.filter(rule => {
            try {
                return rule.canApply?.(primaryPremise, secondaryPremise, context) ?? true;
            } catch (error) {
                logError(error, {
                    ruleId: rule.id ?? rule.name,
                    context: 'rule_candidate_check'
                }, 'warn');
                return false;
            }
        });
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
