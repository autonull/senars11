/** @type {import('jest').Config} */
import baseConfig from './tests/config/base.config.js';

export default {
  ...baseConfig,
  roots: ['<rootDir>/tests/integration'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/integration.js'],
  testMatch: ['**/tests/integration/**/*.test.js'],
};