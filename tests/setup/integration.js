// Integration Test Setup
// This file sets up the environment for integration tests with real services

// Third-party imports
// (none in this file)

// Local imports
import { generateTestId, getIsolatedPort, validateTestEnvironment } from '../utils/test-helpers.js';

// Set up test-specific configurations for integration tests
process.env.NODE_ENV = 'test';

// Validate test environment
const envValidation = validateTestEnvironment();
if (!envValidation.isValid) {
  console.warn('Warning: Not running in test environment');
}

// Initialize any shared resources needed for integration tests
beforeAll(async () => {
  // Generate unique test ID for isolation
  global.testId = generateTestId();
  global.testPort = getIsolatedPort();

  // Any setup required before all integration tests
  // For example, starting isolated test services, preparing databases, etc.
});

// Clean up resources after all tests
afterAll(async () => {
  // Any cleanup required after all integration tests
  // For example, stopping test services, cleaning up databases, etc.

  // Clean up globals
  global.testId = undefined;
  global.testPort = undefined;
});

// Reset state between tests if needed
beforeEach(() => {
  // Any setup required before each integration test
});

afterEach(() => {
  // Any cleanup required after each integration test
  // For example, clearing test data, closing connections, etc.
});