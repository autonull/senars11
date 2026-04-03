/**
 * OperationRegistry for EvaluationEngine
 * Provides validated operation registration and execution
 */

import { logError } from './utils/error.js';

/**
 * Registry for mathematical and comparison operations
 * Supports validation, type checking, and error handling
 */
export class OperationRegistry {
    constructor() {
        this._operations = new Map();
        this._aliases = new Map();
    }

    /**
     * Register a new operation
     * @param {string} symbol - Operation symbol (e.g., '+', '-', '*')
     * @param {Function} implementation - Operation implementation function
     * @param {Object} options - Registration options
     * @param {number} options.arity - Expected number of arguments (-1 for variable)
     * @param {string} options.category - Operation category ('arithmetic', 'comparison', 'logical')
     * @param {*} options.identity - Identity element for the operation
     */
    register(symbol, implementation, options = {}) {
        const { arity = -1, category = 'custom', identity = null } = options;

        if (typeof implementation !== 'function') {
            throw new Error(`Operation '${symbol}' must be a function`);
        }

        this._operations.set(symbol, {
            implementation,
            arity,
            category,
            identity,
            registeredAt: Date.now()
        });
    }

    /**
     * Register multiple operations at once
     * @param {Array<[string, Function, Object]>} operations - Array of [symbol, fn, options] tuples
     */
    registerAll(operations) {
        for (const [symbol, fn, options] of operations) {
            this.register(symbol, fn, options);
        }
    }

    /**
     * Get an operation by symbol
     * @param {string} symbol - Operation symbol
     * @returns {Function|null} Operation implementation or null
     */
    get(symbol) {
        const resolvedSymbol = this._aliases.get(symbol) || symbol;
        const op = this._operations.get(resolvedSymbol);
        return op?.implementation || null;
    }

    /**
     * Check if operation exists
     * @param {string} symbol - Operation symbol
     * @returns {boolean} True if operation exists
     */
    has(symbol) {
        return this._operations.has(this._aliases.get(symbol) || symbol);
    }

    /**
     * Get operation metadata
     * @param {string} symbol - Operation symbol
     * @returns {Object|null} Operation metadata or null
     */
    getMetadata(symbol) {
        const resolvedSymbol = this._aliases.get(symbol) || symbol;
        return this._operations.get(resolvedSymbol) || null;
    }

    /**
     * Execute an operation with error handling
     * @param {string} symbol - Operation symbol
     * @param {...any} args - Operation arguments
     * @returns {*} Operation result
     * @throws {Error} If operation fails
     */
    execute(symbol, ...args) {
        const operation = this.get(symbol);
        if (!operation) {
            throw new Error(`Unknown operation: ${symbol}`);
        }

        try {
            return operation(...args);
        } catch (error) {
            logError(error, {
                operation: symbol,
                arguments: args,
                context: 'EvaluationEngine'
            });
            throw new Error(`Operation '${symbol}' failed: ${error.message}`);
        }
    }

    /**
     * Add an alias for an operation
     * @param {string} alias - Alias symbol
     * @param {string} target - Target operation symbol
     */
    addAlias(alias, target) {
        if (!this.has(target)) {
            throw new Error(`Cannot create alias: target operation '${target}' does not exist`);
        }
        this._aliases.set(alias, target);
    }

    /**
     * Get all registered operations
     * @returns {Map} Copy of operations map
     */
    getAll() {
        return new Map(this._operations);
    }

    /**
     * Get operations by category
     * @param {string} category - Category name
     * @returns {Array} Array of [symbol, metadata] pairs
     */
    getByCategory(category) {
        const results = [];
        for (const [symbol, metadata] of this._operations.entries()) {
            if (metadata.category === category) {
                results.push([symbol, metadata]);
            }
        }
        return results;
    }

    /**
     * Remove an operation
     * @param {string} symbol - Operation symbol
     * @returns {boolean} True if removed, false if not found
     */
    remove(symbol) {
        return this._operations.delete(symbol);
    }

    /**
     * Clear all operations
     */
    clear() {
        this._operations.clear();
        this._aliases.clear();
    }

    /**
     * Get registry statistics
     * @returns {Object} Registry statistics
     */
    getStats() {
        const categories = {};
        for (const metadata of this._operations.values()) {
            categories[metadata.category] = (categories[metadata.category] || 0) + 1;
        }

        return {
            totalOperations: this._operations.size,
            totalAliases: this._aliases.size,
            categories
        };
    }
}
