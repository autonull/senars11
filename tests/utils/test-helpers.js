/**
 * @file tests/utils/test-helpers.js
 * @description Shared test utilities and helper functions for consistent test setup
 */

import { TestSetupError, TestTeardownError } from './test-errors.js';

/**
 * Creates a test instance with specified configuration
 * @param {Object} config - Test configuration object
 * @returns {Object} Test instance with merged configuration
 */
export const createTestInstance = (config = {}) => ({ config: { ...config } });

/**
 * Waits for a specified duration (useful in tests)
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} Promise that resolves after specified time
 */
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generates a unique identifier for test isolation
 * @returns {string} Unique ID for test resources
 */
export const generateTestId = () => `test-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

/**
 * Creates an isolated port for test services
 * @returns {number} Port number for test service
 */
export const getIsolatedPort = () => Math.floor(Math.random() * 1000) + 8000;

/**
 * Safe cleanup function that handles errors gracefully
 * @param {Function} cleanupFn - Cleanup function to execute
 * @param {string} operationName - Name of the operation for logging
 * @returns {Promise<boolean>} Whether cleanup was successful
 */
export const safeCleanup = async (cleanupFn, operationName = 'cleanup') => {
  try {
    await cleanupFn?.();
    return true;
  } catch (error) {
    console.warn(`Cleanup warning [${operationName}]:`, error?.message ?? error);
    return false;
  }
};

/**
 * Validates test environment
 * @returns {Object} Environment validation result
 */
export const validateTestEnvironment = () => ({
  isValid: process.env.NODE_ENV === 'test',
  environment: process.env.NODE_ENV,
  timestamp: Date.now()
});

/**
 * Creates Truth instances with specified values (for Truth class testing)
 * @param {number} frequency - Truth frequency value
 * @param {number} confidence - Truth confidence value
 * @returns {Object} Truth instance
 */
export const createTruth = (frequency, confidence) => ({
  frequency,
  confidence,
  f: frequency,
  c: confidence
});

/**
 * Asserts Truth object properties
 * @param {Object} truth - Truth object to check
 * @param {number} expectedFreq - Expected frequency
 * @param {number} expectedConf - Expected confidence
 */
export const expectTruth = (truth, expectedFreq, expectedConf) => {
  expect(truth).toMatchObject({
    frequency: expectedFreq,
    confidence: expectedConf,
    ...(truth.f !== undefined && { f: expectedFreq }),
    ...(truth.c !== undefined && { c: expectedConf })
  });
};

/**
 * Asserts Truth operation result
 * @param {Object} result - Result of Truth operation
 * @param {number} expectedFreq - Expected frequency
 * @param {number} expectedConf - Expected confidence
 * @param {Function} truthClass - Truth class reference
 */
export const expectTruthOperation = (result, expectedFreq, expectedConf, truthClass) => {
  expect(result).toBeInstanceOf(truthClass);
  expect(result).toMatchObject({ frequency: expectedFreq, confidence: expectedConf });
};

/**
 * Provides array-based batch operations for tests
 * @param {Array} items - Array of items to process
 * @param {Function} operation - Operation function to apply to each item
 * @returns {Promise<Array>} Processed results
 */
export const batchProcess = async (items, operation) => Promise.all(items.map(operation));

/**
 * Creates a test NAR instance with proper error handling
 * @param {Object} config - Configuration for the NAR instance
 * @returns {Object} Test NAR instance
 */
export const createTestNAR = (config = {}) => {
  try {
    // This would require async import in real use, but for now return a template
    return { config: { ...config } };
  } catch (error) {
    throw new TestSetupError(`Failed to create test NAR instance: ${error.message}`, { config });
  }
};

/**
 * Validates a test result and throws specific errors if validation fails
 * @param {*} result - The result to validate
 * @param {Function} validator - Validation function
 * @param {string} context - Context for error messages
 */
export const validateTestResult = (result, validator, context = 'test') => {
  if (!validator(result)) {
    throw new TestTeardownError(`Validation failed for ${context}`, { result, validator: validator.toString() });
  }
};