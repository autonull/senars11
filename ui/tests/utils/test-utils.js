/**
 * @file test-utils.js
 * @description Shared utilities for UI tests
 * This file contains generic test utility functions that can be used across different test scenarios
 */

import { setTimeout } from 'timers/promises';

// Default test configuration
export const DEFAULT_TEST_CONFIG = Object.freeze({
    uiPort: 8200,
    wsPort: 8201,
    timeout: 15000
});

/**
 * Wait for text to appear in logs
 * @param {Object} page - Playwright page instance
 * @param {string} expectedText - Text to wait for
 * @param {number} timeout - Timeout in milliseconds
 */
export async function waitForLogText(page, expectedText, timeout = 10000) {
    await page.waitForFunction(
        (text) => {
            const logs = document.querySelector('#logs-container');
            return logs?.textContent.includes(text) ?? false;
        },
        { timeout },
        expectedText
    );
}

/**
 * Get logs content
 * @param {Object} page - Playwright page instance
 * @returns {Promise<string>} Logs content
 */
export async function getLogsContent(page) {
    return await page.textContent('#logs-container');
}

// Additional generic test utilities can be added here as needed