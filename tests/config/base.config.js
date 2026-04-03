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
        '^@senars/metta$': '<rootDir>/metta/src/index.js',
        '^@senars/metta/(.*)$': '<rootDir>/metta/$1',
        '^@senars/tensor$': '<rootDir>/tensor/src/index.js',
        '^@senars/tensor/(.*)$': '<rootDir>/tensor/$1',
        '^@senars/core$': '<rootDir>/core/src/index.js',
        '^@senars/core/(.*)$': '<rootDir>/core/$1',
        '^@senars/agent$': '<rootDir>/agent/src/index.js',
        '^@senars/agent/(.*)$': '<rootDir>/agent/$1',
        '^@senars/rl$': '<rootDir>/rl/src/index.js',
        '^@senars/rl/(.*)$': '<rootDir>/rl/$1',
        '^@modelcontextprotocol/sdk/server/mcp\\.js$': '<rootDir>/tests/mocks/mcp-sdk-mcp.js',
        '^@modelcontextprotocol/sdk/server/stdio\\.js$': '<rootDir>/tests/mocks/mcp-sdk-stdio.js',
    },
    transformIgnorePatterns: [
        'node_modules/(?!(?:@noble|@modelcontextprotocol|node-fetch|data-uri-to-buffer|fetch-blob|formdata-polyfill)/)',
    ],
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