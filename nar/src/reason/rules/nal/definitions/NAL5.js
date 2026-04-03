/**
 * NAL5.js
 *
 * NAL-5: Statement Rules
 * Includes Implication, Equivalence, Negation
 */

import {Truth} from '../../../../Truth.js';

export const NAL5 = [
    // Implication: (S ==> P)
    // Deduction: (M ==> P) & (S ==> M) |- (S ==> P)
    {
        id: 'implication_deduction',
        pattern: {
            p: {operator: '==>', subject: '$M', predicate: '$P'},
            s: {operator: '==>', subject: '$S', predicate: '$M'}
        },
        conclusion: (bindings, p, s, {termFactory}) => {
            const S = bindings['?$S'];
            const P = bindings['?$P'];

            const term = termFactory.implication(S, P);
            const truth = Truth.deduction(p.truth, s.truth);

            return {term, truth, punctuation: '.'};
        }
    },

    // Equivalence: (S <=> P)
    // Analogy: (S <=> M) & (M <=> P) |- (S <=> P)
    {
        id: 'equivalence_analogy',
        pattern: {
            p: {operator: '<=>', subject: '$S', predicate: '$M'},
            s: {operator: '<=>', subject: '$M', predicate: '$P'}
        },
        conclusion: (bindings, p, s, {termFactory}) => {
            const S = bindings['?$S'];
            const P = bindings['?$P'];

            const term = termFactory.equivalence(S, P);
            const truth = Truth.analogy(p.truth, s.truth);

            return {term, truth, punctuation: '.'};
        }
    },

    // Conditional Deduction (Modus Ponens is separate, but similar)
    // (S ==> P) & S |- P
    {
        id: 'conditional_deduction',
        pattern: {
            p: {operator: '==>', subject: '$S', predicate: '$P'},
            s: '$S' // S (any term that matches $S)
        },
        conclusion: (bindings, p, s, {termFactory, unifier}) => {
            // Special case: s is just $S.
            // But our pattern matcher expects structure.
            // If s is atomic, pattern needs to match it.
            // This is tricky with the current simple pattern structure if we want to say "s IS $S".

            // Workaround: Use a check in the conclusion or a more flexible pattern?
            // Or rely on the fact that if p is (S ==> P), we want to match s=S.
            // We can define s pattern as just a variable $S?
            // But our compiler expects operator/components.

            // For now, let's assume we handle this via the existing ModusPonensRule imperative rule,
            // or we enhance the compiler to handle "Any Term" patterns.
            return null;
        }
    }
];
