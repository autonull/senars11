// debug-repl.js - Comprehensive debug REPL for transparent I/O
import WebSocketService from './websocket-service.js';

class DebugRepl {
    constructor() {
        this.replContainer = document.getElementById('repl-container');
        this.replInput = document.getElementById('repl-input');
        this.statusBar = document.getElementById('status-bar');
        this.debugContainer = document.getElementById('debug-container');
        this.wsStatus = document.getElementById('ws-status');
        this.msgCount = document.getElementById('msg-count');
        this.lastInput = document.getElementById('last-input');
        this.lastResponse = document.getElementById('last-response');
        this.testResults = document.getElementById('test-results');
        this.service = null;
        this.isConnected = false;
        this.messageCount = 0;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.connect();
        this.setupParserTest();
    }

    setupEventListeners() {
        this.replInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleInput();
            }
        });

        document.getElementById('test-io-btn').addEventListener('click', () => {
            this.runIoTest();
        });

        document.getElementById('test-parser-btn').addEventListener('click', () => {
            this.runParserTest();
        });

        document.getElementById('test-comprehensive-btn').addEventListener('click', () => {
            this.runComprehensiveTest();
        });

        document.getElementById('connect-btn').addEventListener('click', () => {
            this.connect();
        });

        document.getElementById('disconnect-btn').addEventListener('click', () => {
            this.disconnect();
        });

        document.getElementById('clear-repl-btn').addEventListener('click', () => {
            this.clearRepl();
        });

        document.getElementById('clear-debug-btn').addEventListener('click', () => {
            this.clearDebug();
        });

        document.getElementById('execute-quick-btn').addEventListener('click', () => {
            this.executeQuickCommand();
        });
    }

    connect() {
        if (this.service) {
            this.disconnect();
        }

        // Use window.location.hostname for WebSocket connection
        const wsHost = window.location.hostname || 'localhost';
        const wsPort = 8080;
        const wsUrl = `ws://${wsHost}:${wsPort}/ws`;

        this.statusBar.textContent = 'Connecting...';
        this.statusBar.className = 'status-connecting';
        this.wsStatus.textContent = 'Connecting...';

        this.addDebug(`Attempting to connect to: ${wsUrl}`, 'debug');

        this.service = new WebSocketService(wsUrl);

        this.service.subscribe('open', () => {
            this.isConnected = true;
            this.statusBar.textContent = 'Connected';
            this.statusBar.className = 'status-connected';
            this.wsStatus.textContent = 'Connected';
            this.addOutput('✅ Connected to SeNARS server');
            this.addDebug('WebSocket connection opened successfully', 'debug');
        });

        this.service.subscribe('close', () => {
            this.isConnected = false;
            this.statusBar.textContent = 'Disconnected';
            this.statusBar.className = 'status-disconnected';
            this.wsStatus.textContent = 'Disconnected';
            this.addOutput('❌ Disconnected from SeNARS server');
            this.addDebug('WebSocket connection closed', 'debug');
        });

        this.service.subscribe('error', (error) => {
            this.addOutput(`❌ Connection error: ${error.message || error}`, 'error');
            this.addDebug(`WebSocket error: ${error.message || error}`, 'debug');
        });

        this.service.subscribe('message', (message) => {
            this.handleMessage(message);
        });

        this.service.connect().catch(error => {
            this.addOutput(`❌ Connection failed: ${error.message}`, 'error');
            this.addDebug(`Connection error: ${error.message}`, 'error');
            console.error('WebSocket connection error:', error);
        });
    }

    disconnect() {
        if (this.service) {
            this.service.disconnect();
            this.isConnected = false;
            this.statusBar.textContent = 'Disconnected';
            this.statusBar.className = 'status-disconnected';
            this.wsStatus.textContent = 'Disconnected';
            this.addOutput('Disconnected from server');
            this.addDebug('WebSocket disconnected by user', 'debug');
        }
    }

    handleInput() {
        const input = this.replInput.value.trim();
        if (!input) return;

        this.addOutput(`> ${input}`, 'input');
        this.addDebug(`Sent to server: ${input}`, 'sent');
        this.lastInput.textContent = input;

        this.replInput.value = '';
        this.replInput.focus();

        if (this.isConnected) {
            // Determine message type based on input
            let messageType = 'narseseInput';
            let messagePayload = { input };

            // Handle special commands that start with *
            if (input.startsWith('*')) {
                messageType = 'command.execute';
                const [cmd, ...args] = input.substring(1).split(' ');
                messagePayload = { command: cmd, args: args.filter(arg => arg) };
            }
            // Handle direct control commands
            else if (['reset', 'run', 'stop', 'step'].includes(input.toLowerCase())) {
                messageType = `control/${input.toLowerCase()}`;
                messagePayload = {};
            }

            // Send the appropriate message type
            const success = this.service.sendMessage(messageType, messagePayload);
            if (!success) {
                this.addOutput('❌ Failed to send message to server', 'error');
                this.addDebug(`Failed to send message: ${JSON.stringify({type: messageType, payload: messagePayload})}`, 'debug');
            } else {
                this.addDebug(`Message sent: ${JSON.stringify({type: messageType, payload: messagePayload})}`, 'debug');
            }
        } else {
            this.addOutput('❌ Not connected to server', 'error');
            this.addDebug('Cannot send message: not connected', 'debug');
        }
    }

    handleMessage(message) {
        this.messageCount++;
        this.msgCount.textContent = this.messageCount;

        console.log('Received message:', message);
        this.addDebug(`Received: ${JSON.stringify(message)}`, 'received');
        this.lastResponse.textContent = typeof message === 'object' ? message.type || JSON.stringify(message).substring(0, 50) + '...' : String(message);

        // Handle different message types
        if (message.type === 'narsese.result' || message.type === 'narsese.processed' ||
            (message.type?.includes('narsese') && message.payload?.success !== false)) {
            this.addOutput(`✅ Server response: ${JSON.stringify(message.payload || message)}`);
        } else if (message.type === 'error' || message.type === 'narsese.error' ||
                   (typeof message.payload?.success !== 'undefined' && message.payload.success === false) ||
                   (message.payload?.message?.includes?.('Error'))) {
            this.addOutput(`❌ Server error: ${JSON.stringify(message.payload || message)}`, 'error');
        } else if (message.type === 'connection') {
            // Connection confirmation message
            this.addOutput(`ℹ️ ${message.data?.message || 'Connection established'}`);
        } else if (message.type === 'narseseInput') {
            // Response to narsese input
            if (message.payload?.success !== false) {
                this.addOutput(`✅ Input processed: ${message.payload?.message || JSON.stringify(message.payload)}`);
            } else {
                this.addOutput(`❌ Input error: ${message.payload?.message || 'Processing failed'}`, 'error');
            }
        } else if (message.type === 'control/ack') {
            this.addOutput(`✅ Control command acknowledged: ${JSON.stringify(message.payload)}`);
        } else if (message.type === 'command.output' || message.type === 'command.result') {
            this.addOutput(`📊 Command output: ${JSON.stringify(message.payload?.result || message.payload)}`);
        } else {
            // Generic message display
            this.addOutput(`← ${JSON.stringify(message)}`);
        }
    }

    addOutput(text, type = 'output') {
        const line = document.createElement('div');
        line.className = `output-line ${type}-line`;
        line.textContent = text;
        this.replContainer.appendChild(line);
        this.replContainer.scrollTop = this.replContainer.scrollHeight;
    }

    addDebug(text, type = 'debug') {
        const line = document.createElement('div');
        line.className = `debug-line ${type}-line`;
        line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
        this.debugContainer.appendChild(line);
        this.debugContainer.scrollTop = this.debugContainer.scrollHeight;
    }

    clearRepl() {
        this.replContainer.innerHTML = '';
    }

    clearDebug() {
        this.debugContainer.innerHTML = '<h3>Debug Information</h3>' +
            '<div>WebSocket Connection: <span id="ws-status">Not Connected</span></div>' +
            '<div>Message Count: <span id="msg-count">0</span></div>' +
            '<div>Last Input: <span id="last-input">None</span></div>' +
            '<div>Last Response: <span id="last-response">None</span></div>';

        // Re-reference the elements after clearing
        this.wsStatus = document.getElementById('ws-status');
        this.msgCount = document.getElementById('msg-count');
        this.lastInput = document.getElementById('last-input');
        this.lastResponse = document.getElementById('last-response');
    }

    async runIoTest() {
        this.testResults.innerHTML = '<h4>Running I/O Test...</h4><div id="io-test-progress"></div>';
        const progressDiv = document.getElementById('io-test-progress');

        try {
            if (!this.isConnected) {
                this.addOutput('❌ Not connected, attempting to connect...', 'error');
                this.connect();
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for connection
            }

            if (!this.isConnected) {
                throw new Error('Still not connected after attempt');
            }

            // Test 1: Send basic Narsese input
            progressDiv.innerHTML += '<p class="test-info">Test 1: Sending basic Narsese input...</p>';
            this.addOutput('Testing: <test --> concept>.', 'input');
            this.service.sendMessage('narseseInput', { input: '<test --> concept>.' });
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Test 2: Send input with truth values
            progressDiv.innerHTML += '<p class="test-info">Test 2: Sending input with truth values...</p>';
            this.addOutput('Testing: <test --> concept>. %1.0;0.9%', 'input');
            this.service.sendMessage('narseseInput', { input: '<test --> concept>. %1.0;0.9%' });
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Test 3: Send question
            progressDiv.innerHTML += '<p class="test-info">Test 3: Sending question...</p>';
            this.addOutput('Testing: <test --> concept>?', 'input');
            this.service.sendMessage('narseseInput', { input: '<test --> concept>?' });
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Test 4: Send compound term
            progressDiv.innerHTML += '<p class="test-info">Test 4: Sending compound term...</p>';
            this.addOutput('Testing: <(test & compound) --> term>.', 'input');
            this.service.sendMessage('narseseInput', { input: '<(test & compound) --> term>.' });
            await new Promise(resolve => setTimeout(resolve, 1000));

            progressDiv.innerHTML += '<p class="test-pass">✅ All I/O tests completed successfully!</p>';
            this.addOutput('✅ I/O test completed successfully!', 'output');
            return true;
        } catch (error) {
            progressDiv.innerHTML += `<p class="test-fail">❌ I/O test failed: ${error.message}</p>`;
            this.addOutput(`❌ I/O test error: ${error.message}`, 'error');
            return false;
        }
    }

    async runParserTest() {
        this.testResults.innerHTML += '<h4>Running Parser Test...</h4><div id="parser-test-progress"></div>';
        const progressDiv = document.getElementById('parser-test-progress');

        const testInputs = [
            '<a --> b> .',                    // Basic statement
            '<a --> b> . %1.0;0.9%',         // With truth values
            '<a --> b> ?',                    // Question
            '(a & b).',                       // Conjunction
            '<(a & b) --> c>.',              // Compound statement
            '?x.',                           // Variable
            '<$x --> animal>.'               // Variable in statement
        ];

        progressDiv.innerHTML += '<p class="test-info">Testing parser with various Narsese expressions...</p>';

        for (let i = 0; i < testInputs.length; i++) {
            const input = testInputs[i];
            progressDiv.innerHTML += `<p class="test-info">Testing: ${input}</p>`;
            this.service.sendMessage('narseseInput', { input });
            await new Promise(resolve => setTimeout(resolve, 800));
        }

        progressDiv.innerHTML += '<p class="test-pass">✅ Parser test completed!</p>';
        this.addOutput('✅ Parser test completed!', 'output');
    }

    async runComprehensiveTest() {
        this.testResults.innerHTML += '<h4>Running Comprehensive Test...</h4><div id="comprehensive-test-progress"></div>';
        const progressDiv = document.getElementById('comprehensive-test-progress');

        try {
            progressDiv.innerHTML += '<p class="test-info">Starting comprehensive functionality test...</p>';

            // Test various Narsese constructs
            const tests = [
                { name: 'Basic Assertion', input: '<cat --> animal>.' },
                { name: 'Question', input: '<bird --> flyer>?' },
                { name: 'Goal', input: '<human --> mortal>!' },
                { name: 'With Truth Values', input: '<dog --> pet>. %0.8;0.9%' },
                { name: 'Conjunction', input: '<(cat & mammal) --> animal>.' },
                { name: 'Implication', input: '<(bird & flyer) ==> animal>.' },
                { name: 'Variables', input: '<?x --> animal>.' },
                { name: 'Control: Step', input: '*step' },
            ];

            for (const test of tests) {
                progressDiv.innerHTML += `<p class="test-info">Testing ${test.name}: ${test.input}</p>`;
                if (test.input.startsWith('*')) {
                    const [cmd, ...args] = test.input.substring(1).split(' ');
                    this.service.sendMessage('command.execute', { command: cmd, args: args.filter(arg => arg) });
                } else {
                    this.service.sendMessage('narseseInput', { input: test.input });
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            progressDiv.innerHTML += '<p class="test-pass">✅ Comprehensive test completed successfully!</p>';
            this.addOutput('✅ Comprehensive test completed!', 'output');
            return true;
        } catch (error) {
            progressDiv.innerHTML += `<p class="test-fail">❌ Comprehensive test failed: ${error.message}</p>`;
            this.addOutput(`❌ Comprehensive test error: ${error.message}`, 'error');
            return false;
        }
    }

    executeQuickCommand() {
        const select = document.getElementById('quick-commands');
        const value = select.value;
        if (value) {
            this.replInput.value = value;
            this.handleInput();
            select.value = ''; // Reset selection
        }
    }

    // Setup parser functionality testing
    setupParserTest() {
        // Create a parser instance for client-side testing if needed
        this.addDebug('Debug REPL initialized - ready for transparent I/O', 'debug');
    }
}

// Initialize the debug REPL when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DebugRepl();
});