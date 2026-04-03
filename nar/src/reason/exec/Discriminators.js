/**
 * Discriminators.js
 *
 * Defines the logic for extracting values from patterns and terms
 * to build and traverse the decision tree.
 */

import {getComponents, getOperator} from '../../term/TermUtils.js';

/**
 * @typedef {Object} Discriminator
 * @property {string} name - Human-readable name (e.g., 'Op(p)')
 * @property {function(Object, Object): string|number} getPatternValue - Extracts value from rule pattern (p, s)
 * @property {function(Term, Term): string|number} getInstanceValue - Extracts value from runtime terms (p, s)
 */

export const Discriminators = {
    /**
     * Creates a discriminator for the operator of the target term (p or s).
     * @param {'p'|'s'} target
     * @returns {Discriminator}
     */
    operator: (target) => ({
        name: `Op(${target})`,
        getPatternValue: (pPattern, sPattern) => {
            const pattern = target === 'p' ? pPattern : sPattern;
            return pattern.operator || '*';
        },
        getInstanceValue: (pTerm, sTerm) => {
            const term = target === 'p' ? pTerm : sTerm;
            return getOperator(term) || null;
        }
    }),

    /**
     * Creates a discriminator for the arity (component count) of the target term.
     * @param {'p'|'s'} target
     * @returns {Discriminator}
     */
    arity: (target) => ({
        name: `Arity(${target})`,
        getPatternValue: (pPattern, sPattern) => {
            const pattern = target === 'p' ? pPattern : sPattern;
            // If components are defined, use length. If not (variable), use wildcard.
            return pattern.components ? pattern.components.length : '*';
        },
        getInstanceValue: (pTerm, sTerm) => {
            const term = target === 'p' ? pTerm : sTerm;
            return getComponents(term).length;
        }
    })
};

// Standard set of discriminators used in NAL
export const StandardDiscriminators = [
    Discriminators.operator('p'),
    Discriminators.operator('s'),
    Discriminators.arity('p'),
    Discriminators.arity('s')
];
