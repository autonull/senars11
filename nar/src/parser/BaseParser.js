import { TermFactory } from '@senars/nar';

/**
 * BaseParser - Abstract base class for all parsers
 * Provides common functionality for parsing, caching, and error handling
 */
export class BaseParser {
    constructor(termFactory = null, options = {}) {
        this.termFactory = termFactory ?? new TermFactory();
        this._parseCache = options.cache !== false ? new Map() : null;
        this._maxCacheSize = options.maxCacheSize ?? 1000;
    }

    /**
     * Parse input - must be implemented by subclasses
     * @param {string} input - Input to parse
     * @returns {*} - Parsed result
     */
    parse(input) {
        throw new Error(`parse() must be implemented by ${this.constructor.name}`);
    }

    /**
     * Get value from cache
     * @protected
     */
    _cacheGet(key) {
        return this._parseCache?.get(key);
    }

    /**
     * Set value in cache
     * @protected
     */
    _cacheSet(key, value) {
        if (this._parseCache && this._parseCache.size < this._maxCacheSize) {
            this._parseCache.set(key, value);
        }
    }

    /**
     * Check if cache has key
     * @protected
     */
    _cacheHas(key) {
        return this._parseCache?.has(key) ?? false;
    }

    /**
     * Clear parse cache
     */
    clearCache() {
        this._parseCache?.clear();
    }

    /**
     * Get cache statistics
     * @returns {Object} - Cache stats
     */
    getCacheStats() {
        return {
            size: this._parseCache?.size ?? 0,
            maxSize: this._maxCacheSize,
            enabled: this._parseCache !== null
        };
    }

    /**
     * Validate input before parsing
     * @protected
     */
    _validateInput(input) {
        if (typeof input !== 'string') {
            throw new Error('Input must be a string');
        }
        if (input.trim() === '') {
            throw new Error('Input must be a non-empty string');
        }
        return input.trim();
    }

    /**
     * Wrap parse errors with context
     * @protected
     */
    _wrapError(error, input) {
        const parserName = this.constructor.name;
        return new Error(`${parserName} parsing failed: ${error.message}`);
    }
}
