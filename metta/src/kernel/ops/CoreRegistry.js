/**
 * CoreRegistry.js - Core operation registry
 */

import { sym, exp } from '../../kernel/Term.js';
import { Unify } from '../../kernel/Unify.js';
import { OperationNotFoundError } from '../../errors/MeTTaErrors.js';

export class CoreRegistry {
    constructor() {
        this.operations = new Map();
    }

    /**
     * Register a new operation
     */
    register(name, fn, options = {}) {
        this.operations.set(this._normalize(name), { fn, options });
        return this;
    }

    /**
     * Check if an operation exists
     */
    has(name) {
        const n = typeof name === 'string' ? name : name?.name;
        return n ? this.operations.has(this._normalize(n)) : false;
    }

    /**
     * Check if an operation is lazy
     */
    isLazy(name) {
        const n = typeof name === 'string' ? name : name?.name;
        return n ? !!this.operations.get(this._normalize(n))?.options?.lazy : false;
    }

    /**
     * Check if an operation is pure (Phase P1-E: Deterministic cache hook)
     */
    isPure(name) {
        const n = typeof name === 'string' ? name : name?.name;
        return n ? !!this.operations.get(this._normalize(n))?.options?.pure : false;
    }

    /**
     * Execute an operation
     */
    execute(name, ...args) {
        const n = typeof name === 'string' ? name : name?.name;
        if (!n) {throw new OperationNotFoundError(String(name));}

        const norm = this._normalize(n);
        const op = this.operations.get(norm);
        if (!op) {throw new OperationNotFoundError(n);}
        return op.fn(...args);
    }

    /**
     * Get all registered operation names
     */
    getOperations() {
        return Array.from(this.operations.keys());
    }

    /**
     * Alias for getOperations
     */
    list() {
        return this.getOperations();
    }

    /**
     * Clear all operations
     */
    clear() {
        this.operations.clear();
    }

    /**
     * Normalize operation name (ensure it starts with &)
     */
    _normalize(name) {
        return name.startsWith('&') ? name : `&${name}`;
    }
}