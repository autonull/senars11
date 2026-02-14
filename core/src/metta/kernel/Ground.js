/**
 * Ground.js - Native function registry
 * Registry for grounded operations in MeTTa
 */

export class Ground {
    constructor() {
        this.operations = new Map();
        this._registerCoreOperations();
    }

    /**
     * Register a grounded operation
     * @param {string} name - Operation name
     * @param {Function} fn - Function to execute
     * @returns {Ground} This instance for chaining
     */
    register(name, fn) {
        // Normalize name to include & prefix if not present
        const normalizedName = name.startsWith('&') ? name : `&${name}`;
        this.operations.set(normalizedName, fn);
        return this;
    }

    /**
     * Check if operation exists
     * @param {string} name - Operation name
     * @returns {boolean} True if operation exists
     */
    has(name) {
        // Normalize name to include & prefix if not present
        const normalizedName = name.startsWith('&') ? name : `&${name}`;
        return this.operations.has(normalizedName);
    }

    /**
     * Execute a grounded operation
     * @param {string} name - Operation name
     * @param {...*} args - Arguments to pass to operation
     * @returns {*} Result of operation execution
     */
    execute(name, ...args) {
        // Normalize name to include & prefix if not present
        const normalizedName = name.startsWith('&') ? name : `&${name}`;

        if (!this.operations.has(normalizedName)) {
            throw new Error(`Operation ${name} not found`);
        }

        const op = this.operations.get(normalizedName);
        return op(...args);
    }

    /**
     * Get all registered operation names
     * @returns {Array} Array of operation names
     */
    getOperations() {
        return Array.from(this.operations.keys());
    }

    /**
     * Register core operations
     * @private
     */
    _registerCoreOperations() {
        // Arithmetic operations
        this.register('&+', (...args) => {
            if (args.length === 0) return createNumberAtom(0);
            if (args.length === 1) return args[0]; // Identity for single argument

            // For multiple arguments, sum them all
            let sum = 0;
            for (const arg of args) {
                const num = atomToNumber(arg);
                if (num === null) {
                    throw new Error(`Non-numeric input for +: ${args.map(a => a.name || a).join(', ')} (expected number)`);
                }
                sum += num;
            }
            return createNumberAtom(sum);
        });

        this.register('&-', (...args) => {
            if (args.length === 0) return createNumberAtom(0);
            if (args.length === 1) {
                // Unary minus: negate the single argument
                const num = atomToNumber(args[0]);
                if (num === null) {
                    throw new Error(`Invalid arguments for -: ${args.map(a => a.name || a).join(', ')}`);
                }
                return createNumberAtom(-num);
            }

            // Binary minus: subtract second from first
            if (args.length >= 2) {
                const numA = atomToNumber(args[0]);
                const numB = atomToNumber(args[1]);
                if (numA === null || numB === null) {
                    throw new Error(`Non-numeric input for -: ${args.map(a => a.name || a).join(', ')} (expected number)`);
                }
                return createNumberAtom(numA - numB);
            }

            throw new Error(`Non-numeric input for -: ${args.map(a => a.name || a).join(', ')}`);
        });

        this.register('&*', (...args) => {
            if (args.length === 0) return createNumberAtom(1);
            if (args.length === 1) return args[0]; // Identity for single argument

            // For multiple arguments, multiply them all
            let product = 1;
            for (const arg of args) {
                const num = atomToNumber(arg);
                if (num === null) {
                    throw new Error(`Non-numeric input for *: ${args.map(a => a.name || a).join(', ')} (expected number)`);
                }
                product *= num;
            }
            return createNumberAtom(product);
        });

        this.register('&/', (...args) => {
            if (args.length === 0) return createNumberAtom(1);
            if (args.length === 1) {
                // Unary division: 1 / arg
                const num = atomToNumber(args[0]);
                if (num === null || num === 0) {
                    throw new Error("Division by zero");
                }
                return createNumberAtom(1 / num);
            }

            // Binary division: divide first by second
            if (args.length >= 2) {
                const numA = atomToNumber(args[0]);
                const numB = atomToNumber(args[1]);
                if (numA === null || numB === null) {
                    throw new Error(`Non-numeric input for /: ${args.map(a => a.name || a).join(', ')} (expected number)`);
                }
                if (numB === 0) throw new Error("Division by zero");
                return createNumberAtom(numA / numB);
            }

            throw new Error(`Non-numeric input for /: ${args.map(a => a.name || a).join(', ')}`);
        });

        this.register('&%', (a, b) => {
            const numA = atomToNumber(a);
            const numB = atomToNumber(b);
            if (numA !== null && numB !== null) {
                 if (numB === 0) throw new Error("Modulo by zero");
                 return createNumberAtom(numA % numB);
            }
            throw new Error(`Non-numeric input for %: ${a.name || a}, ${b.name || b} (expected number)`);
        });

        // Comparison operations
        this.register('&==', (a, b) => {
            if (a && a.equals) return createBooleanAtom(a.equals(b));
            return createBooleanAtom(a === b);
        });

        this.register('&!=', (a, b) => {
            if (a && a.equals) return createBooleanAtom(!a.equals(b));
            return createBooleanAtom(a !== b);
        });

        this.register('&<', (a, b) => {
            const numA = atomToNumber(a);
            const numB = atomToNumber(b);
            if (numA !== null && numB !== null) {
                return createBooleanAtom(numA < numB);
            }
            throw new Error(`Non-numeric input for <: ${a.name || a}, ${b.name || b} (expected number)`);
        });

        this.register('&>', (a, b) => {
            const numA = atomToNumber(a);
            const numB = atomToNumber(b);
            if (numA !== null && numB !== null) {
                return createBooleanAtom(numA > numB);
            }
            throw new Error(`Non-numeric input for >: ${a.name || a}, ${b.name || b} (expected number)`);
        });

        this.register('&<=', (a, b) => {
            const numA = atomToNumber(a);
            const numB = atomToNumber(b);
            if (numA !== null && numB !== null) {
                return createBooleanAtom(numA <= numB);
            }
            throw new Error(`Non-numeric input for <=: ${a.name || a}, ${b.name || b} (expected number)`);
        });

        this.register('&>=', (a, b) => {
            const numA = atomToNumber(a);
            const numB = atomToNumber(b);
            if (numA !== null && numB !== null) {
                return createBooleanAtom(numA >= numB);
            }
            throw new Error(`Non-numeric input for >=: ${a.name || a}, ${b.name || b} (expected number)`);
        });

        // Logical operations
        this.register('&and', (...args) => {
            if (args.length === 0) return createBooleanAtom(true);
            for (const arg of args) {
                if (arg && (arg.type === 'symbol' || arg.type === 'atom') && arg.name === 'False') {
                    return createBooleanAtom(false);
                }
                if (!isTruthy(arg)) {
                    return createBooleanAtom(false);
                }
            }
            return createBooleanAtom(true);
        });

        this.register('&or', (...args) => {
            if (args.length === 0) return createBooleanAtom(false);
            for (const arg of args) {
                if (arg && (arg.type === 'symbol' || arg.type === 'atom') && arg.name === 'True') {
                    return createBooleanAtom(true);
                }
                if (isTruthy(arg)) {
                    return createBooleanAtom(true);
                }
            }
            return createBooleanAtom(false);
        });

        this.register('&not', (a) => {
            if (a && (a.type === 'symbol' || a.type === 'atom') && a.name === 'True') {
                return createBooleanAtom(false);
            } else if (a && (a.type === 'symbol' || a.type === 'atom') && a.name === 'False') {
                return createBooleanAtom(true);
            } else {
                return createBooleanAtom(!isTruthy(a));
            }
        });

        // List operations
        this.register('&first', (lst) => {
            if (Array.isArray(lst) && lst.length > 0) return lst[0];
            return null;
        });

        this.register('&rest', (lst) => {
            if (Array.isArray(lst) && lst.length > 0) return lst.slice(1);
            return [];
        });

        this.register('&empty?', (lst) => {
            let isEmpty = false;
            if (Array.isArray(lst)) {
                isEmpty = lst.length === 0;
            } else if (lst && lst.type === 'atom' && lst.name === '()') {
                isEmpty = true;
            } else if (lst && lst.type === 'symbol' && lst.name === '()') { // Legacy support
                isEmpty = true;
            }
            console.log("[DEBUG] &empty? called with:", lst ? lst.toString() : 'null', "Result:", isEmpty);
            return createBooleanAtom(isEmpty);
        });

        // String operations
        this.register('&str-concat', (a, b) => String(a) + String(b));
        this.register('&to-string', (a) => String(a));

        // I/O operations
        this.register('&print', (...args) => {
            const stringArgs = args.map(arg => arg && arg.name ? arg.name : String(arg));
            console.log(stringArgs.join(' '));
            return args.length === 1 ? args[0] : createSymbolAtom('Null');
        });

        this.register('&println', (...args) => {
            const stringArgs = args.map(arg => arg && arg.name ? arg.name : String(arg));
            console.log(stringArgs.join(' '));
            return null;
        });

        // Time operation
        this.register('&now', () => {
            return createNumberAtom(Date.now());
        });

        // Space operations
        this.register('&add-atom', (space, atom) => {
            if (space && typeof space.add === 'function') {
                space.add(atom);
                return atom;
            }
             // Fallback if space is not the first argument but maybe implied? No, explicit passing required.
             if (atom === undefined && space && space.type === 'atom') {
                 // Trying to add to implicit space? We don't have access to context here easily without binding.
                 // Assuming explicit (add-atom &self atom)
                 throw new Error("Missing space argument or invalid atom");
             }
            throw new Error("Invalid space object");
        });

        this.register('&rm-atom', (space, atom) => {
            if (space && typeof space.remove === 'function') {
                return space.remove(atom);
            }
            throw new Error("Invalid space object");
        });

        this.register('&get-atoms', (space) => {
            if (space && typeof space.all === 'function') {
                const atoms = space.all();
                // Convert JS array to MeTTa list (: h (: t ...))
                const listify = (arr) => {
                    if (arr.length === 0) return createSymbolAtom('()');
                    // We need to import exp/sym or create structure manually
                    // Since we can't import easily, we construct manually matching Term.exp
                    return {
                        type: 'compound',
                        name: `(: ${arr[0].name} ...)`, // Simplified name
                        operator: createSymbolAtom(':'),
                        components: [arr[0], listify(arr.slice(1))],
                        toString: () => `(: ${arr[0]} ${listify(arr.slice(1))})`,
                        equals: (other) => false // Simplified for now
                    };
                };
                return listify(atoms);
            }
            throw new Error("Invalid space object");
        });

        // Introspection Primitives (Phase 3)
        // Note: These usually require access to the concept registry or similar, which Ground.js doesn't have directly.
        // However, we can mock them or store them if they are just properties of atoms in this Space implementation.
        // Or we can register them as stubs that SeNARSBridge or MeTTaInterpreter overrides/populates.
        // For now, let's implement simple property storage on the atom objects themselves (if they are objects) or a side map.
        // Since atoms are often re-created, a side map (WeakMap) or similar is better, but atoms are value objects.
        // If we want system-wide STI, we need a registry.
        // For this "Minimal Kernel", let's use a static map for demonstration if no external registry is provided.
        const stiMap = new Map();

        this.register('&get-sti', (atom) => {
             const key = atom.toString();
             return createNumberAtom(stiMap.get(key) || 0);
        });

        this.register('&set-sti', (atom, value) => {
             const key = atom.toString();
             const num = atomToNumber(value);
             if (num !== null) {
                 stiMap.set(key, num);
                 return value;
             }
             return createNumberAtom(0);
        });

        this.register('&system-stats', () => {
             // Return some basic stats
             // In a real system this would query the memory/profiler
             return {
                 type: 'atom',
                 name: 'Stats',
                 toString: () => `(Stats :sti-count ${stiMap.size})`
             };
        });

        // Placeholders for advanced ops that should be overridden by Interpreter
        this.register('&subst', (term, bindings) => { throw new Error("&subst should be provided by Interpreter"); });
        this.register('&match', (space, pattern, template) => { throw new Error("&match should be provided by Interpreter"); });
        this.register('&type-of', (atom) => { throw new Error("&type-of should be provided by Interpreter"); });
    }

    /**
     * Get list of all registered operations
     * @returns {Array} Array of operation names
     */
    list() {
        return Array.from(this.operations.keys());
    }

    /**
     * Clear all operations
     */
    clear() {
        this.operations.clear();
    }
}

/**
 * Convert a MeTTa atom to a JavaScript number
 * @param {Object} atom - MeTTa atom
 * @returns {number|null} JavaScript number or null if conversion fails
 */
function atomToNumber(atom) {
    if (atom === null || atom === undefined) return null;
    if (typeof atom === 'number') return atom;
    if (atom.name) {
        const num = parseFloat(atom.name);
        return isNaN(num) ? null : num;
    }
    return null;
}

function createNumberAtom(num) {
    return {
        type: 'atom',
        name: String(num),
        operator: null,
        components: [],
        toString: () => String(num),
        equals: (other) => other && other.type === 'atom' && other.name === String(num)
    };
}

function createBooleanAtom(bool) {
    const name = bool ? 'True' : 'False';
    return {
        type: 'atom',
        name: name,
        operator: null,
        components: [],
        toString: () => name,
        equals: (other) => other && other.type === 'atom' && other.name === name
    };
}

function createSymbolAtom(str) {
    return {
        type: 'atom',
        name: str,
        operator: null,
        components: [],
        toString: () => str,
        equals: (other) => other && other.type === 'atom' && other.name === str
    };
}

function isTruthy(value) {
    if (!value) return false;
    if (value.name) {
        if (value.name === 'False' || value.name === 'false' || value.name === 'null' || value.name === 'Nil') return false;
        if (value.name === 'True' || value.name === 'true') return true;
        const num = parseFloat(value.name);
        if (!isNaN(num)) return num !== 0;
    }
    return Boolean(value);
}
