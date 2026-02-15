/**
 * @file tests/utils/test-errors.js
 * @description Custom error types for test-specific error handling
 */

/**
 * Custom error for test environment issues
 */
export class TestEnvironmentError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'TestEnvironmentError';
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Custom error for test setup issues
 */
export class TestSetupError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'TestSetupError';
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Custom error for test teardown issues
 */
export class TestTeardownError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'TestTeardownError';
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Custom error for test assertion failures with additional context
 */
export class TestAssertionError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'TestAssertionError';
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}