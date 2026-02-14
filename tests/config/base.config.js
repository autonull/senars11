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
    moduleNameMapper: {
        '^@senars/metta/(.*)$': '<rootDir>/metta/$1',
        '^@senars/tensor/(.*)$': '<rootDir>/tensor/$1',
        '^@senars/core/(.*)$': '<rootDir>/core/$1',
        '^@senars/agent/(.*)$': '<rootDir>/agent/$1',
    },
    collectCoverageFrom: [
        'core/src/**/*.js',
        'agent/src/**/*.js',
        '!**/*.test.js',
    ],
    coverageThreshold: {
        global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80,
        },
    },
    testTimeout: 10000,
    forceExit: true,
};

export default baseConfig;