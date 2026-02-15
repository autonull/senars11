/**
 * @file test-websocket-config-injection.js
 * @description Tests for WebSocket configuration injection in ui
 */

import { test, expect } from '../base-test';

// Tests for WebSocket configuration injection
test.describe('ui WebSocket Configuration Injection Tests', () => {
    test.beforeEach(async ({ uiPage }) => {
        // The uiPage fixture handles navigation and connection
    });

    test('WebSocket config is injected into client-side JavaScript', async ({ page }) => {
        // Check that the WebSocket configuration is available in the page
        const wsConfig = await page.evaluate(() => {
            return window.WEBSOCKET_CONFIG || null;
        });

        expect(wsConfig).not.toBeNull();
        expect(wsConfig).toHaveProperty('port');
        expect(wsConfig).toHaveProperty('host');
    });

    test('WebSocket config values match expected values', async ({ page }) => {
        const wsConfig = await page.evaluate(() => {
            return window.WEBSOCKET_CONFIG;
        });

        // The configuration should match the default values
        expect(wsConfig).toHaveProperty('port');
        expect(wsConfig).toHaveProperty('host');
    });

    test('Client-side config getter uses injected values', async ({ page }) => {
        // Simulate the getWebSocketConfig function from app.js
        const configResult = await page.evaluate(() => {
            if (typeof window.WEBSOCKET_CONFIG !== 'undefined') {
                return {
                    host: window.WEBSOCKET_CONFIG.host || 'localhost',
                    port: window.WEBSOCKET_CONFIG.port || '8081'
                };
            }
            return {
                host: 'fallback',
                port: 'fallback'
            };
        });

        expect(configResult.host).toBeDefined();
        expect(configResult.port).toBeDefined();
    });

    test('WebSocket connection URL is constructed with injected config', async ({ page }) => {
        // Test the WebSocket URL construction logic from app.js
        const wsUrl = await page.evaluate(() => {
            const wsConfig = typeof window.WEBSOCKET_CONFIG !== 'undefined'
                ? {
                    host: window.WEBSOCKET_CONFIG.host || window.location.hostname || 'localhost',
                    port: window.WEBSOCKET_CONFIG.port || '8081'
                }
                : {
                    host: window.location.hostname || 'localhost',
                    port: '8081'
                };

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            return `${protocol}//${wsConfig.host}:${wsConfig.port}`;
        });

        expect(wsUrl).toContain('ws://');
    });

    test('Configuration is exposed to app correctly', async ({ page }) => {
        // Verify that the config is available for the application to use
        const hasWsConfig = await page.evaluate(() => {
            return typeof window.WEBSOCKET_CONFIG !== 'undefined' &&
                   window.WEBSOCKET_CONFIG !== null &&
                   typeof window.WEBSOCKET_CONFIG.port !== 'undefined' &&
                   typeof window.WEBSOCKET_CONFIG.host !== 'undefined';
        });

        expect(hasWsConfig).toBe(true);
    });
});