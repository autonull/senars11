/** @type {import('jest').Config} */
import baseConfig from './tests/config/base.config.js';

export default {
    ...baseConfig,
    roots: ['<rootDir>/tests/unit', '<rootDir>/rl/tests/unit'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup/unit.js'],
    testMatch: ['**/tests/unit/**/*.test.js', '**/rl/tests/unit/**/*.test.js'],
    testPathIgnorePatterns: [
        '<rootDir>/tests/unit/.*performance.*',
        '<rootDir>/tests/unit/.*benchmark.*',
    ],
};