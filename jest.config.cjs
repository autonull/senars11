module.exports = {
    testEnvironment: 'node',
    setupFilesAfterEnv: ['<rootDir>/tests/setup/jest-setup.js'],
    testPathIgnorePatterns: [
        'ui/',
        'exp'
    ],
    modulePathIgnorePatterns: [
        '<rootDir>/ui/'
    ],
    moduleNameMapper: {
        // Handles paths that already start with src/ (e.g. @senars/core/src/...)
        '^@senars/metta/src/(.*)$': '<rootDir>/metta/src/$1',
        '^@senars/tensor/src/(.*)$': '<rootDir>/tensor/src/$1',
        '^@senars/core/src/(.*)$': '<rootDir>/core/src/$1',
        '^@senars/nar/src/(.*)$': '<rootDir>/nar/src/$1',
        '^@senars/agent/src/(.*)$': '<rootDir>/agent/src/$1',
        '^@senars/rl/src/(.*)$': '<rootDir>/rl/src/$1',
        // Handles paths without src/ prefix (e.g. @senars/metta/kernel/...)
        '^@senars/metta/(.*)$': '<rootDir>/metta/src/$1',
        '^@senars/tensor/(.*)$': '<rootDir>/tensor/src/$1',
        '^@senars/core/(.*)$': '<rootDir>/core/src/$1',
        '^@senars/nar/(.*)$': '<rootDir>/nar/src/$1',
        '^@senars/agent/(.*)$': '<rootDir>/agent/src/$1',
        '^@senars/rl/(.*)$': '<rootDir>/rl/src/$1',
        // Package entry points
        '^@senars/metta$': '<rootDir>/metta/src/index.js',
        '^@senars/tensor$': '<rootDir>/tensor/src/index.js',
        '^@senars/core$': '<rootDir>/core/src/index.js',
        '^@senars/nar$': '<rootDir>/nar/src/index.js',
        '^@senars/agent$': '<rootDir>/agent/src/index.js',
        '^@senars/rl$': '<rootDir>/rl/src/index.js',
        '^@modelcontextprotocol/sdk/server/mcp\\.js$': '<rootDir>/tests/mocks/mcp-sdk-mcp.js',
        '^@modelcontextprotocol/sdk/server/stdio\\.js$': '<rootDir>/tests/mocks/mcp-sdk-stdio.js',
        '^danfojs': '<rootDir>/tests/mocks/danfojs.js',
        '^node-fetch': '<rootDir>/tests/mocks/node-fetch.js',
        '^nostr-tools$': '<rootDir>/tests/mocks/nostr-tools.js',
        '^@langchain/core/messages$': '<rootDir>/tests/mocks/langchain-core-messages.js',
        '^@langchain/core/tools$': '<rootDir>/tests/mocks/langchain-core-tools.js',
        '^@langchain/langgraph$': '<rootDir>/tests/mocks/langchain-langgraph.js',
        '^@langchain/langgraph/prebuilt$': '<rootDir>/tests/mocks/langchain-langgraph-prebuilt.js',
    },
    transform: {
        '^.+\\.js$': 'babel-jest',
    },
    transformIgnorePatterns: [
        'node_modules/(?!(?:@noble|@modelcontextprotocol|node-fetch|data-uri-to-buffer|fetch-blob|formdata-polyfill|uuid|langsmith|nostr-tools|@langchain)/)',
    ],
    collectCoverageFrom: [
        'core/src/**/*.js',
        'agent/src/**/*.js',
        'ui/src/**/*.js',
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
};
