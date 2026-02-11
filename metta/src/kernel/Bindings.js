/**
 * Bindings.js - Utilities for converting between binding objects and binding atoms
 * Following AGENTS.md: Elegant, Consolidated, Consistent, Organized, Deeply deduplicated
 */

import { Term } from './Term.js';

/**
 * Convert a binding object to a binding atom
 */
export const objToBindingsAtom = (bindings = {}) =>
    Term.exp('Bindings', Object.entries(bindings).map(([k, v]) => Term.exp('Pair', [Term.var(k), v])));

/**
 * Convert a binding atom to a binding object
 */
export const bindingsAtomToObj = (bindingsAtom) => {
    if (bindingsAtom?.operator?.name !== 'Bindings') return {};

    return (bindingsAtom.components || []).reduce((bindings, pair) => {
        if (pair?.operator?.name === 'Pair' && pair.components?.length === 2 && pair.components[0]?.name) {
            bindings[pair.components[0].name] = pair.components[1];
        }
        return bindings;
    }, {});
};
