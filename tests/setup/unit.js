// Unit Test Setup
// This file sets up the environment for unit tests with real objects and minimal dependencies

// Third-party imports
// (none in this file)

// Local imports
import { createTestInstance as createTestInstanceHelper, validateTestEnvironment } from '../utils/test-helpers.js';

// Set up test-specific configurations
process.env.NODE_ENV = 'test';

// Validate test environment
const envValidation = validateTestEnvironment();
if (!envValidation.isValid) {
  console.warn('Warning: Not running in test environment');
}

// Create isolated test instances with real dependencies
global.createTestInstance = createTestInstanceHelper;

// Cleanup functions for after tests
afterEach(() => {
  // Any cleanup needed between tests
});

afterAll(() => {
  // Any cleanup needed after all tests
});