module.exports = {
    testEnvironment: 'node',
    testPathIgnorePatterns: [
        'ui/',
        'exp'
    ],
    modulePathIgnorePatterns: [
        '<rootDir>/ui/'
    ],
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
    transform: {
        '^.+\\.js$': 'babel-jest',
    },
    transformIgnorePatterns: [
        'node_modules/(?!(?:@noble|@modelcontextprotocol)/)',
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
