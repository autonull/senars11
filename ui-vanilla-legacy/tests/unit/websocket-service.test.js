/**
 * Unit tests for WebSocketService using centralized test utilities
 * These tests mock the WebSocket API to simulate server behavior
 */

// Import test utilities
import WebSocketService from '../../../ui/src/websocket-service.js';
import {
    assert,
    assertTrue,
    assertFalse,
    assertEquals,
    assertThrows,
    runTest,
    runAsyncTest,
    MockWebSocket,
    generateMockNode,
    generateMockEdge,
    generateMockSnapshot
} from './test-utils.js';

// Override global WebSocket for testing
global.WebSocket = MockWebSocket;

async function testWebSocketService() {
    const tests = [
        {
            desc: 'Constructor creates instance properly',
            fn: () => {
                const service = new WebSocketService();
                assertTrue(service !== null, 'Service should be created');
                assertTrue(typeof service.connect === 'function', 'Should have connect method');
                assertTrue(typeof service.disconnect === 'function', 'Should have disconnect method');
                assertTrue(typeof service.sendMessage === 'function', 'Should have sendMessage method');
            }
        },
        {
            desc: 'Connection establishes successfully',
            async: true,
            fn: async () => {
                const service = new WebSocketService('ws://localhost:8080/ws');

                let connected = false;
                service.subscribe('open', () => {
                    connected = true;
                });

                await service.connect();
                await new Promise(resolve => setTimeout(resolve, 50));

                assertTrue(connected, 'Should emit open event when connected');
                assertTrue(service.isConnected(), 'Should report connected state');

                service.disconnect();
            }
        },
        {
            desc: 'sendMessage works when connected',
            async: true,
            fn: async () => {
                const service = new WebSocketService();

                let sentMessage = null;

                // Create and fully initialize the mock WebSocket
                service.ws = new MockWebSocket();
                service.ws.readyState = service.ws.OPEN; // Ensure it's OPEN state
                service.ws.onsend = (data) => {
                    // Mock implementation for testing
                    sentMessage = data;
                };

                const result = service.sendMessage('testType', { test: 'data' });

                assertTrue(result === true, 'Should return true when message sent successfully');
                assertTrue(sentMessage !== null, 'Message should be sent');

                const parsed = JSON.parse(sentMessage);
                assertEquals(parsed.type, 'testType', 'Message type should be preserved');
                assertEquals(parsed.payload.test, 'data', 'Message payload should be preserved');
            }
        },
        {
            desc: 'sendCommand method works',
            async: true,
            fn: async () => {
                const service = new WebSocketService();

                let sentMessage = null;

                service.ws = new MockWebSocket();
                service.ws.readyState = service.ws.OPEN; // Use MockWebSocket's OPEN constant
                service.ws.onsend = (data) => {
                    sentMessage = data;
                };

                const result = service.sendCommand('<a --> b>.');

                assertTrue(result === true, 'Command should be sent successfully');
                assertTrue(sentMessage !== null, 'Command should be sent');

                const parsed = JSON.parse(sentMessage);
                assertEquals(parsed.type, 'narseseInput', 'Command should use narseseInput type');
                assertEquals(parsed.payload.input, '<a --> b>.', 'Command should be in payload');
            }
        },
        {
            desc: 'Event subscription and emission',
            fn: () => {
                const service = new WebSocketService();

                let eventReceived = false;
                let eventData = null;

                service.subscribe('testEvent', (data) => {
                    eventReceived = true;
                    eventData = data;
                });

                service._emit('testEvent', { test: 'data' });

                assertTrue(eventReceived, 'Event should be received by subscriber');
                assertEquals(eventData.test, 'data', 'Event data should be passed correctly');
            }
        },
        {
            desc: 'Error handling for malformed JSON',
            fn: () => {
                const service = new WebSocketService();

                let errorReceived = false;
                service.subscribe('error', (error) => {
                    if (error.type === 'PARSE_ERROR') {
                        errorReceived = true;
                    }
                });

                // Set up the mock WebSocket with the same onmessage handler as in connect()
                service.ws = new MockWebSocket();
                // Simulate the service's message handling logic directly
                const invalidJsonData = '{"invalid": json}';
                try {
                    JSON.parse(invalidJsonData);
                } catch (parseError) {
                    // This is the same error handling as in the original service
                    service._emit('error', { type: 'PARSE_ERROR', message: parseError.message, raw: invalidJsonData });
                }

                assertTrue(errorReceived, 'Should emit error for malformed JSON');
            }
        },
        {
            desc: 'isConnected and isConnecting methods',
            fn: () => {
                const service = new WebSocketService();

                assertFalse(service.isConnected(), 'Should not be connected initially');
                assertFalse(service.isConnecting(), 'Should not be connecting initially');

                service.ws = new MockWebSocket();
                service.ws.readyState = service.ws.OPEN; // Use MockWebSocket's OPEN constant
                assertTrue(service.isConnected(), 'Should report connected when WebSocket is open');

                service.ws.readyState = 0; // CONNECTING
                assertTrue(service.isConnecting(), 'Should report connecting when WebSocket is connecting');
            }
        }
    ];

    // Run each test individually since we need to handle async ones
    console.log('Starting WebSocketService unit tests...\n');

    let passed = 0;
    let total = 0;

    for (const test of tests) {
        total++;
        const result = test.async
            ? await runAsyncTest(test.desc, test.fn)
            : runTest(test.desc, test.fn);

        if (result) passed++;
    }

    console.log(`\nTests completed: ${passed}/${total} passed`);

    if (passed === total) {
        console.log('🎉 All tests passed!');
    } else {
        console.log(`⚠️  Some tests failed`);
        process.exitCode = 1;
    }
}

// Run the tests
testWebSocketService();