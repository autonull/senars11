/**
 * Unit tests for ConfigManager using centralized test utilities
 */

import configManager from '../../../ui/src/config/config-manager.js';
import {
    assert,
    assertTrue,
    assertFalse,
    assertEquals,
    assertDeepEqual,
    runTest,
    runTestSuite
} from './test-utils.js';

function testConfigManager() {
    const tests = [
        {
            desc: 'Constructor initializes with default config',
            fn: () => {
                assertTrue(configManager !== null, 'ConfigManager should be created');
                const config = configManager.getConfig();
                assertTrue(config.websocket !== undefined, 'Should have WebSocket config');
                assertTrue(config.ui !== undefined, 'Should have UI config');
                assertTrue(config.graph !== undefined, 'Should have Graph config');
            }
        },
        {
            desc: 'WebSocket configuration defaults',
            fn: () => {
                assertEquals(configManager.getWebSocketPort(), 8080, 'Default WebSocket port should be 8080');
                assertEquals(configManager.getWebSocketHost(), 'localhost', 'Default WebSocket host should be localhost');
                assertEquals(configManager.getWebSocketPath(), '/ws', 'Default WebSocket path should be /ws');
                assertEquals(configManager.getReconnectDelay(), 3000, 'Default reconnect delay should be 3000ms');
                assertEquals(configManager.getMaxReconnectAttempts(), 10, 'Max reconnect attempts should be 10');
            }
        },
        {
            desc: 'UI configuration defaults',
            fn: () => {
                assertEquals(configManager.getMaxLogEntries(), 1000, 'Max log entries should be 1000');
                assertEquals(configManager.getBatchProcessingInterval(), 150, 'Batch processing interval should be 150ms');
                assertEquals(configManager.getMaxGraphNodes(), 5000, 'Max graph nodes should be 5000');
                assertEquals(configManager.getMaxGraphEdges(), 10000, 'Max graph edges should be 10000');
            }
        },
        {
            desc: 'Graph configuration defaults',
            fn: () => {
                const nodeShapes = configManager.getNodeShapes();
                assertTrue(nodeShapes.concept !== undefined, 'Should have concept node shape');
                
                const nodeColors = configManager.getNodeColors();
                assertTrue(nodeColors.concept !== undefined, 'Should have concept node color');
                
                const layout = configManager.getGraphLayout();
                assertTrue(layout.name !== undefined, 'Should have graph layout name');
            }
        },
        {
            desc: 'Configuration update',
            fn: () => {
                const originalPort = configManager.getWebSocketPort();
                
                // Update configuration
                configManager.updateConfig({
                    websocket: {
                        defaultPort: 9999
                    }
                });
                
                assertEquals(configManager.getWebSocketPort(), 9999, 'WebSocket port should be updated');
                
                // Restore original value for other tests
                configManager.updateConfig({
                    websocket: {
                        defaultPort: originalPort
                    }
                });
            }
        }
    ];

    return runTestSuite('ConfigManager', tests);
}

// Run the tests
testConfigManager();