/**
 * Unify.js - Pattern Matching & Unification
 * Adapter for Core Unification Logic
 * With Tier 1 Performance Optimization: Fast-Path Type Guards
 * And Cycle Detection in Substitution
 */

// Local imports
import { isVariable, isExpression, isList, flattenList, constructList, exp } from './Term.js';
import { getTypeTag, TYPE_SYMBOL, TYPE_VARIABLE, TYPE_EXPRESSION, isSymbol as fastIsSymbol } from './FastPaths.js';
import { METTA_CONFIG } from '../config.js';

// External imports
import * as UnifyCore from '../../../core/src/term/UnifyCore.js';

/**
 * Safely substitute variables in a term with their bindings
 * Includes cycle detection to prevent stack overflow
 * @param {Atom} term The term to substitute into
 * @param {Object} bindings Map of variable names to values
 * @param {Set} visited Set of visited variables to detect cycles
 * @param {boolean} recursive Whether to recursively substitute values from bindings (default: true)
 */
const safeSubstitute = (term, bindings, visited = new Set(), recursive = true) => {
    if (!term) return term;

    if (isVariable(term)) {
        const name = term.name;
        const val = bindings[name];

        // Prevent immediate self-reference and cycles
        if (val !== undefined && val !== term) {
             if (!recursive) return val;

             if (visited.has(name)) return val;

             const newVisited = new Set(visited);
             newVisited.add(name);
             return safeSubstitute(val, bindings, newVisited, recursive);
        }
        return term;
    }

    if (isExpression(term)) {
        if (isList(term)) {
            return substituteInList(term, bindings, visited, recursive);
        }

        const op = typeof term.operator === 'object'
            ? safeSubstitute(term.operator, bindings, visited, recursive)
            : term.operator;

        const comps = term.components.map(c => safeSubstitute(c, bindings, new Set(visited), recursive));

        if (op === term.operator && comps.every((c, i) => c === term.components[i])) return term;
        return exp(op, comps);
    }

    return term;
};

/**
 * Helper function to substitute in list structures
 */
const substituteInList = (term, bindings, visited, recursive) => {
    const { elements, tail } = flattenList(term);
    const subEls = elements.map(e => safeSubstitute(e, bindings, new Set(visited), recursive));
    const subTail = safeSubstitute(tail, bindings, new Set(visited), recursive);
    if (subTail === tail && subEls.every((e, i) => e === elements[i])) return term;
    return constructList(subEls, subTail);
};

/**
 * Unify two list structures
 */
const unifyLists = (t1, t2, bindings) => {
    const f1 = flattenList(t1);
    const f2 = flattenList(t2);
    const minLen = Math.min(f1.elements.length, f2.elements.length);

    // Unify common elements
    let currBindings = bindings;
    for (let i = 0; i < minLen; i++) {
        currBindings = unifiedUnify(f1.elements[i], f2.elements[i], currBindings);
        if (!currBindings) return null;
    }

    // Handle remaining elements
    const t1Remainder = f1.elements.length > minLen
        ? constructList(f1.elements.slice(minLen), f1.tail)
        : f1.tail;
    const t2Remainder = f2.elements.length > minLen
        ? constructList(f2.elements.slice(minLen), f2.tail)
        : f2.tail;

    return unifiedUnify(t1Remainder, t2Remainder, currBindings);
};

/**
 * Metta-specific adapter for core unification logic
 */
const mettaAdapter = {
    isVariable,
    isCompound: isExpression,
    getVariableName: t => t.name,
    getOperator: t => t.operator?.name ? t.operator : t.operator,
    getComponents: t => t.components || [], // Structural: (; A B) -> (: A (: B ()))
    equals: (t1, t2) => t1 === t2 || (t1?.equals?.(t2) ?? false),
    substitute: (t, b, opts) => safeSubstitute(t, b, undefined, opts?.recursive),
    reconstruct: (t, comps) => {
        if (isList(t)) {
            const { tail } = flattenList(t);
            return constructList(comps, tail);
        }
        return exp(typeof t.operator === 'object' ? t.operator : t.operator, comps);
    }
};

/**
 * Unified function for unification to avoid circular reference
 */
const unifiedUnify = (t1, t2, binds = {}) => {
    // Fast path: symbol equality (80% of cases)
    if (METTA_CONFIG.fastPaths) {
        const tag1 = getTypeTag(t1);
        const tag2 = getTypeTag(t2);

        if (tag1 === TYPE_SYMBOL && tag2 === TYPE_SYMBOL) {
            return (t1 === t2 || t1.name === t2.name) ? binds : null;
        }
    } else {
        // Fallback to slower checks if optimization disabled
        if (fastIsSymbol(t1) && fastIsSymbol(t2)) {
            return (t1 === t2 || t1.name === t2.name) ? binds : null;
        }
    }

    // Fast path: lists
    if (isList(t1) && isList(t2)) {
        return unifyLists(t1, t2, binds);
    }

    return UnifyCore.unify(t1, t2, binds, mettaAdapter);
};

export const Unify = {
    /**
     * Unify two terms
     */
    unify: unifiedUnify,

    /**
     * Substitute variables in a term with their bindings
     */
    subst: (term, bindings, options) => safeSubstitute(term, bindings, undefined, options?.recursive),

    /**
     * Match a pattern against a term
     */
    match: (pat, term, binds = {}) => UnifyCore.match(pat, term, binds, mettaAdapter),

    /**
     * Match multiple patterns against multiple terms
     */
    matchAll: (pats, terms) => {
        const res = [];
        pats.forEach(p => terms.forEach(t => {
            const b = unifiedUnify(p, t);
            if (b) res.push({ pattern: p, term: t, bindings: b });
        }));
        return res;
    },

    /**
     * Check if a term is a variable
     */
    isVar: isVariable
};
