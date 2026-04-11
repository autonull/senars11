/**
 * UnifyCore.js - Shared unification algorithm
 * Core unification with occurs check, used by both MeTTa kernel and core strategies
 * Following AGENTS.md: Elegant, Consolidated, Consistent, Organized, Deeply deduplicated
 */

/**
 * Maximum recursion depth for unification to prevent stack overflow
 * @constant {number}
 */
const MAX_UNIFICATION_DEPTH = 2000;

/**
 * Core unification algorithm
 * @param {*} t1 - First term
 * @param {*} t2 - Second term
 * @param {Object} bindings - Current variable bindings
 * @param {Object} adapter - Adapter for term operations
 * @param {number} depth - Recursion depth
 * @returns {Object|null} - Updated bindings or null if unification fails
 */
export const unify = (t1, t2, bindings = {}, adapter, depth = 0) => {
    if (depth > MAX_UNIFICATION_DEPTH) {
        return null;
    } // Prevent stack overflow by failing unification on deep recursion

    const b1 = adapter.substitute(t1, bindings);
    const b2 = adapter.substitute(t2, bindings);

    if (adapter.equals(b1, b2)) {
        return bindings;
    }
    if (adapter.isVariable(b1)) {
        return bindVariable(b1, b2, bindings, adapter);
    }
    if (adapter.isVariable(b2)) {
        return bindVariable(b2, b1, bindings, adapter);
    }

    // Allow adapter to intercept compound unification (e.g. cons-list vs expression-form list)
    if (adapter.preUnify) {
        const pre = adapter.preUnify(b1, b2, bindings);
        if (pre !== undefined) return pre;
    }

    if (adapter.isCompound(b1) && adapter.isCompound(b2)) {
        return unifyCompounds(b1, b2, bindings, adapter, depth);
    }

    return null;
};

/**
 * Unify two compound terms
 */
const unifyCompounds = (t1, t2, bindings, adapter, depth) => {
    const comps1 = adapter.getComponents(t1);
    const comps2 = adapter.getComponents(t2);

    if (comps1.length !== comps2.length) {
        return null;
    }

    const op1 = adapter.getOperator(t1);
    const op2 = adapter.getOperator(t2);

    // Unify operators instead of identity check to support variable operators
    // (e.g., in lambda patterns like ((λ $x $x) 5) where operator is an expression)
    const opResult = unify(op1, op2, bindings, adapter, depth + 1);
    if (!opResult) {
        return null;
    }

    return comps1.reduce((current, comp1, i) => {
        return current ? unify(comp1, comps2[i], current, adapter, depth + 1) : null;
    }, opResult);
};

/**
 * Bind a variable to a term with occurs check
 */
const bindVariable = (variable, term, bindings, adapter) => {
    const varName = adapter.getVariableName(variable);

    // Note: The variable (b1/b2) passed here is already substituted by `unify`.
    // So if it's still a variable, it means it's unbound in the current bindings.
    // Redundant checks removed.

    if (occursCheck(varName, term, bindings, adapter)) {
        return null;
    }

    return {...bindings, [varName]: term};
};

/**
 * Occurs check: prevent infinite structures
 * Iterative implementation to avoid stack overflow
 */
const occursCheck = (varName, term, bindings, adapter) => {
    const root = adapter.substitute(term, bindings);
    const stack = [root];

    while (stack.length > 0) {
        const curr = stack.pop();

        if (adapter.isVariable(curr)) {
            if (adapter.getVariableName(curr) === varName) {
                return true;
            }
        } else if (adapter.isCompound(curr)) {
            const comps = adapter.getComponents(curr);
            // Push in reverse order to process first component first (DFS)
            for (let i = comps.length - 1; i >= 0; i--) {
                stack.push(comps[i]);
            }
        }
    }

    return false;
};

/**
 * Apply substitution to a term
 * @param {*} term - Term to substitute into
 * @param {Object} bindings - Variable bindings
 * @param {Object} adapter - Term operations adapter
 * @param {Set} visited - Set of visited variables for cycle detection
 * @returns {*} - Substituted term
 */
export const substitute = (term, bindings, adapter, visited = new Set()) => {
    if (!term) {
        return term;
    }

    if (adapter.isVariable(term)) {
        const varName = adapter.getVariableName(term);
        if (bindings[varName]) {
            if (visited.has(varName)) {
                return term;
            } // Cycle detected
            visited.add(varName);
            return substitute(bindings[varName], bindings, adapter, visited);
        }
        return term;
    }

    if (adapter.isCompound(term)) {
        const components = adapter.getComponents(term);
        let changed = false;
        const newComponents = components.map(comp => {
            const newComp = substitute(comp, bindings, adapter, new Set(visited));
            if (newComp !== comp) {
                changed = true;
            }
            return newComp;
        });

        if (changed) {
            return adapter.reconstruct(term, newComponents);
        }
    }

    return term;
};

/**
 * Match pattern against term (one-way unification)
 * Variables in pattern can bind, but variables in term are treated as constants
 */
export const match = (pattern, term, bindings = {}, adapter) => {
    const p = adapter.substitute(pattern, bindings);

    if (adapter.isVariable(p)) {
        return bindVariable(p, term, bindings, adapter);
    }

    if (adapter.isCompound(p) && adapter.isCompound(term)) {
        if (adapter.getOperator(p) !== adapter.getOperator(term)) {
            return null;
        }

        const pComps = adapter.getComponents(p);
        const tComps = adapter.getComponents(term);
        if (pComps.length !== tComps.length) {
            return null;
        }

        return pComps.reduce((current, pComp, i) => {
            return current ? match(pComp, tComps[i], current, adapter) : null;
        }, bindings);
    }

    return adapter.equals(p, term) ? bindings : null;
};
