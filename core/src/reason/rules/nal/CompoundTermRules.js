import {NALRule} from './NALRule.js';
import {Truth} from '../../../Truth.js';

/**
 * Compound Term Rules (NAL-3)
 * Handles Composition and Decomposition of compound terms (Intersection, Union).
 */
export class CompoundCompositionRule extends NALRule {
    constructor(config = {}) {
        super('nal-compound-composition', 'nal', 0.8, config);
    }

    canApply(primaryPremise, secondaryPremise, context) {
        if (!primaryPremise || !secondaryPremise) return false;

        const {term: t1} = primaryPremise;
        const {term: t2} = secondaryPremise;
        const unifier = context?.unifier;

        if (!t1?.isCompound || !t2?.isCompound) return false;
        if (t1.operator !== '-->' || t2.operator !== '-->') return false;

        const checkMatch = (u, v) => {
             if (unifier) {
                return unifier.unify(u, v).success;
            }
            return u?.equals?.(v);
        };

        // Shared Subject or Shared Predicate
        return checkMatch(t1.subject, t2.subject) || checkMatch(t1.predicate, t2.predicate);
    }

    apply(primaryPremise, secondaryPremise, context) {
        if (!this.canApply(primaryPremise, secondaryPremise, context)) return [];

        const {term: t1, truth: truth1} = primaryPremise;
        const {term: t2, truth: truth2} = secondaryPremise;
        const termFactory = context?.termFactory;
        const unifier = context?.unifier;

        if (!termFactory) return [];

        let substitution = {};
        const match = (u, v) => {
            if (unifier) {
                const res = unifier.unify(u, v);
                if (res.success) {
                    substitution = res.substitution;
                    return true;
                }
                return false;
            }
            return u?.equals?.(v);
        };

        const results = [];
        const derive = (op, comp1, comp2, isSubject, common, truthFunc) => {
            let finalC1 = comp1;
            let finalC2 = comp2;
            let finalCommon = common;

            if (unifier && Object.keys(substitution).length > 0) {
                finalC1 = unifier.applySubstitution(finalC1, substitution);
                finalC2 = unifier.applySubstitution(finalC2, substitution);
                finalCommon = unifier.applySubstitution(finalCommon, substitution);
            }

            // Create compound
            const compound = termFactory.create(op, [finalC1, finalC2]);

            let conclusionTerm;
            if (isSubject) {
                // ((C1 op C2) --> Common)
                conclusionTerm = termFactory.inheritance(compound, finalCommon);
            } else {
                // (Common --> (C1 op C2))
                conclusionTerm = termFactory.inheritance(finalCommon, compound);
            }

            const derivedTruth = truthFunc(truth1, truth2);
            if (derivedTruth) {
                const task = this.createDerivedTask(conclusionTerm, derivedTruth, [primaryPremise, secondaryPremise], context, '.');
                if (task) results.push(task);
            }
        };

        // Shared Subject: (S --> P), (S --> M)
        if (match(t1.subject, t2.subject)) {
            // Intersection: (S --> (P & M)) using Truth.intersection
            derive('&', t1.predicate, t2.predicate, false, t1.subject, Truth.intersection);

            // Union: (S --> (P | M)) using Truth.union
            derive('|', t1.predicate, t2.predicate, false, t1.subject, Truth.union);
        }

        // Shared Predicate: (P --> M), (S --> M)
        else if (match(t1.predicate, t2.predicate)) {
            // Intersection: ((P & S) --> M) using Truth.union
            derive('&', t1.subject, t2.subject, true, t1.predicate, Truth.union);

            // Union: ((P | S) --> M) using Truth.intersection
            derive('|', t1.subject, t2.subject, true, t1.predicate, Truth.intersection);
        }

        return results;
    }
}

export class CompoundDecompositionRule extends NALRule {
    constructor(config = {}) {
        super('nal-compound-decomposition', 'nal', 1.0, config);
    }

    canApply(primaryPremise, secondaryPremise, context) {
        if (!primaryPremise) return false;

        // We allow secondaryPremise to be present, but we ignore it for decomposition
        // This allows the rule to fire in a stream reasoner that always provides pairs

        const {term} = primaryPremise;
        if (!term?.isCompound || term.operator !== '-->') return false;

        // Check if subject or predicate is compound
        const s = term.subject;
        const p = term.predicate;

        return (s?.isCompound && (s.operator === '&' || s.operator === '|')) ||
               (p?.isCompound && (p.operator === '&' || p.operator === '|'));
    }

    apply(primaryPremise, secondaryPremise, context) {
        if (!this.canApply(primaryPremise, secondaryPremise, context)) return [];

        const {term, truth} = primaryPremise;
        const termFactory = context?.termFactory;
        if (!termFactory) return [];

        const results = [];

        // Helper
        const derive = (sub, pred, truthVal) => {
            if (!truthVal) return;
            const newTerm = termFactory.inheritance(sub, pred);
            const task = this.createDerivedTask(newTerm, truthVal, [primaryPremise], context, '.');
            if (task) results.push(task);
        };

        const deductiveTruth = Truth.structuralDeduction(truth);
        // Inductive truth for invalid structural deductions (like Intersection Subject Decomposition)
        // (A & B) --> M does NOT deduce A --> M. It might suggest it inductively?
        // Actually, NAL uses structural deduction only for tautological entailments.
        // ((A & B) --> M) <=> (A --> M) is FALSE.
        // ((A | B) --> M) <=> (A --> M) & (B --> M). This is TRUE.

        // Decompose Subject
        const s = term.subject;
        const p = term.predicate;

        if (s.isCompound) {
            // ((A & B) --> M) |- (A --> M)
            // This is NOT valid deduction. It is induction-like or invalid.
            // Removing for now to fix logic error.

            // ((A | B) --> M) |- (A --> M).
            // Valid Deduction.
            if (s.operator === '|' || s.operator === '||') { // Union
                 s.components.forEach(comp => derive(comp, p, deductiveTruth));
            }
        }

        // Decompose Predicate
        if (p.isCompound) {
            // (S --> (A & B)) |- (S --> A)
            // Valid Deduction.
             if (p.operator === '&' || p.operator === '&&') { // Intersection
                p.components.forEach(comp => derive(s, comp, deductiveTruth));
            }
             // (S --> (A | B)) |- (S --> A)?
             // (S --> A) => (S --> (A | B)).
             // (S --> (A | B)) does not imply (S --> A).
             // Invalid deduction.
        }

        return results;
    }
}
