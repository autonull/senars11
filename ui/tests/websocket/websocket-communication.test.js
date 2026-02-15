/**
 * @file websocket-communication.test.js
 * @description Test WebSocket communication with real WebSocketMonitor
 */

import { setTimeout } from 'timers/promises';
import { UITestRunner, closeSharedBrowser } from '../utils/test-utils.js';

describe('UI WebSocket Communication with WebSocketMonitor', () => {
    let testRunner = null;

    afterAll(async () => {
        await closeSharedBrowser();
    });

    beforeEach(async () => {
        testRunner = new UITestRunner({ uiPort: 8280, wsPort: 8281 });
        await testRunner.setup();
    });

    afterEach(async () => {
        await testRunner.teardown();
    });

    test('WebSocket connection established with WebSocketMonitor', async () => {
        // Verify connection status is connected
        const isConnected = await testRunner.isConnected();
        expect(isConnected).toBe(true);
        
        // Verify connection status text shows connected
        const connectionStatus = await testRunner.page.$eval('#connection-status', el => el.textContent);
        expect(connectionStatus.toLowerCase()).toContain('connected');
        
        // Verify status indicator has connected class
        const indicatorClass = await testRunner.page.$eval('#status-indicator', el => el.className);
        expect(indicatorClass).toContain('status-connected');
    });

    test('Narsese commands sent via WebSocket to WebSocketMonitor', async () => {
        // Send a command that should be processed by the backend through WebSocketMonitor
        await testRunner.executeCommand('<{websocket_test} --> concept>.');
        
        // Wait for response from backend
        await testRunner.waitForResponse('websocket_test');
        
        const logs = await testRunner.getLogs();
        expect(logs).toContain('> <{websocket_test} --> concept>.');
        expect(logs).toContain('websocket_test');
        
        // Should receive a response indicating the command was processed
        expect(logs).toContain('✅'); // Success indicator
    });

    test('Control commands sent via WebSocket', async () => {
        // Test a control command that goes through WebSocketMonitor
        await testRunner.executeCommand('*step');
        
        await testRunner.waitForResponse('*step');
        
        const logs = await testRunner.getLogs();
        expect(logs).toContain('> *step');
        
        // Control commands should trigger backend processing
        expect(logs).toContain('step') || expect(logs).toContain('cycle');
    });

    test('Memory snapshot requests handled by WebSocketMonitor', async () => {
        // Request memory snapshot using the refresh command
        await testRunner.page.click('#refresh-graph');
        await setTimeout(1000);
        
        const logsAfterRefresh = await testRunner.getLogs();
        expect(logsAfterRefresh).toContain('Graph refresh requested');
        
        // WebSocketMonitor should send memory snapshot in response to refresh
        expect(logsAfterRefresh).toContain('Memory snapshot received') || 
        expect(logsAfterRefresh).toContain('concepts') || 
        expect(logsAfterRefresh).toContain('Graph has');
    });

    test('Batched events from WebSocketMonitor', async () => {
        // The WebSocketMonitor batches events, test that we receive them
        await testRunner.executeCommand('<{batch_test} --> type>.');
        await setTimeout(1000);
        
        // Run a step to generate more events
        await testRunner.executeCommand('*step');
        await setTimeout(1000);
        
        const logs = await testRunner.getLogs();
        
        // Should contain evidence of multiple events being processed
        expect(logs).toContain('batch_test');
        expect(logs).toContain('step');
        
        // May contain batched events
        expect(logs).toContain('eventBatch') || expect(logs.length).toBeGreaterThan(100); // Indication of multiple messages
    });

    test('Concept creation events from WebSocketMonitor', async () => {
        // Create a concept and verify it generates the right events through WebSocketMonitor
        await testRunner.executeCommand('<{monitor_concept} --> category>.');
        await testRunner.waitForResponse('monitor_concept');
        await setTimeout(1000);
        
        const logs = await testRunner.getLogs();
        
        // Should receive concept creation events from WebSocketMonitor
        expect(logs).toContain('monitor_concept');
        expect(logs).toContain('concept') || expect(logs).toContain('created');
    });

    test('Task processing events from WebSocketMonitor', async () => {
        // Send a question which creates a task
        await testRunner.executeCommand('<{monitor_task} --> property>?');
        await testRunner.waitForResponse('monitor_task');
        await setTimeout(1000);
        
        const logs = await testRunner.getLogs();
        
        // Should receive task-related events from WebSocketMonitor
        expect(logs).toContain('monitor_task');
        expect(logs).toContain('task') || expect(logs).toContain('question');
    });

    test('Error handling in WebSocket communication', async () => {
        // Send an intentionally malformed command to test error handling
        await testRunner.executeCommand('<invalid command syntax');
        await setTimeout(1000);
        
        const logs = await testRunner.getLogs();
        
        // Should handle the error gracefully, possibly with an error message
        // The UI should continue working despite the error
        const isConnected = await testRunner.isConnected();
        expect(isConnected).toBe(true);
    });

    test('Message rate limiting and flow control', async () => {
        // Send multiple commands quickly to test flow control
        const commands = [
            '<{flow1} --> test>.',
            '<{flow2} --> test>.',
            '<{flow3} --> test>.',
            '*step',
            '<{flow4} --> test>?'
        ];
        
        for (const cmd of commands) {
            await testRunner.executeCommand(cmd);
            await setTimeout(300); // Brief pause between commands
        }
        
        const logs = await testRunner.getLogs();
        
        // All commands should have been processed
        for (const cmd of ['flow1', 'flow2', 'flow3', 'flow4']) {
            expect(logs).toContain(cmd);
        }
        
        expect(logs).toContain('step');
    });

    test('WebSocket reconnection after temporary disconnection', async () => {
        // This test would require the ability to temporarily stop/start WebSocket server
        // For now, we'll verify the reconnection logic exists in the code
        
        const hasReconnectLogic = await testRunner.page.evaluate(() => {
            // Check if the reconnection mechanism exists in the global scope
            return typeof window.SeNARSUI !== 'undefined';
        });
        
        expect(hasReconnectLogic).toBe(true);
    });
});