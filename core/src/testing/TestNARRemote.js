/**
 * @file TestNARRemote.js
 * @description Test framework for NAR functionality using WebSocket pathway
 */

import {spawn} from 'child_process';
import {fileURLToPath} from 'url';
import {dirname, join} from 'path';
import {writeFile} from 'fs/promises';
import {WebSocket} from 'ws';
import {RemoteTaskMatch} from './TaskMatch.js';
import {ConsoleFormatter, VirtualConsole, VirtualGraph} from '@senars/agent';

export {RemoteTaskMatch};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class TestNARRemote {
    constructor() {
        this.operations = [];
        this.serverProcess = null;
        this.client = null;
        this.taskQueue = [];
        this.port = 8081 + Math.floor(Math.random() * 100);

        // Virtual UI components
        this.virtualGraph = new VirtualGraph();
        this.virtualConsole = new VirtualConsole(this.virtualGraph);
    }

    input(termStr, freq = 1.0, conf = 0.9) {
        this.operations.push({type: 'input', termStr, freq, conf});
        return this;
    }

    command(text, mode = 'narsese') {
        this.operations.push({type: 'command', text, mode});
        return this;
    }

    run(cycles = 1) {
        this.operations.push({type: 'run', cycles});
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

    expectLog(pattern) {
        this.operations.push({type: 'expectLog', pattern, shouldExist: true});
        return this;
    }

    expectNode(idOrTerm) {
        this.operations.push({type: 'expectNode', idOrTerm, shouldExist: true});
        return this;
    }

    async execute(options = {}) {
        const {verbose = false, recordPath = null} = options;
        this.verbose = verbose;
        await this.setup();
        let error = null;

        try {
            // Process operations
            for (const op of this.operations) {
                switch (op.type) {
                    case 'input':
                        const inputStr = `${op.termStr}. %${op.freq};${op.conf}%`;
                        await this.sendNarseseAndWait(inputStr);
                        break;
                    case 'command':
                        await this.sendCommand(op.text, op.mode);
                        break;
                    case 'run':
                        for (let i = 0; i < op.cycles; i++) {
                            await this.sendNarsese('*step');
                        }
                        break;
                }
            }

            // Process expectations
            const expectations = this.operations.filter(op => op.type.startsWith('expect'));
            if (expectations.length > 0) {
                await this.waitForExpectationsEventDriven(expectations);
            }

        } catch (e) {
            error = e;
            throw e;
        } finally {
            if (recordPath) {
                await this.exportRecording(recordPath);
            }
            if (this.verbose || error) {
                this.printLogs();
            }
            await this.teardown();
        }
    }

    async exportRecording(filepath) {
        if (!filepath) return;
        try {
            const logs = this.virtualConsole.getLogs();
            const output = {
                timestamp: new Date().toISOString(),
                operations: this.operations,
                logs: logs
            };
            await writeFile(filepath, JSON.stringify(output, null, 2));
            if (this.verbose) process.stdout.write(`Recording saved to ${filepath}\n`);
        } catch (e) {
            process.stderr.write(`Failed to save recording to ${filepath}: ${e}\n`);
        }
    }

    printLogs() {
        const logs = this.virtualConsole.getLogs();
        if (logs.length > 0) {
            process.stdout.write('\n=== Virtual Console Logs ===\n');
            logs.forEach(log => {
                process.stdout.write(`${ConsoleFormatter.format(log)}\n`);
            });
            process.stdout.write('============================\n\n');
        }
    }

    async setup() {
        await this.startServer();
        await this.connectClient();
    }

    async teardown() {
        await this.disconnectClient();
        await this.stopServer();
    }

    startServer() {
        return new Promise((resolve, reject) => {
            this.serverProcess = spawn('node', [join(__dirname, '../../../scripts/ui/launcher.js'), '--no-ui', '--ws-port', this.port.toString()], {
                stdio: 'pipe',
                env: {...process.env, NODE_ENV: 'test'},
            });

            this.serverProcess.stdout.on('data', (data) => {
                if (data.toString().includes('WebSocket server started successfully')) {
                    resolve();
                }
            });

            this.serverProcess.stderr.on('data', (data) => {
                console.error(`Server stderr: ${data}`);
                // Don't reject immediately, wait for close or error
            });

            this.serverProcess.on('error', (err) => {
                reject(err);
            });
        });
    }

    stopServer() {
        return new Promise((resolve) => {
            if (this.serverProcess) {
                this.serverProcess.removeAllListeners();

                const timeout = setTimeout(() => {
                    this.serverProcess.kill('SIGKILL');
                }, 3000);

                this.serverProcess.on('close', () => {
                    clearTimeout(timeout);
                    resolve();
                });

                if (this.client && this.client.readyState === WebSocket.OPEN) {
                    this.sendNarsese('*exit').catch(() => {
                        this.serverProcess.kill('SIGTERM');
                    });
                } else {
                    this.serverProcess.kill('SIGTERM');
                }
            } else {
                resolve();
            }
        });
    }

    connectClient() {
        return new Promise((resolve, reject) => {
            this.client = new WebSocket(`ws://localhost:${this.port}/ws?session=test`);

            this.client.on('open', () => {
                this.client.on('message', (data) => {
                    try {
                        const message = JSON.parse(data);
                        this._processIncomingMessage(message);
                    } catch (e) {
                        console.error('Failed to parse incoming message:', e);
                    }
                });
                resolve();
            });

            this.client.on('error', (error) => {
                reject(error);
            });
        });
    }

    _processIncomingMessage(message) {
        if (message.type === 'eventBatch' && Array.isArray(message.data)) {
            message.data.forEach(event => this._processSingleMessage(event));
        } else {
            this._processSingleMessage(message);
        }
    }

    _processSingleMessage(message) {
        // Update Virtual UI
        this.virtualGraph.updateFromMessage(message);
        this.virtualConsole.processMessage(message);

        // Update task queue
        if (message.type === 'task.added' || message.type === 'task.processed' || message.type === 'reasoning.derivation') {
            const task = message.data?.derivedTask || message.data?.task;
            if (task) {
                this.taskQueue.push(task);
            }
        }
    }

    disconnectClient() {
        return new Promise((resolve) => {
            if (this.client) {
                this.client.removeAllListeners();
                if (this.client.readyState === WebSocket.OPEN) {
                    this.client.close();
                }
                resolve();
            } else {
                resolve();
            }
        });
    }

    sendNarsese(narseseString) {
        return new Promise((resolve, reject) => {
            let message;
            if (narseseString.startsWith('*')) {
                message = {
                    sessionId: 'test',
                    type: `control/${narseseString.substring(1)}`,
                    payload: {}
                };
            } else {
                message = {
                    sessionId: 'test',
                    type: 'reason/step', // Keeping for legacy unless command() is used
                    payload: {text: narseseString}
                };
            }

            this.client.send(JSON.stringify(message), (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    sendNarseseAndWait(narseseString) {
        let message;
        if (narseseString.startsWith('*')) {
            message = {
                sessionId: 'test',
                type: `control/${narseseString.substring(1)}`,
                payload: {}
            };
        } else {
            message = {
                sessionId: 'test',
                type: 'reason/step',
                payload: {text: narseseString}
            };
        }

        const matcher = (msg) => {
            if (msg.type === 'narsese.result' || msg.type === 'control.result' || msg.type === 'narsese.error') {
                return true;
            }
            return false;
        };

        return this.sendMessageAndWait(message, matcher);
    }

    sendCommand(command, mode) {
        return new Promise((resolve, reject) => {
            const messageType = mode === 'agent' ? 'agent/input' : 'narseseInput';
            const message = {
                type: messageType,
                payload: {input: command} // Check payload structure in ClientMessageHandlers
            };

            this.client.send(JSON.stringify(message), (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    sendCommandAndWait(command, mode) {
        const messageType = mode === 'agent' ? 'agent/input' : 'narseseInput';
        const message = {
            type: messageType,
            payload: {input: command}
        };

        const matcher = (msg) => {
            if (msg.type === 'narsese.result' || msg.type === 'agent.result' || msg.type === 'narsese.error') {
                return true;
            }
            return false;
        };

        return this.sendMessageAndWait(message, matcher);
    }

    sendMessageAndWait(message, matcher, timeout = 10000) {
        return new Promise((resolve, reject) => {
            let listener = null;

            const cleanup = () => {
                if (listener) {
                    this.client.removeListener('message', listener);
                }
                clearTimeout(timer);
            };

            const timer = setTimeout(() => {
                cleanup();
                reject(new Error(`Timeout waiting for response matching expectation`));
            }, timeout);

            listener = (data) => {
                try {
                    const msg = JSON.parse(data);
                    // Handle batch
                    const messages = msg.type === 'eventBatch' ? msg.data : [msg];

                    for (const m of messages) {
                        if (matcher(m)) {
                            cleanup();
                            resolve(m);
                            return;
                        }
                    }
                } catch (e) {
                    // ignore
                }
            };

            this.client.on('message', listener);

            this.client.send(JSON.stringify(message), (err) => {
                if (err) {
                    cleanup();
                    reject(err);
                }
            });
        });
    }

    async waitForExpectationsEventDriven(expectations) {
        const expectationPromises = expectations.map(exp => {
            return new Promise((resolve, reject) => {
                let listener = null;

                const cleanup = () => {
                    if (listener) {
                        this.client.removeListener('message', listener);
                    }
                    clearTimeout(timeout);
                };

                const safeResolve = () => {
                    cleanup();
                    resolve();
                };

                const safeReject = (err) => {
                    cleanup();
                    reject(err);
                };

                const timeout = setTimeout(() => {
                    safeReject(new Error(`Expectation timeout: ${JSON.stringify(exp)}`));
                }, 20000);

                const checkState = () => {
                    // Check task queue (legacy)
                    if (exp.type === 'expect') {
                        for (const task of this.taskQueue) {
                            if (exp.matcher.matches(task)) {
                                if (exp.shouldExist) {
                                    safeResolve();
                                    return;
                                } else {
                                    safeReject(new Error(`Unexpected task found: ${exp.matcher.termFilter}`));
                                    return;
                                }
                            }
                        }
                        if (!exp.shouldExist && this.taskQueue.length > 0) {
                            safeResolve();

                        }
                    }
                    // Check logs
                    else if (exp.type === 'expectLog') {
                        const logs = this.virtualConsole.getLogs();
                        const found = logs.some(log => {
                            if (typeof exp.pattern === 'string') {
                                return typeof log.content === 'string' && log.content.includes(exp.pattern);
                            } else if (exp.pattern instanceof RegExp) {
                                return typeof log.content === 'string' && exp.pattern.test(log.content);
                            }
                            return false;
                        });

                        if (found && exp.shouldExist) {
                            safeResolve();

                        }
                    }
                    // Check nodes
                    else if (exp.type === 'expectNode') {
                        if (this.virtualGraph.hasNode(exp.idOrTerm)) {
                            if (exp.shouldExist) {
                                safeResolve();

                            }
                        }
                    }
                };

                checkState();

                // Listen for updates
                if (exp.shouldExist) {
                    listener = (data) => {
                        // Trigger check
                        checkState();
                    };

                    this.client.on('message', listener);
                }
            });
        });

        await Promise.all(expectationPromises);
    }
}
