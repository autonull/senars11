/**
 * @file tests/config/base.config.js
 * @description Base Jest configuration shared across test environments
 */

// Third-party imports
/** @type {import('jest').Config} */

// Local imports
// (none in this file)

// Base configuration object
const baseConfig = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default baseConfig;