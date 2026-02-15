/**
 * Unit tests for REPLController using centralized test utilities
 */

import REPLController from '../../../ui/src/repl-controller.js';
import StateStore from '../../../ui/src/state-store.js';
import WebSocketService from '../../../ui/src/websocket-service.js';
import {
    assert,
    assertTrue,
    assertFalse,
    assertEquals,
    assertDeepEqual,
    runTest,
    runTestSuite
} from './test-utils.js';

// Mock REPLView API
class MockReplView {
    constructor() {
        this.output = '';
        this.input = '';
        this.history = [];
    }

    addOutput(text) {
        this.output += text + '\n';
    }

    clearOutput() {
        this.output = '';
    }

    setInput(value) {
        this.input = value;
    }

    getInput() {
        return this.input;
    }

    addToHistory(command) {
        this.history.push(command);
    }

    setCommandHandler(handler) {
        this.commandHandler = handler;
    }

    destroy() {}
}

function testREPLController() {
    const tests = [
        {
            desc: 'Constructor initializes properly',
            fn: () => {
                const mockView = new MockReplView();
                const store = new StateStore();
                const service = new WebSocketService();

                const controller = new REPLController(mockView, store, service);

                assertTrue(controller !== null, 'Controller should be created');
                assertTrue(controller.viewAPI === mockView, 'Should have reference to view API');
                assertTrue(controller.store === store, 'Should have reference to store');
                assertTrue(controller.service === service, 'Should have reference to service');
            }
        },
        {
            desc: 'Handle command sends to WebSocket service',
            fn: () => {
                const mockView = new MockReplView();
                const store = new StateStore();
                const service = new WebSocketService();
                
                // Mock the service's sendCommand method
                let commandSent = null;
                service.sendCommand = (cmd) => {
                    commandSent = cmd;
                    return true;
                };

                const controller = new REPLController(mockView, store, service);

                controller.handleCommand('<test --> command>.');

                assertEquals(commandSent, '<test --> command>.', 'Command should be sent to service');
            }
        },
        {
            desc: 'Handle debug commands',
            fn: () => {
                const mockView = new MockReplView();
                const store = new StateStore();
                const service = new WebSocketService();

                const controller = new REPLController(mockView, store, service);

                // Add some test nodes to state for the debug commands
                store.dispatch({
                    type: 'ADD_NODE',
                    payload: { id: 'concept_a', label: 'Concept A', type: 'concept' }
                });
                store.dispatch({
                    type: 'ADD_NODE',
                    payload: { id: 'task_1', label: 'Task 1', type: 'task' }
                });

                // Test /tasks command
                controller._handleDebugCommand('/tasks');
                assertTrue(mockView.output.includes('TASK: Task 1') || mockView.output.includes('task_1'), 'Should show tasks in output');

                // Test /concepts command 
                controller._handleDebugCommand('/concepts');
                assertTrue(mockView.output.includes('CONCEPT: Concept A') || mockView.output.includes('concept_a'), 'Should show concepts in output');

                // Test /help command
                controller._handleDebugCommand('/help');
                assertTrue(mockView.output.includes('Available debug commands'), 'Should show help text');
            }
        },
        {
            desc: 'Handle incoming messages',
            fn: () => {
                const mockView = new MockReplView();
                const store = new StateStore();
                const service = new WebSocketService();

                const controller = new REPLController(mockView, store, service);

                // Test different message types
                controller.handleIncomingMessage({
                    type: 'connection',
                    data: { message: 'Connected successfully' }
                });

                assertTrue(mockView.output.includes('Connected successfully'), 'Should show connection messages');

                controller.handleIncomingMessage({
                    type: 'task.added',
                    data: { task: '<a --> b>.' }
                });

                assertTrue(mockView.output.includes('[VIS] task.added'), 'Should show visualization messages');
            }
        },
        {
            desc: 'Command history management',
            fn: () => {
                const mockView = new MockReplView();
                const store = new StateStore();
                const service = new WebSocketService();

                const controller = new REPLController(mockView, store, service);

                // Mock service to avoid errors
                service.sendCommand = () => true;

                controller.handleCommand('test command');
                
                assertTrue(mockView.history.includes('test command'), 'Should add command to history');
            }
        }
    ];

    return runTestSuite('REPLController', tests);
}

// Run the tests
testREPLController();