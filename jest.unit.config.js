/** @type {import('jest').Config} */
import baseConfig from './tests/config/base.config.js';

export default {
    ...baseConfig,
    roots: ['<rootDir>/tests/unit', '<rootDir>/rl/tests/unit', '<rootDir>/metta/tests', '<rootDir>/agent/tests', '<rootDir>/bot/tests'],
    setupFiles: ['<rootDir>/tests/setup/browser-mocks.js'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup/unit.js'],
    testMatch: ['**/tests/unit/**/*.test.js', '**/rl/tests/unit/**/*.test.js', '**/metta/tests/**/*.test.js', '**/agent/tests/**/*.test.js', '**/bot/tests/unit/**/*.test.js'],
    testTimeout: 1000,
    testPathIgnorePatterns: [
        '<rootDir>/tests/unit/.*performance.*',
        '<rootDir>/tests/unit/.*benchmark.*',
    ],
};
