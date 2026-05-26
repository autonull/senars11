/**
 * @file commonTestSetup.js
 * @description Common test setup utilities following AGENTS.md guidelines
 * Consolidates shared test setup logic to reduce duplication
 */

/**
 * Validates the test environment
 * @returns {Object} Validation result with environment info
 */
export const validateTestEnvironment = () => ({
    isValid: process.env.NODE_ENV === 'test',
    environment: process.env.NODE_ENV,
    timestamp: Date.now()
});

/**
 * Creates a test instance helper
 * @param {Object} config - Configuration for the test instance
 * @returns {Object} Test instance with config
 */
export const createTestInstanceHelper = (config = {}) => ({config: {...config}});

/**
 * Sets up console silencing for cleaner test output
 * @param {boolean} forceSilence - Whether to force silence regardless of environment variable
 */
export const setupConsoleSilencing = (forceSilence = false) => {
    if (!process.env.SHOW_LOGS_IN_TESTS && !forceSilence) {
        const noop = () => {
        };
        global.console = {
            ...console,
            log: noop,
            info: noop,
            warn: noop,
            error: noop,
            debug: noop,
        };
    }
};

/**
 * Generates a unique test ID for isolation
 * @returns {string} Unique test ID
 */
export const generateTestId = () => `test-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

/**
 * Gets an isolated port for testing
 * @returns {number} Available port number
 */
export const getIsolatedPort = () => Math.floor(Math.random() * 1000) + 8000;

/**
 * Common test setup function that can be used in both unit and integration tests
 * @param {Object} options - Setup options
 * @param {boolean} options.silenceConsole - Whether to silence console output
 * @param {boolean} options.setupGlobals - Whether to setup global test helpers
 * @param {Object} options.customGlobals - Custom global properties to set
 */
export const commonTestSetup = (options = {}) => {
    const {silenceConsole = true, setupGlobals = true, customGlobals = {}} = options;

    // Set up test-specific configurations
    process.env.NODE_ENV = 'test';

    // Prevent "OpenAI/Anthropic provider selected but no API key configured" errors.
    // The workspace/agent.json defaults to openai provider; tests that don't need
    // a real LM still trigger validation. A dummy key satisfies the validation check.
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-dummy-key-for-ci';
    process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-dummy-key-for-ci';

    // Validate test environment
    const envValidation = validateTestEnvironment();
    if (!envValidation.isValid) {
        console.warn('Warning: Not running in test environment');
    }

    // Setup console silencing
    if (silenceConsole) {
        setupConsoleSilencing();
    }

    // Setup global helpers
    if (setupGlobals) {
        global.createTestInstance = createTestInstanceHelper;

        // Add custom globals
        Object.entries(customGlobals).forEach(([key, value]) => {
            global[key] = value;
        });
    }

    return envValidation;
};

/**
 * Common cleanup function for after tests
 * @param {Array<string>} globalKeysToCleanup - Array of global keys to remove
 */
export const commonTestCleanup = (globalKeysToCleanup = []) => {
    // Clean up specified global keys
    globalKeysToCleanup.forEach(key => {
        if (global.hasOwnProperty(key)) {
            delete global[key];
        }
    });
};