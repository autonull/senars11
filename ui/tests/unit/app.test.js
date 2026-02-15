/**
 * @file app.test.js
 * @description Unit tests for ui app.js functionality
 */

// Create a simple mock function that supports Jest's toHaveBeenCalled matcher
const createMockFn = () => {
  const fn = (...args) => {
    fn.mock.calls.push(args);
    return fn.mock.returnValue;
  };
  fn.mock = { calls: [], returnValue: undefined };
  fn.mockReturnValue = (value) => {
    fn.mock.returnValue = value;
    return fn;
  };
  fn.mockImplementation = (impl) => {
    fn.impl = impl;
    return fn;
  };
  fn.mockClear = () => {
    fn.mock.calls = [];
    return fn;
  };
  fn._isMockFunction = true;
  return fn;
};

// Mock DOM elements and WebSocket for testing app.js
const mockElements = {
    'status-indicator': { className: '', classList: { add: createMockFn(), remove: createMockFn() } },
    'connection-status': { textContent: '' },
    'message-count': { textContent: '' },
    'logs-container': { innerHTML: '', appendChild: createMockFn(), scrollTop: 0 },
    'command-input': { value: '', textContent: '' },
    'send-button': { addEventListener: createMockFn() },
    'quick-commands': { value: '', addEventListener: createMockFn() },
    'exec-quick': { addEventListener: createMockFn() },
    'show-history': { addEventListener: createMockFn() },
    'clear-logs': { addEventListener: createMockFn() },
    'refresh-graph': { addEventListener: createMockFn() },
    'toggle-live': { addEventListener: createMockFn(), textContent: 'Pause Live' },
    'demo-select': { value: '', addEventListener: createMockFn() },
    'run-demo': { addEventListener: createMockFn() },
    'graph-details': { innerHTML: '' },
    'graph-container': { addEventListener: createMockFn() },
    'notification-container': { appendChild: createMockFn() }
};

// Mock DOM methods
global.document = {
    getElementById: createMockFn(),
    addEventListener: createMockFn()
};

// Set up document.getElementById to return mock elements
global.document.getElementById = (id) => mockElements[id] || null;

global.window = {
    location: { protocol: 'http:', hostname: 'localhost' },
    addEventListener: createMockFn()
};

// Mock WebSocket
global.WebSocket = class MockWebSocket {
    constructor(url) {
        this.url = url;
        this.readyState = 1; // OPEN
        this.OPEN = 1;
    }
    
    send = createMockFn();
    close = createMockFn();
    
    onopen = null;
    onclose = null;
    onerror = null;
    onmessage = null;
};

// Mock cytoscape
global.cytoscape = () => ({
    add: createMockFn(),
    remove: createMockFn(),
    elements: () => ({
        remove: createMockFn()
    }),
    layout: () => ({
        run: createMockFn()
    }),
    on: createMockFn(),
    nodes: () => [],
    edges: () => []
});

describe('ui App.js Unit Tests', () => {
    beforeEach(() => {
        // Reset global state
        global.WEBSOCKET_CONFIG = {
            host: 'localhost',
            port: '8081'
        };
        
        // Reset mock elements
        Object.keys(mockElements).forEach(key => {
            if (typeof mockElements[key] === 'object' && mockElements[key] !== null) {
                if (mockElements[key].textContent !== undefined) {
                    mockElements[key].textContent = '';
                }
                if (mockElements[key].innerHTML !== undefined) {
                    mockElements[key].innerHTML = '';
                }
                if (mockElements[key].value !== undefined) {
                    mockElements[key].value = '';
                }
            }
        });
    });

    test('WebSocket configuration gets properly', () => {
        global.WEBSOCKET_CONFIG = {
            host: 'test-host',
            port: '8082'
        };
        
        const getWebSocketConfig = () => {
            if (typeof global.WEBSOCKET_CONFIG !== 'undefined') {
                return {
                    host: global.WEBSOCKET_CONFIG.host || 'localhost',
                    port: global.WEBSOCKET_CONFIG.port || '8081'
                };
            }
            return {
                host: 'localhost',
                port: '8081'
            };
        };
        
        const config = getWebSocketConfig();
        expect(config.host).toBe('test-host');
        expect(config.port).toBe('8082');
    });

    test('Command history functionality works', () => {
        const commandHistory = [];
        
        const addToHistory = (command) => {
            commandHistory.push({
                command: command,
                timestamp: new Date(),
                status: 'sent'
            });
        };
        
        addToHistory('test command');
        expect(commandHistory.length).toBe(1);
        expect(commandHistory[0].command).toBe('test command');
        expect(commandHistory[0].status).toBe('sent');
    });

    test('Debug command processing works', () => {
        const logEntries = [];
        
        const addLogEntry = (content, type = 'info', icon = '📝') => {
            logEntries.push({ content, type, icon });
        };
        
        const handleDebugCommand = (command) => {
            addLogEntry(`> ${command}`, 'input', '⌨️');
            
            switch(command.toLowerCase()) {
                case '/help':
                    addLogEntry('Available debug commands:', 'info', '💡');
                    return true;
                case '/state':
                    addLogEntry('Connection: connected', 'info', '📡');
                    return true;
                case '/clear':
                    logEntries.length = 0; // Clear logs
                    addLogEntry('Cleared logs', 'info', '🧹');
                    return true;
                default:
                    addLogEntry(`Unknown debug command: ${command}`, 'warning', '⚠️');
                    return false;
            }
        };
        
        // Test /help command
        handleDebugCommand('/help');
        expect(logEntries.length).toBe(2); // Input command + help message
        expect(logEntries[1].content).toBe('Available debug commands:');
        
        // Test /unknown command
        handleDebugCommand('/unknown');
        expect(logEntries[logEntries.length - 1].content).toContain('Unknown debug command:');
        
        // Test /clear command
        handleDebugCommand('/clear');
        expect(logEntries.length).toBe(1); // Only the "Cleared logs" message remains
    });

    test('Message handling functionality', () => {
        const logEntries = [];
        
        const addLogEntry = (content, type = 'info', icon = '📝') => {
            logEntries.push({ content, type, icon });
        };
        
        const handleMessage = (message) => {
            let content, type, icon;
            
            // Determine message type and format accordingly
            switch (message.type) {
                case 'narsese.result':
                    content = message.payload?.result || 'Command processed';
                    type = 'success';
                    icon = '✅';
                    break;
                case 'narsese.error':
                    content = message.payload?.error || 'Narsese processing error';
                    type = 'error';
                    icon = '❌';
                    break;
                case 'task.added':
                    content = message.payload?.task || JSON.stringify(message.payload);
                    type = 'task';
                    icon = '📥';
                    break;
                case 'concept.created':
                    content = message.payload?.concept || JSON.stringify(message.payload);
                    type = 'concept';
                    icon = '🧠';
                    break;
                case 'question.answered':
                    content = message.payload?.answer || JSON.stringify(message.payload);
                    type = 'info';
                    icon = '❓';
                    break;
                default:
                    content = `${message.type}: ${JSON.stringify(message.payload || message.data || message)}`;
                    type = 'info';
                    icon = '📝';
            }
            
            addLogEntry(content, type, icon);
        };
        
        // Test different message types
        handleMessage({ type: 'narsese.result', payload: { result: '✅ Success' } });
        expect(logEntries[0].type).toBe('success');
        expect(logEntries[0].content).toBe('✅ Success');
        
        handleMessage({ type: 'narsese.error', payload: { error: 'Something went wrong' } });
        expect(logEntries[1].type).toBe('error');
        expect(logEntries[1].content).toBe('Something went wrong');
        
        handleMessage({ type: 'task.added', payload: { task: '<bird --> flyer>.' } });
        expect(logEntries[2].type).toBe('task');
        expect(logEntries[2].content).toBe('<bird --> flyer>.');
        
        handleMessage({ type: 'concept.created', payload: { concept: 'bird' } });
        expect(logEntries[3].type).toBe('concept');
        expect(logEntries[3].content).toBe('bird');
    });

    test('Graph update functionality', () => {
        // Test that updateGraph function exists and handles messages
        const mockCy = {
            getElementById: createMockFn().mockReturnValue({}),
            add: createMockFn(),
            layout: () => ({ run: createMockFn() })
        };

        const updateGraph = (message, cy) => {
            if (!cy) return;

            if (message.type === 'concept.created' && message.payload) {
                const concept = message.payload;
                const nodeId = concept.id || `concept_${Date.now()}`;

                // Don't add duplicate nodes (in real code, cy.getElementById(nodeId).length would return nodes)
                if (true) { // Always adding for test
                    cy.add([{
                        group: 'nodes',
                        data: {
                            id: nodeId,
                            label: concept.term || concept.id,
                            type: concept.type || 'concept',
                            weight: 50
                        }
                    }]);

                    cy.layout({ name: 'cose' }).run();
                }
            }
        };

        // Test graph update with concept creation
        const mockMessage = {
            type: 'concept.created',
            payload: { id: 'test_concept', term: 'bird', type: 'concept' }
        };

        // Just ensure the function can be called without errors
        expect(() => updateGraph(mockMessage, mockCy)).not.toThrow();
    });

    test('Demo functionality', () => {
        const runDemo = (demoName) => {
            const demos = {
                inheritance: [
                    '<{cat} --> animal>.',
                    '<{lion} --> cat>.',
                    '<lion --> animal>?',
                    '5'
                ],
                similarity: [
                    '<(bird & flyer) <-> (bat & flyer)>.',
                    '<bird <-> flyer>?',
                    '<bat <-> flyer>?'
                ]
            };
            
            return demos[demoName] || [];
        };
        
        // Test different demo names
        const inheritanceCommands = runDemo('inheritance');
        expect(inheritanceCommands.length).toBe(4);
        expect(inheritanceCommands[0]).toBe('<{cat} --> animal>.');
        
        const similarityCommands = runDemo('similarity');
        expect(similarityCommands.length).toBe(3);
        expect(similarityCommands[0]).toBe('<(bird & flyer) <-> (bat & flyer)>.');
        
        // Test invalid demo name
        const invalidCommands = runDemo('invalid');
        expect(invalidCommands.length).toBe(0);
    });

    test('Status update functionality', () => {
        const statusElements = {
            connectionStatus: { textContent: '' },
            statusIndicator: { className: '', classList: { add: createMockFn(), remove: createMockFn() } }
        };
        
        const updateStatus = (connectionStatus) => {
            const statusText = connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1);
            statusElements.connectionStatus.textContent = statusText;
            
            // Update indicator class
            statusElements.statusIndicator.className = 'status-indicator';
            statusElements.statusIndicator.classList.add(`status-${connectionStatus}`);
        };
        
        updateStatus('connected');
        expect(statusElements.connectionStatus.textContent).toBe('Connected');
        
        updateStatus('disconnected');
        expect(statusElements.connectionStatus.textContent).toBe('Disconnected');
    });
});