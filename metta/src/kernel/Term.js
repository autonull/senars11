/**
 * Term.js - Optimized MeTTa atoms with Tier 1 performance enhancements
 */

import { intern, symbolEq as internSymbolEq } from './Interning.js';
import { TYPE_SYMBOL, TYPE_VARIABLE, TYPE_EXPRESSION, TYPE_GROUNDED, isVariableName } from './FastPaths.js';
import { METTA_CONFIG } from '../config.js';
import { SymbolAtom, VariableAtom, GroundedAtom, ExpressionAtom } from './AtomTypes.js';

export { SymbolAtom, VariableAtom, GroundedAtom, ExpressionAtom };

// Export symbolEq for benchmarks/tests
export const symbolEq = internSymbolEq;

const expCache = new Map();
const varCache = new Map();

export const sym = (name) => {
    if (METTA_CONFIG.interning) return intern(name);
    return new SymbolAtom(name);
};

export const variable = (name) => {
    // Correct normalization: remove leading ? or $, then prefix with $
    const n = name.replace(/^[\?$]/, '');
    const fullName = `$${n}`;

    if (varCache.has(fullName)) return varCache.get(fullName);

    const atom = new VariableAtom(fullName);
    varCache.set(fullName, atom);
    return atom;
};

export const grounded = (value) => {
    let name;
    try {
        name = String(value);
    } catch (e) {
        try {
            name = Object.prototype.toString.call(value);
        } catch (e2) {
            name = `(grounded ${typeof value})`;
        }
    }

    return new GroundedAtom(value, name);
};

export const exp = (operator, components) => {
    if (!operator || !Array.isArray(components)) throw new Error('Invalid expression args');

    // Validation: ensure no components are undefined/null
    for (let i = 0; i < components.length; i++) {
        if (!components[i]) {
            throw new Error(`Invalid component at index ${i} in expression: ${operator.toString?.() || operator}`);
        }
    }

    const op = typeof operator === 'string' ? sym(operator) : operator;
    const key = `${op.toString()},${components.map(c => c.toString()).join(',')}`;

    if (expCache.has(key)) return expCache.get(key);

    if (expCache.size > METTA_CONFIG.maxCacheSize) expCache.clear();

    const name = `(${op.toString()}${components.length ? ' ' + components.map(c => c.name || c).join(' ') : ''})`;

    const atom = new ExpressionAtom(name, op, components);

    expCache.set(key, atom);
    return atom;
};

export const equals = (a, b) => {
    if (a === b && a !== null) return true;
    if (!a || !b) return false;
    if (a._typeTag === TYPE_SYMBOL && b._typeTag === TYPE_SYMBOL) return symbolEq(a, b);
    return a.equals?.(b) ?? false;
};

export const clone = (atom) => {
    if (!atom) return atom;
    if (atom.type === 'atom') return atom.operator === null ? sym(atom.name) : variable(atom.name);
    if (atom.type === 'grounded') return grounded(atom.value);
    return exp(atom.operator, atom.components.map(clone));
};

export const isVariable = (a) => a?._typeTag === TYPE_VARIABLE || (a?.type === 'atom' && isVariableName(a.name));
export const isSymbol = (a) => a?._typeTag === TYPE_SYMBOL || (a?.type === 'atom' && !a.operator && !isVariableName(a.name));
export const isExpression = (a) => a?._typeTag === TYPE_EXPRESSION || a?.type === 'compound';
export const isGrounded = (a) => a?._typeTag === TYPE_GROUNDED || a?.type === 'grounded';
export const isList = (a) => isExpression(a) && a.operator?.name === ':' && a.components?.length === 2;

export const flattenList = (list) => {
    const elements = [];
    let curr = list;
    while (isList(curr)) {
        elements.push(curr.components[0]);
        curr = curr.components[1];
    }
    return { elements, tail: curr };
};

export const constructList = (elements, tail = sym('()')) => {
    let res = tail;
    for (let i = elements.length - 1; i >= 0; i--) {
        res = exp(sym(':'), [elements[i], res]);
    }
    return res;
};

export const var_ = variable;

export const Term = {
    sym,
    var: variable,
    var_: variable,
    grounded,
    exp,
    equals,
    clone,
    isVar: isVariable,
    isSymbol,
    isExpression,
    isGrounded,
    isList,
    flattenList,
    constructList,
    clearSymbolTable: () => {
        expCache.clear();
        varCache.clear();
    }
};
