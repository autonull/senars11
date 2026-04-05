/**
 * @file VariableIntroduction.js
 * @description NAL rule for introducing variables to generalize knowledge.
 *
 * This rule implements the NARS generalization pattern:
 * Given: (cat --> animal), (dog --> animal)
 * Derive: ($x --> animal) with reduced confidence
 *
 * Variable introduction enables:
 * 1. Generalization from specific instances
 * 2. Pattern recognition across similar statements
 * 3. Hypothesis formation for category membership
 */

import {NALRule} from './NALRule.js';
import {Truth} from '../../../Truth.js';
import {termsEqual} from '../../../term/TermUtils.js';

/**
 * Introduces independent variables ($) to generalize patterns.
 *
 * Patterns detected:
 * - Shared predicate: (A --> P), (B --> P) => ($x --> P)
 * - Shared subject: (S --> A), (S --> B) => (S --> $x)
 * - Matching structure: (A --> B), (C --> D) where structure matches
 */
export class VariableIntroductionRule extends NALRule {
    constructor(config = {}) {
        super({
            id: 'variable-introduction',
            category: 'generalization',
            priority: config.priority ?? 0.6,
            ...config
        });

        // Minimum confidence for variable introduction
        this.minConfidence = config.minConfidence ?? 0.3;

        // Variable counter for unique naming
        this._varCounter = 0;
    }

    /**
     * Check if this rule can apply to the given premises.
     * Requires two statements with matching structure.
     */
    canApply(primaryPremise, secondaryPremise, context = {}) {
        if (!primaryPremise?.term || !secondaryPremise?.term) {return false;}

        const p = primaryPremise.term;
        const s = secondaryPremise.term;

        if (!p.isCompound || !s.isCompound || p.operator !== s.operator || !['-->', '<->'].includes(p.operator)) {return false;}
        if (termsEqual(p, s)) {return false;}

        // Shared predicate or shared subject, but not both (identity)
        const samePred = termsEqual(p.predicate, s.predicate);
        const sameSubj = termsEqual(p.subject, s.subject);

        return (samePred && !sameSubj) || (!samePred && sameSubj);
    }

    /**
     * Apply variable introduction to create generalized statement.
     */
    apply(primaryPremise, secondaryPremise, context = {}) {
        if (!this.canApply(primaryPremise, secondaryPremise, context)) {return [];}

        const p = primaryPremise.term;
        const s = secondaryPremise.term;
        const {termFactory} = context;
        if (!termFactory) {return [];}

        const results = [];
        const truth = this._calculateGeneralizationTruth(primaryPremise.truth, secondaryPremise.truth);

        const generate = (variable, subject, predicate) => {
            const term = p.operator === '-->' ? termFactory.inheritance(subject, predicate) : termFactory.similarity(subject, predicate);
            if (term) {
                results.push(this.createDerivedTask(term, truth, [primaryPremise, secondaryPremise], context));
            }
        };

        if (termsEqual(p.predicate, s.predicate)) {
            generate(`?x${this._varCounter++}`, termFactory.variable(`?x${this._varCounter}`), p.predicate);
        } else if (termsEqual(p.subject, s.subject)) {
            generate(`?y${this._varCounter++}`, p.subject, termFactory.variable(`?y${this._varCounter}`));
        }

        return results.filter(Boolean);
    }

    /**
     * Create a statement term.
     * @private
     */
    _createStatement(termFactory, operator, subject, predicate) {
        switch (operator) {
            case '-->':
                return termFactory.inheritance(subject, predicate);
            case '<->':
                return termFactory.similarity(subject, predicate);
            default:
                return null;
        }
    }

    /**
     * Calculate truth value for generalization.
     * Generalization reduces confidence as it's inductive.
     * @private
     */
    _calculateGeneralizationTruth(truth1, truth2) {
        if (!truth1 || !truth2) {
            return new Truth(1.0, this.minConfidence);
        }

        // Average frequency, weakened confidence
        const avgFrequency = (truth1.frequency + truth2.frequency) / 2;
        const minConfidence = Math.min(truth1.confidence, truth2.confidence);

        // Weaken confidence for inductive generalization
        const weakenedConfidence = Truth.weak(minConfidence);

        return new Truth(avgFrequency, Math.max(this.minConfidence, weakenedConfidence));
    }

}

/**
 * Introduces dependent variables (#) for existential generalization.
 *
 * Pattern: (A --> B), derived from context
 * Result: (#x --> B) - "something has property B"
 */
export class DependentVariableIntroductionRule extends NALRule {
    constructor(config = {}) {
        super({
            id: 'dependent-variable-introduction',
            category: 'generalization',
            priority: config.priority ?? 0.4,
            ...config
        });

        this._varCounter = 0;
    }

    canApply(primaryPremise, secondaryPremise, context = {}) {
        // This is a unary rule - only needs primary premise
        if (!primaryPremise?.term) {return false;}

        const {term} = primaryPremise;
        if (!term.isCompound) {return false;}
        if (!['-->', '<->'].includes(term.operator)) {return false;}

        // Subject must be atomic (not already a variable)
        const {subject} = term;
        if (!subject || subject.isVariable) {return false;}

        return true;
    }

    apply(primaryPremise, secondaryPremise, context = {}) {
        if (!this.canApply(primaryPremise, secondaryPremise, context)) {
            return [];
        }

        const {termFactory} = context;
        if (!termFactory) {return [];}

        const {term} = primaryPremise;
        const variableTerm = termFactory.variable(`?z${this._varCounter++}`);

        let generalizedTerm;
        switch (term.operator) {
            case '-->':
                generalizedTerm = termFactory.inheritance(variableTerm, term.predicate);
                break;
            case '<->':
                generalizedTerm = termFactory.similarity(variableTerm, term.predicate);
                break;
            default:
                return [];
        }

        if (!generalizedTerm) {return [];}

        // Very weak confidence for existential generalization
        const truth = new Truth(
            primaryPremise.truth?.frequency ?? 1.0,
            Truth.weak(Truth.weak(primaryPremise.truth?.confidence ?? 0.9))
        );

        const derived = this.createDerivedTask(generalizedTerm, truth, [primaryPremise], context);
        return derived ? [derived] : [];
    }
}

// Export both rules
export const VariableIntroductionRules = [
    VariableIntroductionRule,
    DependentVariableIntroductionRule
];
