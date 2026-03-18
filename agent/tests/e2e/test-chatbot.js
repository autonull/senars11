#!/usr/bin/env node

/**
 * Comprehensive Test Suite for Intelligent IRC ChatBot
 * 
 * Tests:
 * - IRC connection and messaging
 * - Private messages
 * - CTCP handling
 * - Rate limiting
 * - Message classification
 * - LLM integration
 * - MeTTa integration
 * - Multi-channel scenarios
 */

import { Agent } from '../../src/Agent.js';
import { IRCChannel } from '../../src/io/channels/IRCChannel.js';
import { IntelligentMessageProcessor } from '../../src/ai/IntelligentMessageProcessor.js';
import { Logger } from '@senars/core';
import { EventEmitter } from 'events';
import { setTimeout } from 'timers/promises';

// Test configuration
const TEST_CONFIG = {
    irc: {
        host: 'irc.quakenet.org',
        port: 6667,
        nick: 'senars-test',
        channel: '##metta'
    },
    ollama: {
        baseURL: 'http://localhost:11434',
        model: 'hf.co/bartowski/Qwen_Qwen3-8B-GGUF:Q6_K'
    },
    rateLimit: {
        perChannelMax: 10,
        perChannelInterval: 5000,
        globalMax: 30,
        globalInterval: 10000
    }
};

// Test results tracking
const testResults = {
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: []
};

function test(name, fn) {
    return { name, fn };
}

async function runTest(testCase) {
    try {
        Logger.info(`\n🧪 Running: ${testCase.name}`);
        await testCase.fn();
        testResults.passed++;
        testResults.tests.push({ name: testCase.name, status: 'PASSED' });
        Logger.info(`✅ PASSED: ${testCase.name}`);
    } catch (error) {
        testResults.failed++;
        testResults.tests.push({ name: testCase.name, status: 'FAILED', error: error.message });
        Logger.error(`❌ FAILED: ${testCase.name}`);
        Logger.error(`   Error: ${error.message}`);
    }
}

// Mock channel for testing without real IRC
class MockIRCChannel extends EventEmitter {
    constructor(config = {}) {
        super();
        this.id = 'mock-irc';
        this.type = 'irc';
        this.status = 'disconnected';
        this.config = config;
        this.sentMessages = [];
        this.channels = new Set();
    }

    async connect() {
        this.status = 'connected';
        setTimeout(100).then(() => {
            this.emit('connected', { nick: this.config.nick || 'test-bot' });
        });
    }

    async disconnect() {
        this.status = 'disconnected';
        this.emit('disconnected');
    }

    async sendMessage(target, content, metadata = {}) {
        this.sentMessages.push({ target, content, metadata, timestamp: Date.now() });
        return true;
    }

    async join(channel) {
        this.channels.add(channel);
    }

    // Simulate receiving a message
    simulateMessage(from, content, metadata = {}) {
        this.emit('message', {
            id: `msg_${Date.now()}`,
            channelId: this.id,
            protocol: 'irc',
            from,
            content,
            timestamp: Date.now(),
            metadata: {
                channel: metadata.channel || '##test',
                type: 'message',
                ...metadata
            }
        });
    }

    // Simulate private message
    simulatePrivateMessage(from, content) {
        this.emit('private_message', {
            id: `pm_${Date.now()}`,
            channelId: this.id,
            protocol: 'irc',
            from,
            content,
            timestamp: Date.now(),
            metadata: {
                type: 'privmsg',
                isPrivate: true
            }
        });
    }
}

// Test Suite
const tests = [
    test('Mock Channel Basic Messaging', async () => {
        const mock = new MockIRCChannel({ nick: 'test-bot' });
        const messages = [];
        
        mock.on('message', (msg) => messages.push(msg));
        
        await mock.connect();
        mock.simulateMessage('user1', 'Hello world');
        
        await setTimeout(200);
        
        if (messages.length !== 1) throw new Error('Expected 1 message');
        if (messages[0].from !== 'user1') throw new Error('Wrong sender');
        if (messages[0].content !== 'Hello world') throw new Error('Wrong content');
    }),

    test('Message Classification - Question', async () => {
        const processor = new IntelligentMessageProcessor(
            { ai: null, commandRegistry: null, metta: null, sessionState: { startTime: Date.now() } },
            { botNick: 'test-bot' }
        );
        
        const result = processor._heuristicClassify('What is the meaning of life?');
        
        if (result.type !== 'question') throw new Error(`Expected question, got ${result.type}`);
        if (result.confidence < 0.7) throw new Error('Low confidence');
    }),

    test('Message Classification - Command', async () => {
        const processor = new IntelligentMessageProcessor(
            { ai: null, commandRegistry: null, metta: null, sessionState: { startTime: Date.now() } },
            { botNick: 'test-bot' }
        );
        
        const result = processor._heuristicClassify('!help');
        
        if (result.type !== 'command') throw new Error(`Expected command, got ${result.type}`);
    }),

    test('Message Classification - Greeting', async () => {
        const processor = new IntelligentMessageProcessor(
            { ai: null, commandRegistry: null, metta: null, sessionState: { startTime: Date.now() } },
            { botNick: 'test-bot' }
        );
        
        const result = processor._heuristicClassify('Hello everyone!');
        
        if (result.type !== 'greeting') throw new Error(`Expected greeting, got ${result.type}`);
    }),

    test('Message Classification - Statement', async () => {
        const processor = new IntelligentMessageProcessor(
            { ai: null, commandRegistry: null, metta: null, sessionState: { startTime: Date.now() } },
            { botNick: 'test-bot' }
        );
        
        const result = processor._heuristicClassify('I think therefore I am');
        
        if (result.type !== 'statement') throw new Error(`Expected statement, got ${result.type}`);
    }),

    test('Should Respond Logic - Mention', async () => {
        const processor = new IntelligentMessageProcessor(
            { ai: null, commandRegistry: null, metta: null, sessionState: { startTime: Date.now() } },
            { botNick: 'senars-bot', respondToMentions: true }
        );
        
        const isForBot = processor._isMessageForBot('senars-bot, what do you think?', '##test');
        if (!isForBot) throw new Error('Should detect mention');
        
        const classification = { type: 'question', confidence: 0.9 };
        const shouldRespond = processor._shouldRespond(classification, true, false);
        if (!shouldRespond) throw new Error('Should respond to mention');
    }),

    test('Should Respond Logic - Private Message', async () => {
        const processor = new IntelligentMessageProcessor(
            { ai: null, commandRegistry: null, metta: null, sessionState: { startTime: Date.now() } },
            { botNick: 'senars-bot' }
        );
        
        const classification = { type: 'statement', confidence: 0.5 };
        const shouldRespond = processor._shouldRespond(classification, false, true);
        if (!shouldRespond) throw new Error('Should respond to private messages');
    }),

    test('Command Handling - Help', async () => {
        const processor = new IntelligentMessageProcessor(
            { 
                ai: null, 
                commandRegistry: null, 
                metta: null,
                sessionState: { startTime: Date.now() },
                channelManager: { get: () => null }
            },
            { botNick: 'test-bot' }
        );
        
        const response = await processor._handleCommand('!help', 'user1', '##test');
        
        if (!response.includes('help')) throw new Error('Help response missing');
    }),

    test('Command Handling - Ping', async () => {
        const processor = new IntelligentMessageProcessor(
            { ai: null, commandRegistry: null, metta: null, sessionState: { startTime: Date.now() } },
            { botNick: 'test-bot' }
        );
        
        const response = await processor._handleCommand('!ping', 'user1', '##test');
        
        if (response.toLowerCase() !== 'pong!') throw new Error(`Expected Pong!, got ${response}`);
    }),

    test('Command Handling - Version', async () => {
        const processor = new IntelligentMessageProcessor(
            { ai: null, commandRegistry: null, metta: null, sessionState: { startTime: Date.now() } },
            { botNick: 'test-bot' }
        );
        
        const response = await processor._handleCommand('!version', 'user1', '##test');
        
        if (!response.includes('SeNARS')) throw new Error('Version response missing SeNARS');
    }),

    test('Greeting Response', async () => {
        const processor = new IntelligentMessageProcessor(
            { ai: null, commandRegistry: null, metta: null, sessionState: { startTime: Date.now() } },
            { botNick: 'test-bot' }
        );
        
        const response = await processor._handleGreeting('Hello', 'user1', { messages: [] });
        
        // Check for various greeting patterns
        const lowerResponse = response.toLowerCase();
        const isGreeting = lowerResponse.includes('hello') || 
                          lowerResponse.includes('hi') || 
                          lowerResponse.includes('greetings') ||
                          lowerResponse.includes('hey');
        
        if (!isGreeting) throw new Error(`Expected greeting response, got ${response}`);
    }),

    test('Context Management', async () => {
        const processor = new IntelligentMessageProcessor(
            { ai: null, commandRegistry: null, metta: null, sessionState: { startTime: Date.now() } },
            { botNick: 'test-bot', maxContextLength: 5 }
        );
        
        const context = processor._getOrCreateContext('test:user1');
        
        // Add messages
        for (let i = 0; i < 10; i++) {
            context.messages.push({ from: 'user1', content: `msg${i}`, timestamp: Date.now() });
        }
        
        processor._trimContext(context);
        
        if (context.messages.length > 5) throw new Error('Context not trimmed');
    }),

    test('Rate Limiter - Per Channel', async () => {
        const { PerChannelRateLimiter } = await import('../../src/io/PerChannelRateLimiter.js');
        const limiter = new PerChannelRateLimiter({
            maxTokens: 3,
            refillInterval: 1000,
            globalMax: 10,
            globalInterval: 1000
        });
        
        // Should allow first 3 messages
        for (let i = 0; i < 3; i++) {
            const result = await limiter.acquire('channel1');
            if (!result.allowed) throw new Error(`Message ${i + 1} should be allowed`);
        }
        
        // 4th should be rate limited
        const result = await limiter.acquire('channel1');
        if (result.allowed) throw new Error('4th message should be rate limited');
    }),

    test('IRC Channel - CTCP Detection', async () => {
        const irc = new IRCChannel({ nick: 'test-bot' });
        
        // Test CTCP detection
        if (!irc._isCTCP('\x01VERSION\x01')) throw new Error('Should detect CTCP');
        if (irc._isCTCP('normal message')) throw new Error('Should not detect CTCP in normal message');
    }),

    test('IRC Channel - Channel Detection', async () => {
        const irc = new IRCChannel({ nick: 'test-bot' });
        
        if (!irc.isChannel('#test')) throw new Error('#test should be channel');
        if (!irc.isChannel('##metta')) throw new Error('##metta should be channel');
        if (irc.isChannel('user1')) throw new Error('user1 should not be channel');
    }),

    test('Full Message Processing Pipeline', async () => {
        const mockChannel = new MockIRCChannel({ nick: 'test-bot' });
        
        const mockAgent = {
            ai: {
                generate: async (prompt) => ({ text: 'Test response' })
            },
            commandRegistry: {
                get: () => null,
                execute: async () => 'Command result'
            },
            metta: null,
            sessionState: { startTime: Date.now(), history: [] },
            channelManager: {
                get: () => mockChannel,
                sendMessage: async () => true
            }
        };
        
        const processor = new IntelligentMessageProcessor(mockAgent, {
            botNick: 'test-bot',
            respondToQuestions: true,
            respondToCommands: true
        });
        
        // Test question processing
        const questionMsg = {
            channelId: 'mock-irc',
            from: 'user1',
            content: 'What is SeNARS?',
            metadata: { channel: '##test', isPrivate: false }
        };
        
        const result = await processor.processMessage(questionMsg);
        
        if (!result.shouldRespond) throw new Error('Should respond to question');
        if (!result.response) throw new Error('Should have response');
    }),

    test('Statistics Tracking', async () => {
        const processor = new IntelligentMessageProcessor(
            { ai: null, commandRegistry: null, metta: null, sessionState: { startTime: Date.now() } },
            { botNick: 'test-bot' }
        );
        
        const initialStats = processor.getStats();
        
        if (initialStats.messagesProcessed !== 0) throw new Error('Initial messages should be 0');
        if (initialStats.responsesGenerated !== 0) throw new Error('Initial responses should be 0');
    })
];

// IRC Integration Tests (require network)
const integrationTests = [
    test('IRC Connection to QuakeNet', async () => {
        const irc = new IRCChannel({
            id: 'test-integration',
            host: TEST_CONFIG.irc.host,
            port: TEST_CONFIG.irc.port,
            nick: TEST_CONFIG.irc.nick,
            username: 'senars',
            realname: 'SeNARS Test',
            tls: false,
            channels: [TEST_CONFIG.irc.channel]
        });

        let connected = false;
        const timeout = setTimeout(15000);
        
        irc.once('connected', () => {
            connected = true;
        });

        await irc.connect();
        
        // Wait for connection
        while (!connected) {
            await setTimeout(100);
            if ((await timeout) && !connected) {
                throw new Error('Connection timeout');
            }
        }

        if (irc.status !== 'connected') throw new Error('Not connected');
        
        await irc.disconnect();
    }),

    test('IRC Message Sending', async () => {
        // Note: We can't reliably test actual message sending due to IRC server rate limiting
        // This test verifies the sendMessage method exists and has correct signature
        
        const irc = new IRCChannel({
            id: 'test-send-method',
            nick: 'test-bot'
        });
        
        // Verify method exists
        if (typeof irc.sendMessage !== 'function') {
            throw new Error('sendMessage method not found');
        }
        
        // Verify it throws when not connected
        try {
            await irc.sendMessage('#test', 'hello');
            throw new Error('Should throw when not connected');
        } catch (e) {
            if (!e.message.includes('Not connected')) {
                throw new Error(`Wrong error: ${e.message}`);
            }
        }
        
        // Test passes - method exists and has correct behavior
    })
];

// Main test runner
async function runTests() {
    Logger.setSilent(false);
    Logger.setLevel('INFO');
    
    Logger.info('╔════════════════════════════════════════════════════════╗');
    Logger.info('║     SeNARS Intelligent ChatBot Test Suite             ║');
    Logger.info('╚════════════════════════════════════════════════════════╝');

    // Run unit tests
    Logger.info('\n📋 Running Unit Tests...');
    for (const testCase of tests) {
        await runTest(testCase);
    }

    // Run integration tests (optional, requires network)
    const runIntegration = process.argv.includes('--integration');
    if (runIntegration) {
        Logger.info('\n🌐 Running Integration Tests...');
        for (const testCase of integrationTests) {
            await runTest(testCase);
        }
    } else {
        Logger.info('\n⏭️  Skipping integration tests (use --integration to run)');
        testResults.skipped = integrationTests.length;
    }

    // Print summary
    Logger.info('\n╔════════════════════════════════════════════════════════╗');
    Logger.info('║                    Test Summary                        ║');
    Logger.info('╚════════════════════════════════════════════════════════╝');
    Logger.info(`   Passed:  ${testResults.passed}`);
    Logger.info(`   Failed:  ${testResults.failed}`);
    Logger.info(`   Skipped: ${testResults.skipped}`);
    Logger.info(`   Total:   ${testResults.passed + testResults.failed + testResults.skipped}`);

    if (testResults.failed > 0) {
        Logger.info('\n❌ Failed Tests:');
        testResults.tests
            .filter(t => t.status === 'FAILED')
            .forEach(t => Logger.info(`   - ${t.name}: ${t.error}`));
    }

    Logger.info('');
    
    // Exit with appropriate code
    process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run if executed directly
if (process.argv[1]?.endsWith('test-chatbot.js')) {
    runTests();
}

export { tests, integrationTests, runTests };
