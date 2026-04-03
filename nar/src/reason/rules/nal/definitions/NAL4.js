/**
 * NAL4.js
 *
 * NAL-4: Transformation Rules
 * Includes Intersection, Union, Difference, Product, Image
 */

import {Truth} from '../../../../Truth.js';

export const NAL4 = [
    // Intersection: (S --> M) & (P --> M) |- ((S|P) --> M)
    // Actually, Intersection/Union usually happen with shared subject or predicate.
    // (M --> T) & (M --> P) |- (M --> (T & P)) [Intersection]
    // (M --> T) & (M --> P) |- (M --> (T | P)) [Union]

    // Let's define Intersection (Int)
    {
        id: 'intersection_composition',
        pattern: {
            p: {operator: '-->', subject: '$M', predicate: '$T'},
            s: {operator: '-->', subject: '$M', predicate: '$P'}
        },
        conclusion: (bindings, p, s, {termFactory}) => {
            const T = bindings['?$T'];
            const P = bindings['?$P'];
            const M = bindings['?$M'];

            // (M --> (T & P))
            const compound = termFactory.conjunction(T, P); // &
            const term = termFactory.inheritance(M, compound);
            const truth = Truth.intersection(p.truth, s.truth);

            return {term, truth, punctuation: '.'};
        }
    },

    // Union (Ext)
    {
        id: 'union_composition',
        pattern: {
            p: {operator: '-->', subject: '$T', predicate: '$M'},
            s: {operator: '-->', subject: '$P', predicate: '$M'}
        },
        conclusion: (bindings, p, s, {termFactory}) => {
            const T = bindings['?$T'];
            const P = bindings['?$P'];
            const M = bindings['?$M'];

            // Union (Extension): (T --> M) & (P --> M) |- ((T | P) --> M)
            const compound = termFactory.disjunction(T, P); // |
            const term = termFactory.inheritance(compound, M);
            const truth = Truth.union(p.truth, s.truth);

            return {term, truth, punctuation: '.'};
        }
    },

    // Difference
    {
        id: 'difference',
        pattern: {
            p: {operator: '-->', subject: '$M', predicate: '$T'},
            s: {operator: '-->', subject: '$M', predicate: '$P'}
        },
        conclusion: (bindings, p, s, {termFactory}) => {
            const T = bindings['?$T'];
            const P = bindings['?$P'];
            const M = bindings['?$M'];

            // (M --> (T - P))
            const compound = termFactory.difference(T, P); // <~>
            const term = termFactory.inheritance(M, compound);
            const truth = Truth.diff(p.truth, s.truth);

            return {term, truth, punctuation: '.'};
        }
    }
];
