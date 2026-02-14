/**
 * Unify.js - Pattern matching with occurs check
 * Core unification algorithm for MeTTa
 */

import { isVariable, isExpression, isSymbol, clone, isList, flattenList, constructList } from './Term.js';

// Export an object with the expected API for tests
export const Unify = {
    unify: function(term1, term2, bindings = {}) {
        const resultBindings = {...bindings};
        const boundTerm1 = substitute(term1, resultBindings);
        const boundTerm2 = substitute(term2, resultBindings);

        if (boundTerm1.equals && boundTerm1.equals(boundTerm2)) return resultBindings;
        if (isVariable(boundTerm1)) return bindVariable(boundTerm1, boundTerm2, resultBindings);
        if (isVariable(boundTerm2)) return bindVariable(boundTerm2, boundTerm1, resultBindings);

        if (isExpression(boundTerm1) && isExpression(boundTerm2)) {
            let currentBindings = resultBindings;

            if (isList(boundTerm1) && isList(boundTerm2)) {
                const list1 = flattenList(boundTerm1);
                const list2 = flattenList(boundTerm2);
                const len = Math.min(list1.elements.length, list2.elements.length);
                for (let i = 0; i < len; i++) {
                    const unified = Unify.unify(list1.elements[i], list2.elements[i], currentBindings);
                    if (unified === null) return null;
                    currentBindings = unified;
                }
                let tail1 = list1.tail;
                let tail2 = list2.tail;
                if (list1.elements.length > len) tail1 = constructList(list1.elements.slice(len), list1.tail);
                if (list2.elements.length > len) tail2 = constructList(list2.elements.slice(len), list2.tail);
                return Unify.unify(tail1, tail2, currentBindings);
            }

            if (typeof boundTerm1.operator === 'object' || typeof boundTerm2.operator === 'object') {
                if (typeof boundTerm1.operator !== 'object' || typeof boundTerm2.operator !== 'object') return null;
                const opUnified = Unify.unify(boundTerm1.operator, boundTerm2.operator, currentBindings);
                if (opUnified === null) return null;
                currentBindings = opUnified;
            } else {
                if (boundTerm1.operator !== boundTerm2.operator) return null;
            }

            if (boundTerm1.components.length !== boundTerm2.components.length) return null;

            for (let i = 0; i < boundTerm1.components.length; i++) {
                const unified = Unify.unify(boundTerm1.components[i], boundTerm2.components[i], currentBindings);
                if (unified === null) return null;
                currentBindings = unified;
            }
            return currentBindings;
        }
        return null;
    },

    subst: substitute,
    isVar: isVariable,
    matchAll: function(patterns, terms) {
        const matches = [];
        for (const pattern of patterns) {
            for (const term of terms) {
                const bindings = Unify.unify(pattern, term);
                if (bindings !== null) matches.push({ pattern, term, bindings });
            }
        }
        return matches;
    }
};

function bindVariable(variable, term, bindings) {
    if (occursCheck(variable, term, bindings)) return null;
    const newBindings = {...bindings};
    newBindings[variable.name] = term;
    return newBindings;
}

function occursCheck(variable, term, bindings) {
    const boundTerm = substitute(term, bindings);
    if (isVariable(boundTerm) && boundTerm.name === variable.name) return true;
    if (isExpression(boundTerm)) {
        const stack = [boundTerm];
        while (stack.length > 0) {
            const t = stack.pop();
            if (isVariable(t) && t.name === variable.name) return true;
            if (isExpression(t)) {
                if (isList(t)) {
                    const { elements, tail } = flattenList(t);
                    for (const el of elements) stack.push(el);
                    stack.push(tail);
                } else {
                    for (const comp of t.components) stack.push(comp);
                }
            }
        }
    }
    return false;
}

function substitute(term, bindings) {
    if (!term) return term;

    if (isVariable(term)) {
        if (bindings.hasOwnProperty(term.name)) {
            let value = bindings[term.name];
            while (isVariable(value) && bindings.hasOwnProperty(value.name)) {
                value = bindings[value.name];
                if (value === term) break;
            }
            return value;
        }
        return term;
    }

    if (isExpression(term)) {
        if (isList(term)) {
            const { elements, tail } = flattenList(term);
            const substElements = elements.map(e => substitute(e, bindings));
            const substTail = substitute(tail, bindings);
            let changed = false;
            if (substTail !== tail) changed = true;
            else {
                for (let i = 0; i < elements.length; i++) {
                    if (substElements[i] !== elements[i]) {
                        changed = true;
                        break;
                    }
                }
            }
            if (!changed) return term;
            return constructList(substElements, substTail);
        }

        const substitutedComponents = term.components.map(comp => substitute(comp, bindings));
        let substitutedOperator = term.operator;
        let operatorChanged = false;
        if (typeof term.operator === 'object' && term.operator !== null) {
            substitutedOperator = substitute(term.operator, bindings);
            if (substitutedOperator !== term.operator) operatorChanged = true;
        }

        let componentsChanged = false;
        for (let i = 0; i < term.components.length; i++) {
            if (substitutedComponents[i] !== term.components[i]) {
                componentsChanged = true;
                break;
            }
        }

        if (!componentsChanged && !operatorChanged) return term;

        const opString = typeof substitutedOperator === 'string' ? substitutedOperator : (substitutedOperator.toString ? substitutedOperator.toString() : String(substitutedOperator));
        return {
            ...term,
            operator: substitutedOperator,
            components: substitutedComponents,
            name: `(${opString}, ${substitutedComponents.map(c => c.name || c).join(', ')})`,
            equals: term.equals
        };
    }
    return term;
}
