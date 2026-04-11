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
        '^@senars/metta/src/(.*)$': '<rootDir>/metta/src/$1',
        '^@senars/metta/(.*)$': '<rootDir>/metta/src/$1',
        '^@senars/tensor$': '<rootDir>/tensor/src/index.js',
        '^@senars/tensor/src/(.*)$': '<rootDir>/tensor/src/$1',
        '^@senars/tensor/(.*)$': '<rootDir>/tensor/src/$1',
        '^@senars/core$': '<rootDir>/core/src/index.js',
        '^@senars/core/src/(.*)$': '<rootDir>/core/src/$1',
        '^@senars/core/(.*)$': '<rootDir>/core/src/$1',
        '^@senars/nar$': '<rootDir>/nar/src/index.js',
        '^@senars/nar/src/(.*)$': '<rootDir>/nar/src/$1',
        '^@senars/nar/(.*)$': '<rootDir>/nar/src/$1',
        '^@senars/agent$': '<rootDir>/agent/src/index.js',
        '^@senars/agent/src/(.*)$': '<rootDir>/agent/src/$1',
        '^@senars/agent/(.*)$': '<rootDir>/agent/src/$1',
        '^@senars/rl$': '<rootDir>/rl/src/index.js',
        '^@senars/rl/src/(.*)$': '<rootDir>/rl/src/$1',
        '^@senars/rl/(.*)$': '<rootDir>/rl/src/$1',
        '^@modelcontextprotocol/sdk/server/mcp\\.js$': '<rootDir>/tests/mocks/mcp-sdk-mcp.js',
        '^@modelcontextprotocol/sdk/server/stdio\\.js$': '<rootDir>/tests/mocks/mcp-sdk-stdio.js',
        '^@langchain/core$': '<rootDir>/tests/mocks/langchain-core.js',
        '^@langchain/core/(.*)$': '<rootDir>/tests/mocks/langchain-core.js',
        '^@langchain/langgraph$': '<rootDir>/tests/mocks/langchain-langgraph.js',
        '^@langchain/langgraph/prebuilt$': '<rootDir>/tests/mocks/langchain-langgraph-prebuilt.js',
        '^@langchain/ollama$': '<rootDir>/tests/mocks/langchain-ollama.js',
        '^@langchain/openai$': '<rootDir>/tests/mocks/langchain-openai.js',
        '^langsmith$': '<rootDir>/tests/mocks/langsmith.js',
        '^nostr-tools$': '<rootDir>/tests/mocks/nostr-tools.js',
        '^uuid$': '<rootDir>/tests/mocks/uuid.js',
        '^danfojs$': '<rootDir>/tests/mocks/danfojs.js',
    },
    transformIgnorePatterns: [
        'node_modules/(?!(?:@noble|@modelcontextprotocol|node-fetch|data-uri-to-buffer|fetch-blob|formdata-polyfill|uuid|@langchain|langsmith|langchain|openai|zod|nostr-tools)/)',
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