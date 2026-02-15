/**
 * @file TestNARWeb.js
 * @description Test framework for NAR functionality using Web UI pathway with Puppeteer
 */

import {fileURLToPath} from 'url';
import {dirname, join} from 'path';
import {promises as fs} from 'fs';
import {RemoteTaskMatch} from './TaskMatch.js';
import {ProcessManager} from './ProcessManager.js';

// Try to import Puppeteer, but make it optional
let puppeteer;
try {
    puppeteer = await import('puppeteer');
} catch (e) {
    console.warn('Puppeteer not available, some web tests may not run:', e.message);
}

export {RemoteTaskMatch};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class TestNARWeb {
    constructor() {
        this.operations = [];
        this.serverProcess = null;
        this.uiServerProcess = null;
        this.browser = null;
        this.page = null;
        this.port = 8082 + Math.floor(Math.random() * 100); // Different port than TestNARRemote
        this.uiPort = 3000 + Math.floor(Math.random() * 1000); // Random port in 3000+ range
        this.isHeadless = process.env.CI === 'true' || process.env.HEADLESS !== 'false';
    }

    input(termStr, freq = 1.0, conf = 0.9) {
        this.operations.push({type: 'input', termStr, freq, conf});
        return this;
    }

    run(cycles = 1) {
        this.operations.push({type: 'run', cycles});
        return this;
    }

    // Add UI-specific operations
    expectUIContains(text) {
        this.operations.push({type: 'expectUI', content: text, shouldExist: true});
        return this;
    }

    expectUINotContains(text) {
        this.operations.push({type: 'expectUI', content: text, shouldExist: false});
        return this;
    }

    expect(term) {
        const matcher = term instanceof RemoteTaskMatch ? term : new RemoteTaskMatch(term);
        this.operations.push({type: 'expect', matcher, shouldExist: true});
        return this;
    }

    expectNot(term) {
        const matcher = term instanceof RemoteTaskMatch ? term : new RemoteTaskMatch(term);
        this.operations.push({type: 'expect', matcher, shouldExist: false});
        return this;
    }

    async execute() {
        if (!puppeteer) {
            throw new Error('Puppeteer is required for web UI tests but is not installed. It should be available as it\'s in package.json');
        }

        await this.setup();

        try {
            const {inputs, runs} = this._categorizeOperations();

            // Set up event listeners for WebSocket messages
            await this.setupEventListeners();

            // Execute inputs and runs
            await this._executeInputOperations(inputs);
            await this._executeRunOperations(runs);

            // Run expectations for both WebSocket events and UI
            const expectations = this.operations.filter(op => op.type === 'expect');
            await this.waitForWebSocketExpectations(expectations);

            // Check UI expectations
            const uiExpectations = this.operations.filter(op => op.type === 'expectUI');
            await this.waitForUIExpectations(uiExpectations);

        } finally {
            await this.teardown();
        }
    }

    _categorizeOperations() {
        const ops = {input: [], run: [], expectUI: []};

        for (const op of this.operations) {
            if (ops[op.type] !== undefined) {
                ops[op.type].push(op);
            }
        }

        return ops;
    }

    async _executeInputOperations(inputs) {
        for (const op of inputs) {
            const inputStr = `${op.termStr}. %${op.freq};${op.conf}%`;
            await this.sendInputToUI(inputStr);
        }
    }

    async _executeRunOperations(runs) {
        for (const op of runs) {
            for (let i = 0; i < op.cycles; i++) {
                await this.sendInputToUI('*step');
            }
        }
    }

    async setup() {
        await this.startServer();
        await this.startUIServer(); // Start UI server before launching browser
        await this.launchBrowser();
        await this.openWebUI();
    }

    async startUIServer() {
        this.uiServerProcess = await ProcessManager.startProcess({
            command: 'npx',
            args: ['vite', 'dev', '--port', this.uiPort.toString(), '--host'],
            cwd: join(__dirname, '../../../ui'),
            env: {
                ...process.env,
                VITE_WS_HOST: 'localhost',
                VITE_WS_PORT: this.port.toString(), // Use the NAR WebSocket port
                VITE_WS_PATH: '/ws',
                NODE_ENV: 'development'
            },
            readyCondition: (str) =>
                str.includes(`http://localhost:${this.uiPort}`) ||
                str.includes(`Local:   http://localhost:${this.uiPort}`),
            stderrHandler: (data) => {
                const str = data.toString();
                if (!str.includes('ExperimentalWarning')) {
                    console.error(`[UI-ERROR] ${str.trim()}`);
                }
            }
        });
    }

    async startServer() {
        const serverScript = `
import {NAR} from '../nar/NAR.js';
import {WebSocketMonitor} from '../server/WebSocketMonitor.js';

async function startServer() {
  const nar = new NAR();
  await nar.initialize();

  const monitor = new WebSocketMonitor({port: ${this.port}});
  await monitor.start();
  monitor.listenToNAR(nar);

  console.log('WebSocket monitoring server started on ws://localhost:${this.port}/ws');
}

startServer().catch(console.error);
        `;

        const tempScriptPath = await ProcessManager.createTempScript(serverScript, __dirname, `temp-server-${this.port}`);

        this.serverProcess = await ProcessManager.startProcess({
            command: 'node',
            args: [tempScriptPath],
            cwd: join(__dirname, '../../'),
            env: {...process.env, WS_PORT: this.port.toString(), NODE_ENV: 'test'},
            readyCondition: (str) => str.includes('WebSocket monitoring server started'),
            stdoutHandler: () => {
                // Clean up temp file after server starts
                setTimeout(() => ProcessManager.cleanupTempFile(tempScriptPath), 1000);
            },
            stderrHandler: (data) => {
                const str = data.toString();
                console.error(`Server stderr: ${str}`);
                if (str.includes('EADDRINUSE')) {
                    throw new Error(`Port ${this.port} is already in use`);
                }
            }
        });
    }

    async teardown() {
        await this.closeBrowser();
        await Promise.all([
            ProcessManager.stopProcess(this.serverProcess),
            ProcessManager.stopProcess(this.uiServerProcess)
        ]);
    }

    async launchBrowser() {
        // Always use --no-sandbox for better compatibility in containerized environments
        this.browser = await puppeteer.launch({
            headless: this.isHeadless,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-web-security']
        });
        this.page = await this.browser.newPage();
    }

    async openWebUI() {
        // Determine if the UI exists in the ui directory
        const uiPath = join(__dirname, '../../../ui');
        try {
            await fs.access(uiPath);
            // Use the dynamically assigned UI port
            await this.page.goto(`http://localhost:${this.uiPort}`); // Use the dynamically assigned port

            // Wait a bit for the page to load and establish WebSocket connection
            await this.page.waitForNetworkIdle();
        } catch (e) {
            // If no UI directory, just open an empty page for testing
            await this.page.goto('about:blank');
            console.warn('UI directory not found, skipping UI tests');
        }
    }

    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async setupEventListeners() {
        // Inject WebSocket connection to monitor events
        await this.page.evaluateOnNewDocument((port) => {
            // Create a WebSocket connection to monitor events
            // Store WebSocket connection in a global variable so it persists
            window.narWebSocket = new WebSocket(`ws://localhost:${port}/ws`);

            // Store received messages in a global array
            window.narWebSocketMessages = [];
            window.narWebSocketIsConnected = false;

            window.narWebSocket.onopen = function(event) {
                console.log('Connected to NAR WebSocket');
                window.narWebSocketIsConnected = true;

                // Subscribe to events when connected
                window.narWebSocket.send(JSON.stringify({
                    type: 'subscribe',
                    eventTypes: ['all']
                }));
            };

            window.narWebSocket.onmessage = function(event) {
                try {
                    const message = JSON.parse(event.data);
                    window.narWebSocketMessages.push(message);

                    // Trigger custom event for test expectations
                    const customEvent = new CustomEvent('narMessageReceived', {
                        detail: message
                    });
                    document.dispatchEvent(customEvent);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            window.narWebSocket.onerror = function(error) {
                console.error('WebSocket error:', error);
            };

            window.narWebSocket.onclose = function(event) {
                console.log('WebSocket connection closed:', event.code, event.reason);
                window.narWebSocketIsConnected = false;
            };
        }, this.port);
    }

    async sendInputToUI(inputStr) {
        if (this.page) {
            // Wait for the REPL input field to be available
            await this.page.waitForSelector('#repl-input', { timeout: 5000 });

            // Fill the input field with the Narsese string
            await this.page.type('#repl-input', inputStr);

            // Press Enter to submit
            await this.page.keyboard.press('Enter');

            // Small delay to allow processing
            await this.page.waitForTimeout(100);
        }
    }

    async waitForWebSocketExpectations(expectations) {
        for (const exp of expectations) {
            // Since we can't run async code in the browser context, let's use a polling approach
            const startTime = Date.now();
            const timeout = 15000; // 15 seconds

            while (Date.now() - startTime < timeout) {
                // Get all WebSocket messages from the page
                const messages = await this.page.evaluate(() => window.narWebSocketMessages || []);

                // Check if any message matches the expectation
                const foundMatch = messages.some(message =>
                    this._checkMessageForExpectation(message, exp.matcher.termFilter, exp.shouldExist)
                );

                if (foundMatch === exp.shouldExist) {
                    break; // Expectation satisfied
                }

                // Wait a bit before checking again
                await this.page.waitForTimeout(100);
            }

            // If we get here and didn't find a match for "should exist" case, it's an error
            if (exp.shouldExist) {
                const messages = await this.page.evaluate(() => window.narWebSocketMessages || []);
                const hasExpectedMessage = messages.some(msg => JSON.stringify(msg).includes(exp.matcher.termFilter));

                if (!hasExpectedMessage) {
                    throw new Error(`Expected task not found: ${exp.matcher.termFilter} after ${timeout}ms`);
                }
            }
        }
    }

    _checkMessageForExpectation(message, termFilter, shouldExist) {
        if (message.type && (message.type === 'event' || message.type.includes('task') || message.type.includes('reasoning'))) {
            // Extract task data from different possible formats
            const taskData = message.data?.data?.task ||
                           message.data?.task ||
                           message.data ||
                           message.payload?.task ||
                           message.payload;

            if (taskData) {
                // For this check, we'll need to do a simpler string-based match
                // since we can't call the async matches method from the page context
                const taskStr = JSON.stringify(taskData);

                if (taskStr.includes(termFilter)) {
                    return shouldExist; // Found what we're looking for
                } else if (!shouldExist) {
                    // If we're looking for "not exists" and didn't find it, that's success
                    return true;
                }
            }
        }
        return false;
    }

    async waitForUIExpectations(uiExpectations) {
        for (const exp of uiExpectations) {
            if (!this.page) continue;

            if (exp.shouldExist) {
                await this.page.waitForFunction(({content}) =>
                    document.body.textContent.includes(content),
                {content: exp.content}, {timeout: 5000});
            } else {
                // For "not contains", we need to check after a short delay
                await new Promise(resolve => setTimeout(resolve, 1000));
                const pageContent = await this.page.textContent('body');
                if (pageContent.includes(exp.content)) {
                    throw new Error(`UI unexpectedly contains: ${exp.content}`);
                }
            }
        }
    }
}