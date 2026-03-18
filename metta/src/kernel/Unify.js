/**
 * Unify.js - Pattern Matching & Unification
 * Adapter for Core Unification Logic
 * With Tier 1 Performance Optimization: Fast-Path Type Guards
 * And Cycle Detection in Substitution
 */

// Local imports
import { isVariable, isExpression, isList, flattenList, constructList, exp } from './Term.js';
import { getTypeTag, TYPE_SYMBOL, TYPE_VARIABLE, TYPE_EXPRESSION, isSymbol as fastIsSymbol } from './FastPaths.js';
import { configManager } from '../config/config.js';

// External imports
import * as UnifyCore from '../../../core/src/term/UnifyCore.js';

// Lazy SMT bridge initialization
let _smtBridge = null;
function getSMTBridge() {
  if (!_smtBridge && configManager.get('smt')) {
    const { SMTBridge } = require('../extensions/SMTOps.js');
    _smtBridge = new SMTBridge();
  }
  return _smtBridge;
}

/**
 * Safely substitute variables in a term with their bindings
 * Iterative implementation to prevent stack overflow on deep structures
 * @param {Atom} rootTerm The term to substitute into
 * @param {Object} bindings Map of variable names to values
 * @param {Set} rootVisited Set of visited variables to detect cycles
 * @param {boolean} recursive Whether to recursively substitute values from bindings (default: true)
 */
const safeSubstitute = (rootTerm, bindings, rootVisited = new Set(), recursive = true) => {
    // 1. Initial Check
    if (!rootTerm) return rootTerm;
    if (!bindings || Object.keys(bindings).length === 0) return rootTerm;

    // 2. Setup Stack for Iterative Processing
    // Commands: PROCESS (visit node), CONSTRUCT_EXPR (build expression), CONSTRUCT_LIST (build list)
    const stack = [];
    stack.push({ type: 'PROCESS', term: rootTerm, visited: rootVisited });

    const resultStack = []; // Stores processed terms

    while (stack.length > 0) {
        const cmd = stack.pop();

        if (cmd.type === 'PROCESS') {
            const { term, visited } = cmd;

            if (!term) {
                resultStack.push(term);
                continue;
            }

            if (isVariable(term)) {
                const name = term.name;
                const val = bindings[name];

                // Check if variable is bound and not to itself
                if (val !== undefined && val !== term) {
                     // Stop recursion if disabled or cycle detected
                     if (!recursive || visited.has(name)) {
                         resultStack.push(val);
                     } else {
                         // Recurse on value (push new PROCESS frame)
                         // Cycle detection: add current var to visited
                         const newVisited = new Set(visited);
                         newVisited.add(name);
                         stack.push({ type: 'PROCESS', term: val, visited: newVisited });
                     }
                } else {
                    // Not bound or self-bound
                    resultStack.push(term);
                }
                continue;
            }

            if (isExpression(term)) {
                if (isList(term)) {
                    // Handle lists: flatten -> process elements -> construct
                    const { elements, tail } = flattenList(term);

                    // Push CONSTRUCT command first (executed last)
                    stack.push({
                        type: 'CONSTRUCT_LIST',
                        elemCount: elements.length,
                        hasTail: !!tail,
                        // Optimizing identity check would require storing original components
                        // For lists, we'll rely on constructList's efficiency or structural eq later if needed
                        original: term
                    });

                    // Push tail processing (if exists)
                    if (tail) {
                        stack.push({ type: 'PROCESS', term: tail, visited: new Set(visited) });
                    }

                    // Push elements in reverse order so they are processed first-to-last
                    // (Stack LIFO: push C, push B, push A -> pop A, pop B, pop C)
                    for (let i = elements.length - 1; i >= 0; i--) {
                         stack.push({ type: 'PROCESS', term: elements[i], visited: new Set(visited) });
                    }
                    continue;
                }

                // Generic Expression
                const op = term.operator;
                const comps = term.components;

                stack.push({
                    type: 'CONSTRUCT_EXPR',
                    original: term,
                    compCount: comps.length,
                    opIsObj: typeof op === 'object'
                });

                // Process components (reverse order)
                for (let i = comps.length - 1; i >= 0; i--) {
                     stack.push({ type: 'PROCESS', term: comps[i], visited: new Set(visited) });
                }

                // Process operator if it's an object (first to be popped/processed)
                if (typeof op === 'object') {
                    stack.push({ type: 'PROCESS', term: op, visited });
                }
                continue;
            }

            // Atomic / Symbol
            resultStack.push(term);
            continue;
        }

        if (cmd.type === 'CONSTRUCT_EXPR') {
            const { original, compCount, opIsObj } = cmd;

            // Pop components + op from resultStack
            const totalToPop = compCount + (opIsObj ? 1 : 0);
            // Splice removes from end, returns array [op, c1, c2...]
            const items = resultStack.splice(resultStack.length - totalToPop, totalToPop);

            let newOp = original.operator;

            if (opIsObj) {
                newOp = items[0];
                items.shift();
            }

            // items now contains components [c1, c2, ...]

            // Check for identity to avoid allocation
            const changed = (newOp !== original.operator) ||
                            items.some((c, i) => c !== original.components[i]);

            if (changed) {
                resultStack.push(exp(newOp, items));
            } else {
                resultStack.push(original);
            }
            continue;
        }

        if (cmd.type === 'CONSTRUCT_LIST') {
             const { elemCount, hasTail, original } = cmd;

             const totalToPop = elemCount + (hasTail ? 1 : 0);
             const items = resultStack.splice(resultStack.length - totalToPop, totalToPop);

             let newTail = hasTail ? items.pop() : undefined;
             const newElements = items;

             // Check for identity
             // Flatten original again to check identity is expensive but safeSubstitute did it implicitly via recursion return checks
             const { elements: origElements, tail: origTail } = flattenList(original);
             const changed = (newTail !== origTail) ||
                             newElements.length !== origElements.length ||
                             newElements.some((e, i) => e !== origElements[i]);

             if (changed) {
                 resultStack.push(constructList(newElements, newTail));
             } else {
                 resultStack.push(original);
             }
             continue;
        }
    }

    return resultStack[0];
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
    if (configManager.get('fastPaths')) {
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

    const result = UnifyCore.unify(t1, t2, binds, mettaAdapter);

    // MORK Phase 3-B Integration point
    if (!result && configManager.get('smt')) {
        const bridge = getSMTBridge();
        if (bridge && bridge.canSolve(binds)) {
            // Unification failed structurally, but maybe SMT can resolve constraints
            const smtResult = bridge.solve([t1, t2]);
            if (smtResult) return smtResult;
        }
    }

    return result;
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
