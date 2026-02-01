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
            const compound = termFactory.create(op, [finalC1, finalC2]); // Assume binary for now
            // Or use termFactory.conjunction/disjunction/intersection/union helpers if they exist for specific semantics
            // But NAL-3 uses specific operators: & (Intersection), | (Union)?
            // TermFactory has: conjunction (&), disjunction (|), setExt ({}), setInt ([]), intersection (?), union (?)
            // Usually Intersection is (&, T1, T2) or similar?
            // TermFactory.conjunction uses '&'.
            // TermFactory.disjunction uses '|'.

            // Wait, NAL-3 Intersection of properties (Intensional Intersection) is usually written as (P & M).
            // Union of subjects (Extensional Intersection?) is ((P & S) --> M)? No.

            // Let's use & and | for simplicity and consistency with TermFactory.

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
            const newTerm = termFactory.inheritance(sub, pred);
            const task = this.createDerivedTask(newTerm, truthVal, [primaryPremise], context, '.');
            if (task) results.push(task);
        };

        const derivedTruth = Truth.structuralDeduction(truth);
        if (!derivedTruth) return [];

        // Decompose Subject
        const s = term.subject;
        const p = term.predicate;

        if (s.isCompound) {
            // ((A & B) --> M) |- (A --> M)
            if (s.operator === '&' || s.operator === '&&') { // Intersection
                s.components.forEach(comp => derive(comp, p, derivedTruth));
            }
            // ((A | B) --> M) |- (A --> M)? No, Union subject implies M means A implies M AND B implies M.
            // Truth value should be higher?
            // NAL says: ((A | B) --> M) <=> (A --> M) && (B --> M).
            // So deriving (A --> M) from ((A | B) --> M) is Deduction?
            // Yes.
            if (s.operator === '|' || s.operator === '||') { // Union
                 s.components.forEach(comp => derive(comp, p, derivedTruth));
            }
        }

        // Decompose Predicate
        if (p.isCompound) {
            // (S --> (A & B)) |- (S --> A)
             if (p.operator === '&' || p.operator === '&&') { // Intersection
                p.components.forEach(comp => derive(s, comp, derivedTruth));
            }
             // (S --> (A | B)) |- (S --> A)? No. (S --> A) implies (S --> (A | B)).
             // But (S --> (A | B)) does not imply (S --> A).
             // It's Abduction-like? Or reduced confidence?
             // structuralReduction?
        }

        return results;
    }
}
