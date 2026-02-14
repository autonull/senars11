/**
 * Term.js - Interned atoms with structural equality
 * Core data structures for MeTTa expressions
 */

// Symbol interning cache
const symbolCache = new Map();

// Variable interning cache
const variableCache = new Map();

// Expression interning cache
const expressionCache = new Map();

/**
 * Create an interned symbol atom
 * @param {string} name - Symbol name
 * @returns {Object} Interned symbol atom
 */
export function sym(name) {
    if (symbolCache.has(name)) {
        return symbolCache.get(name);
    }

    const atom = {
        type: 'atom',  // Changed to match test expectations
        name: name,
        operator: null,
        components: [],
        toString: () => name,
        equals: (other) => other && other.type === 'atom' && other.name === name
    };

    symbolCache.set(name, atom);
    return atom;
}

/**
 * Create an interned variable atom
 * @param {string} name - Variable name (with or without $ prefix)
 * @returns {Object} Interned variable atom
 */
export function var_(name) {
    // Remove $ prefix if present for internal storage
    const cleanName = name.startsWith('$') ? name.substring(1) : name;
    const fullName = `$${cleanName}`;

    if (variableCache.has(fullName)) {
        return variableCache.get(fullName);
    }

    const atom = {
        type: 'atom',  // Changed to match test expectations
        name: fullName,
        operator: null,
        components: [],
        toString: () => fullName,
        equals: (other) => other && other.type === 'atom' && other.name === fullName
    };

    variableCache.set(fullName, atom);
    return atom;
}

/**
 * Create an interned expression atom
 * @param {Object|string} operator - Operator atom or string name
 * @param {Array} components - Expression components
 * @returns {Object} Interned expression atom
 */
export function exp(operator, components) {
    // Validate inputs
    if (!operator) {
        throw new Error('Operator must be defined');
    }
    if (!Array.isArray(components)) {
        throw new Error('Components must be an array');
    }

    // Normalize operator to atom if it's a string
    if (typeof operator === 'string') {
        operator = sym(operator);
    }

    const opString = typeof operator === 'string' ? operator : (operator.toString ? operator.toString() : String(operator));

    // Create a unique key for the expression
    const key = `${opString},${components.map(c => c.toString ? c.toString() : c).join(',')}`;

    if (expressionCache.has(key)) {
        return expressionCache.get(key);
    }

    // Create canonical name
    const canonicalName = `(${opString}, ${components.map(c => c.name || c).join(', ')})`;

    const atom = {
        type: 'compound',
        name: canonicalName,
        operator: operator,
        components: Object.freeze([...components]),
        toString: () => canonicalName,
        equals: function(other) {
            if (!other || other.type !== 'compound' || other.components.length !== this.components.length) {
                return false;
            }

            // Check operator equality
            let match = false;
            if (typeof this.operator === 'string' && typeof other.operator === 'string') {
                if (this.operator === other.operator) match = true;
            } else if (this.operator && this.operator.equals && other.operator && other.operator.equals) {
                if (this.operator.equals(other.operator)) match = true;
            } else if (this.operator && this.operator.name && typeof other.operator === 'string') {
                if (this.operator.name === other.operator) match = true;
            } else if (typeof this.operator === 'string' && other.operator && other.operator.name) {
                if (this.operator === other.operator.name) match = true;
            } else if (this.operator === other.operator) {
                match = true;
            }

            if (!match) return false;

            for (let i = 0; i < this.components.length; i++) {
                if (!this.components[i].equals(other.components[i])) {
                    return false;
                }
            }

            return true;
        }
    };

    expressionCache.set(key, atom);
    return atom;
}

/**
 * Structural equality check for any atom
 * @param {Object} a - First atom
 * @param {Object} b - Second atom
 * @returns {boolean} True if atoms are structurally equal
 */
export function equals(a, b) {
    if (a == null && b == null) return false;  // Special case: null equals null is false
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.equals) return a.equals(b);
    return false;
}

/**
 * Deep clone an atom (for substitution operations)
 * @param {Object} atom - Atom to clone
 * @returns {Object} Cloned atom
 */
export function clone(atom) {
    if (!atom) return atom;

    switch (atom.type) {
        case 'atom':
            if (atom.operator === null) {
                // This is a symbol
                return sym(atom.name);
            } else {
                // This is a variable
                return var_(atom.name);
            }
        case 'compound':
            return exp(atom.operator, atom.components.map(clone));
        default:
            return atom;
    }
}

/**
 * Check if atom is a variable
 * @param {Object} atom - Atom to check
 * @returns {boolean} True if atom is a variable
 */
export function isVariable(atom) {
    if (!atom) return false;  // Handle null input
    return atom.type === 'atom' && atom.name && typeof atom.name === 'string' && atom.name.startsWith('$');
}

/**
 * Check if atom is a symbol
 * @param {Object} atom - Atom to check
 * @returns {boolean} True if atom is a symbol
 */
export function isSymbol(atom) {
    return atom && atom.type === 'atom' && atom.operator === null && atom.name && typeof atom.name === 'string' && !atom.name.startsWith('$');
}

/**
 * Check if atom is an expression
 * @param {Object} atom - Atom to check
 * @returns {boolean} True if atom is an expression
 */
export function isExpression(atom) {
    return atom && atom.type === 'compound';
}

// === List Optimization Utilities ===

/**
 * Check if atom is a List (Cons) expression (: head tail)
 */
export function isList(atom) {
    if (!isExpression(atom)) return false;
    // Check operator ':'
    return atom.operator && atom.operator.name === ':' && atom.components.length === 2;
}

/**
 * Flatten a Cons list into an array of elements + tail
 * @param {Object} list - The list atom
 * @returns {Object} { elements: Array, tail: Atom }
 */
export function flattenList(list) {
    const elements = [];
    let curr = list;
    while (isList(curr)) {
        elements.push(curr.components[0]);
        curr = curr.components[1];
    }
    return { elements, tail: curr };
}

/**
 * Reconstruct a Cons list from elements and tail
 * @param {Array} elements - Array of atoms
 * @param {Object} tail - Tail atom
 * @returns {Object} Cons list atom
 */
export function constructList(elements, tail) {
    let res = tail;
    for (let i = elements.length - 1; i >= 0; i--) {
        res = exp(sym(':'), [elements[i], res]);
    }
    return res;
}

// Export a Term object that matches the expected API in tests
export const Term = {
    sym: sym,
    var: var_,
    exp: exp,
    equals: equals,
    clone: clone,
    isVar: isVariable,
    isSymbol: isSymbol,
    isExpression: isExpression,

    // List utils
    isList,
    flattenList,
    constructList,

    // Additional helper for test compatibility
    clearSymbolTable: () => {
        symbolCache.clear();
        variableCache.clear();
        expressionCache.clear();
    }
};
