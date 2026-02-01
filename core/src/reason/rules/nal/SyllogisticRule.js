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
        if (!primaryPremise || !secondaryPremise) return false;

        // Both premises need to be compound statements with the appropriate operator
        const term1 = primaryPremise.term;
        const term2 = secondaryPremise.term;

        if (!term1?.isCompound || !term2?.isCompound) return false;

        // Check that at least one premise has the correct operator for this rule
        const hasCorrectOperator = (term) => term.operator === this.operator;
        if (!hasCorrectOperator(term1) && !hasCorrectOperator(term2)) return false;

        // Check for syllogistic pattern: (S --> M) + (M --> P) => (S --> P)
        const comp1 = term1.components;
        const comp2 = term2.components;

        if (comp1.length !== 2 || comp2.length !== 2) return false;

        // Find potential matching middle terms using unification or equality
        // Pattern 1: (S --> M) + (M --> P) where term1.predicate matches term2.subject
        // Pattern 2: (M --> P) + (S --> M) where term2.predicate matches term1.subject

        const unifier = context?.unifier;

        const tryMatch = (t1, t2) => {
            if (unifier) {
                // If unifier is available, check if terms can unify
                return unifier.unify(t1, t2).success;
            }
            // Fallback to strict equality
            return t1.equals(t2);
        };

        const matchesPattern1 = tryMatch(term1.predicate, term2.subject);
        const matchesPattern2 = !matchesPattern1 && tryMatch(term2.predicate, term1.subject);

        return matchesPattern1 || matchesPattern2;
    }

    /**
     * Apply the syllogistic rule to derive new tasks
     * @param {Task} primaryPremise - The primary premise
     * @param {Task} secondaryPremise - The secondary premise
     * @returns {Array<Task>} - Array of derived tasks
     */
    apply(primaryPremise, secondaryPremise, context) {
        const term1 = primaryPremise.term;
        const term2 = secondaryPremise.term;
        const unifier = context?.unifier;
        const termFactory = context?.termFactory;

        let substitution = {};

        // Helper to match and capture substitution
        const match = (t1, t2) => {
            if (unifier) {
                const res = unifier.unify(t1, t2);
                if (res.success) {
                    substitution = res.substitution;
                    return true;
                }
                return false;
            }
            return t1.equals(t2);
        };

        // Re-check patterns to capture substitution
        // Pattern 1: (S --> M) + (M --> P) => (S --> P)
        if (match(term1.predicate, term2.subject)) {
            return this._createDerivedTask(
                primaryPremise, secondaryPremise,
                term1.subject, term2.predicate,
                this.operator, termFactory, unifier, substitution
            );
        }
        // Pattern 2: (M --> P) + (S --> M) => (S --> P)
        else if (match(term2.predicate, term1.subject)) {
            return this._createDerivedTask(
                primaryPremise, secondaryPremise,
                term2.subject, term1.predicate,
                this.operator, termFactory, unifier, substitution
            );
        }

        return [];
    }

    /**
     * Helper method to create derived task from syllogistic conclusion
     * @private
     */
    _createDerivedTask(primaryPremise, secondaryPremise, subject, predicate, operator, termFactory = null, unifier = null, substitution = {}) {
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
        let finalSubject = subject;
        let finalPredicate = predicate;

        if (unifier && Object.keys(substitution).length > 0) {
            finalSubject = unifier.applySubstitution(subject, substitution);
            finalPredicate = unifier.applySubstitution(predicate, substitution);
        }

        // Create the conclusion term using the Term class with proper structure
        const conclusionTerm = termFactory.create(operator, [finalSubject, finalPredicate]);

        // Use base class to create the task with proper stamp and budget
        const task = super.createDerivedTask(
            conclusionTerm,
            derivedTruth,
            [primaryPremise, secondaryPremise],
            null, // context not used for stamp/budget currently
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
