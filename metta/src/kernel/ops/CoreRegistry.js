/**
 * CoreRegistry.js - Core operation registry
 */

import { sym, exp } from '../../kernel/Term.js';
import { Unify } from '../../kernel/Unify.js';
import { OperationNotFoundError } from '../../errors/MeTTaErrors.js';

export class CoreRegistry {
    constructor() {
        this.operations = new Map();
        this.opCache = new WeakMap();
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
    has(nameOrTerm) {
        const op = this._lookup(nameOrTerm);
        return !!op;
    }

    /**
     * Check if an operation is lazy
     */
    isLazy(nameOrTerm) {
        const op = this._lookup(nameOrTerm);
        return !!op?.options?.lazy;
    }

    /**
     * Execute an operation
     */
    execute(nameOrTerm, ...args) {
        const op = this._lookup(nameOrTerm);
        if (!op) {
            const name = typeof nameOrTerm === 'string' ? nameOrTerm : nameOrTerm?.name;
            throw new OperationNotFoundError(name);
        }
        return op.fn(...args);
    }

    /**
     * Lookup operation object by name or term
     * Caches results for term objects in WeakMap
     */
    _lookup(nameOrTerm) {
        if (!nameOrTerm) return undefined;

        // Try cache for objects
        if (typeof nameOrTerm === 'object') {
            const cached = this.opCache.get(nameOrTerm);
            if (cached) return cached;
        }

        // Normal lookup
        const name = typeof nameOrTerm === 'string' ? nameOrTerm : nameOrTerm.name;
        if (!name) return undefined;

        const norm = this._normalize(name);
        const op = this.operations.get(norm);

        // Cache result if found and input was object
        if (op && typeof nameOrTerm === 'object') {
            this.opCache.set(nameOrTerm, op);
        }

        return op;
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