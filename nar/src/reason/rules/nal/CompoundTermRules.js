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
        if (!primaryPremise || !secondaryPremise) {
            return false;
        }

        const {term: t1} = primaryPremise;
        const {term: t2} = secondaryPremise;
        const unifier = context?.unifier;

        if (!t1?.isCompound || !t2?.isCompound) {
            return false;
        }
        if (t1.operator !== '-->' || t2.operator !== '-->') {
            return false;
        }

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
        if (!this.canApply(primaryPremise, secondaryPremise, context)) {
            return [];
        }

        const {term: t1} = primaryPremise;
        const {term: t2} = secondaryPremise;
        const termFactory = context?.termFactory;
        const unifier = context?.unifier;

        if (!termFactory) {
            return [];
        }

        let substitution = {};
        const match = (u, v) => {
            const res = unifier?.unify(u, v);
            if (res?.success) {
                substitution = res.substitution;
                return true;
            }
            return u?.equals?.(v);
        };

        const results = [];
        const derive = (op, c1, c2, isSubject, common, truthFunc) => {
            const finalC1 = this.applySubstitution(c1, substitution, context);
            const finalC2 = this.applySubstitution(c2, substitution, context);
            const finalCommon = this.applySubstitution(common, substitution, context);

            const compound = termFactory.create(op, [finalC1, finalC2]);
            const term = isSubject ? termFactory.inheritance(compound, finalCommon) : termFactory.inheritance(finalCommon, compound);
            const truth = truthFunc(primaryPremise.truth, secondaryPremise.truth);

            const task = this.createDerivedTask(term, truth, [primaryPremise, secondaryPremise], context);
            if (task) {
                results.push(task);
            }
        };

        if (match(t1.subject, t2.subject)) {
            derive('&', t1.predicate, t2.predicate, false, t1.subject, Truth.intersection);
            derive('|', t1.predicate, t2.predicate, false, t1.subject, Truth.union);
        } else if (match(t1.predicate, t2.predicate)) {
            derive('&', t1.subject, t2.subject, true, t1.predicate, Truth.union);
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
        if (!primaryPremise) {
            return false;
        }

        // We allow secondaryPremise to be present, but we ignore it for decomposition
        // This allows the rule to fire in a stream reasoner that always provides pairs

        const {term} = primaryPremise;
        if (!term?.isCompound || term.operator !== '-->') {
            return false;
        }

        // Check if subject or predicate is compound
        const s = term.subject;
        const p = term.predicate;

        return (s?.isCompound && (s.operator === '&' || s.operator === '|')) ||
            (p?.isCompound && (p.operator === '&' || p.operator === '|'));
    }

    apply(primaryPremise, secondaryPremise, context) {
        if (!this.canApply(primaryPremise, secondaryPremise, context)) {
            return [];
        }

        const {term} = primaryPremise;
        const termFactory = context?.termFactory;
        if (!termFactory) {
            return [];
        }

        const results = [];
        const truth = Truth.structuralDeduction(primaryPremise.truth);
        if (!truth) {
            return [];
        }

        const derive = (sub, pred) => {
            const task = this.createDerivedTask(
                termFactory.inheritance(sub, pred),
                truth, [primaryPremise], context
            );
            if (task) {
                results.push(task);
            }
        };

        const {subject: s, predicate: p} = term;

        if (s.isCompound && (s.operator === '|' || s.operator === '||')) {
            s.components.forEach(comp => derive(comp, p));
        }

        if (p.isCompound && (p.operator === '&' || p.operator === '&&')) {
            p.components.forEach(comp => derive(s, comp));
        }

        return results;
    }
}
