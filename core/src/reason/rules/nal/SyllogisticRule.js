/**
 * Abstract Syllogistic Rule for the stream-based reasoner
 * Implements the syllogistic deduction rule base for both inheritance and implication.
 * Derives (S --> P) or (S ==> P) from (S --> M) and (M --> P) or (S ==> M) and (M ==> P)
 */

import {NALRule} from './NALRule.js';
import {Truth} from '../../../Truth.js';

export class SyllogisticRule extends NALRule {
    /**
     * Constructor for abstract class - should be called by subclasses
     * @param {string} id - Rule identifier
     * @param {string} operator - The operator this rule handles (e.g. '==>' or '-->')
     * @param {number} priority - Rule priority
     * @param {Object} config - Configuration options
     */
    constructor(id, operator, priority, config = {}) {
        super(id, 'nal', priority, config);
        this.operator = operator;
    }

    /**
     * Determine if this rule can be applied to the given premises
     * @param {Task} primaryPremise - The primary premise
     * @param {Task} secondaryPremise - The secondary premise
     * @returns {boolean} - Whether the rule can be applied
     */
    canApply(primaryPremise, secondaryPremise, context) {
        if (!primaryPremise?.term?.isCompound || !secondaryPremise?.term?.isCompound) return false;

        const term1 = primaryPremise.term;
        const term2 = secondaryPremise.term;

        if ((term1.operator !== this.operator && term2.operator !== this.operator) ||
            term1.components.length !== 2 || term2.components.length !== 2) return false;

        return this.unify(term1.predicate, term2.subject, context).success ||
               this.unify(term2.predicate, term1.subject, context).success;
    }

    apply(primaryPremise, secondaryPremise, context) {
        const term1 = primaryPremise.term;
        const term2 = secondaryPremise.term;

        const patterns = [
            // (S --> M) + (M --> P) => (S --> P)
            {match: this.unify(term1.predicate, term2.subject, context), s: term1.subject, p: term2.predicate},
            // (M --> P) + (S --> M) => (S --> P)
            {match: this.unify(term2.predicate, term1.subject, context), s: term2.subject, p: term1.predicate}
        ];

        for (const {match, s, p} of patterns) {
            if (match.success) {
                return this._createDerivedTask(
                    primaryPremise, secondaryPremise, s, p,
                    this.operator, context?.termFactory, context, match.substitution
                );
            }
        }
        return [];
    }

    /**
     * Helper method to create derived task from syllogistic conclusion
     * @private
     */
    _createDerivedTask(primaryPremise, secondaryPremise, subject, predicate, operator, termFactory = null, context = null, substitution = {}) {
        // Calculate truth value using NAL deduction
        const truth1 = primaryPremise.truth;
        const truth2 = secondaryPremise.truth;

        if (!truth1 || !truth2) return [];

        const derivedTruth = Truth.deduction(truth1, truth2);
        if (!derivedTruth) return [];

        if (!termFactory) {
            // TermFactory is required for proper term creation and caching
            return [];
        }

        // Apply substitution if available (NAL-6)
        const finalSubject = this.applySubstitution(subject, substitution, context);
        const finalPredicate = this.applySubstitution(predicate, substitution, context);

        // Create the conclusion term using the Term class with proper structure
        const conclusionTerm = termFactory.create(operator, [finalSubject, finalPredicate]);

        // Use base class to create the task with proper stamp and budget
        const task = super.createDerivedTask(
            conclusionTerm,
            derivedTruth,
            [primaryPremise, secondaryPremise],
            context, // Pass context if needed by future overrides
            '.'   // Punctuation is Belief
        );

        return task ? [task] : [];
    }
}

// Export concrete implementations
export class InheritanceSyllogisticRule extends SyllogisticRule {
    constructor(config = {}) {
        super('nal-inheritance-syllogistic', '-->', 1.0, config);
    }
}

export class ImplicationSyllogisticRule extends SyllogisticRule {
    constructor(config = {}) {
        super('nal-implication-syllogistic', '==>', 1.0, config);
    }
}

export default SyllogisticRule;
