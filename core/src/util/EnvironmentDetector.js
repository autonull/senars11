/**
 * Environment detection utility for SeNARS
 * Provides consistent environment detection across different runtime contexts
 */

/**
 * Detects the current runtime environment
 */
export class EnvironmentDetector {
    constructor() {
        this._cachedResults = new Map();
    }

    /**
     * Detect if running in test environment
     * @returns {boolean} True if in test environment
     */
    isTest() {
        return this._cached('test', () => {
            if (typeof process !== 'undefined') {
                if (process.env.NODE_ENV === 'test' ||
                    process.env.JEST_WORKER_ID !== undefined ||
                    process.env.VITEST === 'true') {
                    return true;
                }
            }

            const g = typeof globalThis !== 'undefined' ? globalThis :
                      typeof window !== 'undefined' ? window : {};

            return !!(g.__JEST__ || g.__VITEST__);
        });
    }

    /**
     * Detect if running in development environment
     * @returns {boolean} True if in development environment
     */
    isDevelopment() {
        return this._cached('development', () => {
            if (typeof process !== 'undefined' && process.env) {
                return process.env.NODE_ENV === 'development';
            }
            return false;
        });
    }

    /**
     * Detect if running in production environment
     * @returns {boolean} True if in production environment
     */
    isProduction() {
        return this._cached('production', () => {
            if (typeof process !== 'undefined' && process.env) {
                return process.env.NODE_ENV === 'production';
            }
            return false;
        });
    }

    /**
     * Detect if running in Node.js environment
     * @returns {boolean} True if in Node.js environment
     */
    isNode() {
        return this._cached('node', () => {
            return typeof process !== 'undefined' &&
                   process.versions != null &&
                   process.versions.node != null;
        });
    }

    /**
     * Detect if running in browser environment
     * @returns {boolean} True if in browser environment
     */
    isBrowser() {
        return this._cached('browser', () => {
            return typeof window !== 'undefined' &&
                   typeof document !== 'undefined';
        });
    }

    /**
     * Detect if running in debug mode
     * @returns {boolean} True if debug mode is enabled
     */
    isDebug() {
        return this._cached('debug', () => {
            if (typeof process !== 'undefined' && process.env) {
                return process.env.DEBUG === 'true' ||
                       process.env.DEBUG === '1' ||
                       process.env.DEBUG_SENARS === 'true';
            }
            return false;
        });
    }

    /**
     * Detect if running in CI/CD environment
     * @returns {boolean} True if in CI/CD environment
     */
    isCI() {
        return this._cached('ci', () => {
            if (typeof process !== 'undefined' && process.env) {
                return process.env.CI === 'true' ||
                       process.env.GITHUB_ACTIONS === 'true' ||
                       process.env.GITLAB_CI === 'true' ||
                       process.env.CIRCLECI === 'true';
            }
            return false;
        });
    }

    /**
     * Get environment name
     * @returns {string} Environment name
     */
    getEnvironment() {
        if (this.isTest()) return 'test';
        if (this.isDevelopment()) return 'development';
        if (this.isProduction()) return 'production';
        return 'unknown';
    }

    /**
     * Get all environment info
     * @returns {Object} Environment information
     */
    getInfo() {
        return {
            environment: this.getEnvironment(),
            isTest: this.isTest(),
            isDevelopment: this.isDevelopment(),
            isProduction: this.isProduction(),
            isNode: this.isNode(),
            isBrowser: this.isBrowser(),
            isDebug: this.isDebug(),
            isCI: this.isCI()
        };
    }

    /**
     * Clear cached results (useful for testing)
     */
    clearCache() {
        this._cachedResults.clear();
    }

    /**
     * Cache detection result for performance
     * @private
     */
    _cached(key, detector) {
        if (!this._cachedResults.has(key)) {
            this._cachedResults.set(key, detector());
        }
        return this._cachedResults.get(key);
    }
}

/**
 * Default environment detector instance
 */
export const envDetector = new EnvironmentDetector();

export const isNodeEnvironment = () => envDetector.isNode();
export const isBrowserEnvironment = () => envDetector.isBrowser();
