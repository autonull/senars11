module.exports = {
    testEnvironment: 'node',
    testPathIgnorePatterns: [
        'v8/.*',
        'v9/.*',
        'ui/',
        'ui-react-legacy/',
	'ui-vanilla-legacy/',
	'exp'
    ],
    modulePathIgnorePatterns: [
        '<rootDir>/ui/',
        '<rootDir>/ui-react-legacy/'
    ],
    transform: {
        '^.+\\.js$': 'babel-jest',
    },
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/*.test.js',
        'ui2/**/*.js',
        '!ui2/**/*.test.js'
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
