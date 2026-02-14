/**
 * MeTTaInterpreter.js - Main MeTTa interpreter
 * Wires kernel components and loads standard library
 */

import { Space } from './kernel/Space.js';
import { Ground } from './kernel/Ground.js';
import { step, reduce, match } from './kernel/Reduce.js';
import { Parser } from './Parser.js';
import { Unify } from './kernel/Unify.js';
import { Term } from './kernel/Term.js';
import { loadStdlib } from './stdlib/StdlibLoader.js';
import { objToBindingsAtom, bindingsAtomToObj } from './BindingsConverter.js';

export class MeTTaInterpreter {
    constructor(options = {}) {
        this.space = new Space();
        this.ground = new Ground();
        this.parser = new Parser();
        
        // Register advanced grounded operations
        this.registerAdvancedOps();

        // Load standard library (unless disabled)
        if (options.loadStdlib !== false) {
            this.loadStdlib(options);
        }
    }

    registerAdvancedOps() {
        // &subst: Substitution (variable, value, template) -> result
        this.ground.register('&subst', (a, b, c) => {
            // Case 1: (subst variable value template) - used by let/lambda
            if (c !== undefined) {
                const variable = a;
                const value = b;
                const template = c;
                const bindings = {};
                if (variable.name) {
                    bindings[variable.name] = value;
                }
                return Unify.subst(template, bindings);
            }
            // Case 2: (subst template bindings) - used by match
            else {
                const template = a;
                const bindingsAtom = b;
                // Convert bindings atom back to object
                const bindings = bindingsAtomToObj(bindingsAtom);
                return Unify.subst(template, bindings);
            }
        });

        // &unify: Unify (pattern, term) -> bindings or False
        this.ground.register('&unify', (pattern, term) => {
            const bindings = Unify.unify(pattern, term);
            if (bindings === null) {
                return Term.sym('False');
            }
            return objToBindingsAtom(bindings);
        });

        // &match: Match (space, pattern, template)
        this.ground.register('&match', (space, pattern, template) => {
            // If space is &self, use this.space
            // TODO: handle other spaces passed as arguments
            let targetSpace = this.space;

            // If space argument is provided and looks like a space (has query method), use it?
            // For now, we only support implicit &self or ignoring the first arg if it denotes self

            console.log("[DEBUG] &match called. Pattern:", pattern.toString(), "Template:", template.toString());
            const results = match(targetSpace, pattern, template);
            console.log("[DEBUG] &match results:", results.length);

            // Listify results
            const listify = (arr) => {
                if (arr.length === 0) return Term.sym('()');
                return Term.exp(':', [arr[0], listify(arr.slice(1))]);
            };
            return listify(results);
        });

        // &query: Query (pattern, template) -> results
        this.ground.register('&query', (pattern, template) => {
            const results = match(this.space, pattern, template);
            const listify = (arr) => {
                if (arr.length === 0) return Term.sym('()');
                return Term.exp(':', [arr[0], listify(arr.slice(1))]);
            };
            return listify(results);
        });

        // &type-of: Get type
        this.ground.register('&type-of', (atom) => {
            // Search for (: atom $type)
            const pattern = Term.exp(':', [atom, Term.var('type')]);
            const template = Term.var('type');
            const results = match(this.space, pattern, template);
            if (results.length > 0) return results[0];
            return Term.sym('Atom'); // Default type
        });

        // &get-atoms: Get all atoms from space
        this.ground.register('&get-atoms', (spaceAtom) => {
            // Assume spaceAtom is &self for now, or resolve it
            // TODO: Support multiple spaces
            const atoms = this.space.all();
            
            // Convert JS array to MeTTa list (: h (: t ...))
            const listify = (arr) => {
                if (arr.length === 0) return Term.sym('()');
                return Term.exp(':', [arr[0], listify(arr.slice(1))]);
            };
            return listify(atoms);
        });

        // &add-atom: Add atom to space
        this.ground.register('&add-atom', (atom) => {
            this.space.add(atom);
            return atom;
        });

        // &rm-atom: Remove atom from space
        this.ground.register('&rm-atom', (atom) => {
            this.space.remove(atom);
            return atom;
        });
    }

    /**
     * Load the standard library
     */
    loadStdlib(options = {}) {
        try {
            loadStdlib(this, options);
        } catch (e) {
            console.warn("Failed to load standard library from files:", e.message);
            console.warn("Falling back to internal core definitions if available (legacy).");
            // We could fallback to hardcoded strings here if we kept them,
            // but the goal is to use the files.
        }
    }

    /**
     * Run MeTTa code
     * @param {string} code - MeTTa source code
     * @returns {Array} Results of execution
     */
    run(code) {
        const expressions = this.parser.parseProgram(code);
        const results = [];
        
        for (const expr of expressions) {
            const result = this.evaluate(expr);
            results.push(result);
        }
        
        return results;
    }

    /**
     * Evaluate a single expression
     * @param {Object} expr - Expression to evaluate
     * @returns {*} Result of evaluation
     */
    evaluate(expr) {
        return reduce(expr, this.space, this.ground);
    }

    /**
     * Load MeTTa code without evaluating
     * @param {string} code - MeTTa source code
     */
    load(code) {
        const expressions = this.parser.parseProgram(code);
        
        for (const expr of expressions) {
            // Check if it's a rule definition (= pattern result)
            // Handle both string operator (legacy) and atom operator (new parser)
            const isRule = (expr.operator === '=' || (expr.operator && expr.operator.name === '=')) &&
                           expr.components && expr.components.length === 2;

            if (isRule) {
                this.space.addRule(expr.components[0], expr.components[1]);
            } else {
                this.space.add(expr);
            }
        }
        // Return expressions for compatibility with some tests expecting loaded items
        return expressions.map(e => ({ term: e }));
    }

    /**
     * Query the space with a pattern
     * @param {string|Object} pattern - Pattern to match
     * @param {string|Object} template - Template to instantiate
     * @returns {Array} Matched results
     */
    query(pattern, template) {
        if (typeof pattern === 'string') {
            pattern = this.parser.parse(pattern);
        }
        
        if (typeof template === 'string') {
            template = this.parser.parse(template);
        }
        
        return match(this.space, pattern, template);
    }

    /**
     * Get interpreter statistics
     * @returns {Object} Statistics about the interpreter
     */
    getStats() {
        return {
            space: this.space.getStats(),
            groundOps: this.ground.getOperations().length
        };
    }
}
