#!/usr/bin/env node

/**
 * IRC Integration Test — Full pipeline over real TCP
 *
 * Tests the complete message flow:
 *   EmbeddedIRCServer (TCP) → irc-framework → IRCChannel → Embodiment →
 *   EmbodimentBus → AgentMessageQueue → MeTTaLoop → respond → IRCChannel → TCP
 *
 * Also validates:
 *   - Boundary validation: server messages (no nick) silently dropped
 *   - Channel vs private message routing
 *   - Join/part event handling
 *   - Multi-user channel simulation (preparation for multi-agent tests)
 *
 * Usage:
 *   NODE_NO_WARNINGS=1 NODE_OPTIONS=--experimental-vm-modules npx jest \
 *     --config jest.integration.config.js bot/tests/integration/irc-integration.test.js
 */
import { IRCChannel } from '@senars/agent/io/index.js';
import { EmbodimentBus } from '@senars/agent/io/index.js';
import { Logger } from '@senars/core';
import { EmbeddedIRCServer } from '@senars/bot/irc';

Logger.setLevel('WARN'); // quiet during tests

const BOT_NICK = 'TestBot';
const TEST_CHANNEL = '#testchan';
const TEST_USER = 'Alice';
const TEST_USER2 = 'Bob';

/** Wait for an event on an EventEmitter with timeout */
function waitForEvent(emitter, event, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            emitter.removeListener(event, handler);
            reject(new Error(`Timeout waiting for event: ${event}`));
        }, timeout);
        const handler = (...args) => {
            clearTimeout(timer);
            resolve(args[0]);
        };
        emitter.once(event, handler);
    });
}

/** Create a minimal IRCChannel connected to the mock server */
async function createIRCChannel(mockServer, nick = BOT_NICK, channel = TEST_CHANNEL) {
    const ircChannel = new IRCChannel({
        id: 'irc',
        host: '127.0.0.1',
        port: mockServer.port,
        nick,
        username: nick.toLowerCase(),
        realname: `${nick} Test Bot`,
        channels: [channel],
        rateLimit: { interval: 100 },
    });

    // Wait for the bot's own join to complete
    const joinPromise = new Promise((resolve) => {
        const handler = (event) => {
            if (event.nick === nick) {
                ircChannel.removeListener('user_joined', handler);
                resolve();
            }
        };
        ircChannel.on('user_joined', handler);
    });

    await ircChannel.connect();
    await waitForEvent(ircChannel, 'connected', 3000);
    await joinPromise; // wait until bot joined the channel
    return ircChannel;
}

describe('IRC Integration — Mock Server Pipeline', () => {
    let mockServer;
    let bus;
    let ircChannel;

    beforeEach(async () => {
        mockServer = new EmbeddedIRCServer();
        await mockServer.start();
        bus = new EmbodimentBus();
    });

    afterEach(async () => {
        if (ircChannel?.status === 'connected') {
            await ircChannel.disconnect();
        }
        await mockServer.stop();
    });

    /* ── 1. Server lifecycle ────────────────────────────────────── */

    test('mock server starts and accepts connections', async () => {
        expect(mockServer.port).toBeGreaterThan(0);

        ircChannel = await createIRCChannel(mockServer);
        expect(ircChannel.status).toBe('connected');
        expect(mockServer.clientCount).toBe(1);
    });

    test('mock server registers client and sends MOTD', async () => {
        ircChannel = await createIRCChannel(mockServer);

        // The 'connected' event fires after 001 (welcome)
        expect(ircChannel.status).toBe('connected');
    });

    /* ── 2. Channel messaging — full TCP pipeline ───────────────── */

    test('receives channel messages from simulated user', async () => {
        ircChannel = await createIRCChannel(mockServer);
        bus.register(ircChannel);

        const messagePromise = waitForEvent(bus, 'message', 3000);

        // Simulate a user sending a channel message via TCP
        mockServer.simulateUserMessage(TEST_USER, TEST_CHANNEL, 'Hello everyone!');

        const msg = await messagePromise;
        expect(msg.from).toBe(TEST_USER);
        expect(msg.content).toBe('Hello everyone!');
        expect(msg.metadata.channel).toBe(TEST_CHANNEL);
        expect(msg.metadata.isPrivate).toBe(false);
        expect(msg.embodimentId).toBe('irc');
    });

    test('receives private messages', async () => {
        ircChannel = await createIRCChannel(mockServer);
        bus.register(ircChannel);

        const messagePromise = waitForEvent(bus, 'message', 3000);

        mockServer.simulatePrivateMessage(TEST_USER, BOT_NICK, 'Secret message');

        const msg = await messagePromise;
        expect(msg.from).toBe(TEST_USER);
        expect(msg.content).toBe('Secret message');
        expect(msg.metadata.isPrivate).toBe(true);
    });

    test('bot responses are sent back through the wire', async () => {
        ircChannel = await createIRCChannel(mockServer);
        bus.register(ircChannel);

        // Wait for the message event, then respond
        const messagePromise = waitForEvent(bus, 'message', 3000);

        mockServer.simulateUserMessage(TEST_USER, TEST_CHANNEL, 'Hi there!');

        const msg = await messagePromise;
        expect(msg.from).toBe(TEST_USER);

        // Bot responds via the embodiment's sendMessage
        await ircChannel.sendMessage(TEST_CHANNEL, `Hello ${msg.from}!`);

        // Give the TCP server time to process
        await new Promise(r => setTimeout(r, 50));

        const captured = mockServer.capturedMessages;
        const botResponse = captured.find(m => m.from === BOT_NICK && m.content?.includes('Hello'));
        expect(botResponse).toBeDefined();
    });

    /* ── 3. Boundary validation — Phase 2 of FIX.md ─────────────── */

    test('server messages with no nick are dropped at IRCChannel level', async () => {
        ircChannel = await createIRCChannel(mockServer);
        bus.register(ircChannel);

        // Simulate a server-only message (no source nick)
        mockServer.simulateServerMessage(BOT_NICK, ':irc.localhost 376 TestBot :End of MOTD');

        // Wait briefly — no message should arrive on the bus
        const messagePromise = waitForEvent(bus, 'message', 500);

        await expect(messagePromise).rejects.toThrow(/Timeout/);
    });

    test('messages with no from are dropped by Embodiment.emitMessage', async () => {
        ircChannel = await createIRCChannel(mockServer);
        bus.register(ircChannel);

        // Directly test the Embodiment boundary validation
        let received = 0;
        bus.on('message', () => { received++; });

        // Message with no 'from' field
        ircChannel.emitMessage({ content: 'orphaned message' });

        await new Promise(r => setTimeout(r, 50));
        expect(received).toBe(0);
    });

    test('null message is dropped', async () => {
        ircChannel = await createIRCChannel(mockServer);
        bus.register(ircChannel);

        let received = 0;
        bus.on('message', () => { received++; });

        ircChannel.emitMessage(null);
        ircChannel.emitMessage(undefined);
        ircChannel.emitMessage({});

        await new Promise(r => setTimeout(r, 50));
        expect(received).toBe(0);
    });

    /* ── 4. Multi-user channel (multi-agent foundation) ─────────── */

    test('multiple users in same channel, messages routed correctly', async () => {
        ircChannel = await createIRCChannel(mockServer);
        bus.register(ircChannel);

        const messages = [];
        bus.on('message', (msg) => messages.push(msg));

        // Simulate two users in the same channel
        mockServer.simulateUserMessage(TEST_USER, TEST_CHANNEL, 'Hello from Alice!');
        await new Promise(r => setTimeout(r, 100));

        mockServer.simulateUserMessage(TEST_USER2, TEST_CHANNEL, 'Hello from Bob!');
        await new Promise(r => setTimeout(r, 100));

        expect(messages).toHaveLength(2);
        expect(messages[0].from).toBe(TEST_USER);
        expect(messages[0].content).toBe('Hello from Alice!');
        expect(messages[1].from).toBe(TEST_USER2);
        expect(messages[1].content).toBe('Hello from Bob!');
    });

    test('mixed channel and private messages from same user', async () => {
        ircChannel = await createIRCChannel(mockServer);
        bus.register(ircChannel);

        const messages = [];
        bus.on('message', (msg) => messages.push(msg));

        mockServer.simulateUserMessage(TEST_USER, TEST_CHANNEL, 'Public message');
        await new Promise(r => setTimeout(r, 100));

        mockServer.simulatePrivateMessage(TEST_USER, BOT_NICK, 'Private message');
        await new Promise(r => setTimeout(r, 100));

        expect(messages).toHaveLength(2);
        expect(messages[0].metadata.isPrivate).toBe(false);
        expect(messages[1].metadata.isPrivate).toBe(true);
    });

    /* ── 5. Join/part events ────────────────────────────────────── */

    test('user join event is emitted', async () => {
        ircChannel = await createIRCChannel(mockServer);
        bus.register(ircChannel);

        // Filter for the specific user join (bot's own join fires first)
        const joinPromise = new Promise((resolve) => {
            const handler = (event) => {
                if (event.nick === TEST_USER) {
                    ircChannel.removeListener('user_joined', handler);
                    resolve(event);
                }
            };
            ircChannel.on('user_joined', handler);
        });

        mockServer.simulateJoin(TEST_USER, TEST_CHANNEL);

        const joinEvent = await joinPromise;
        expect(joinEvent.nick).toBe(TEST_USER);
        expect(joinEvent.channel).toBe(TEST_CHANNEL);
    });

    /* ── 6. MessageEnvelope validation — Phase 3 of FIX.md ──────── */

    test('AgentMessageQueue wraps messages in validated envelopes', async () => {
        ircChannel = await createIRCChannel(mockServer);
        bus.register(ircChannel);

        // Import AgentMessageQueue and MessageEnvelope
        const { AgentMessageQueue } = await import('@senars/agent/metta/index.js');
        const { MessageEnvelope } = await import('@senars/agent/metta/index.js');

        const mockCap = () => true;
        const msgQueue = new AgentMessageQueue(bus, mockCap);

        const messagePromise = waitForEvent(bus, 'message', 3000);

        mockServer.simulateUserMessage(TEST_USER, TEST_CHANNEL, 'Envelope test');

        await messagePromise;

        // Dequeue should return a MessageEnvelope
        const envelope = await msgQueue.dequeue();
        expect(envelope).toBeInstanceOf(MessageEnvelope);
        expect(envelope.from).toBe(TEST_USER);
        expect(envelope.content).toBe('Envelope test');
        expect(envelope.embodimentId).toBe('irc');
        expect(envelope.text).toContain(TEST_USER);
        expect(envelope.target).toBe(TEST_CHANNEL);
    });

    test('malformed message is rejected by MessageEnvelope', async () => {
        ircChannel = await createIRCChannel(mockServer);
        bus.register(ircChannel);

        const { AgentMessageQueue } = await import('@senars/agent/metta/index.js');

        const mockCap = () => true;
        const msgQueue = new AgentMessageQueue(bus, mockCap);

        // Send a valid message first so the queue has something
        mockServer.simulateUserMessage(TEST_USER, TEST_CHANNEL, 'valid');
        await new Promise(r => setTimeout(r, 100));

        // Dequeue the valid message
        const envelope = await msgQueue.dequeue();
        expect(envelope.from).toBe(TEST_USER);

        // Now send a message that will be dropped by emitMessage boundary validation
        // (no 'from' field) — should not appear in the queue
        ircChannel.emitMessage({ content: 'no-from message' });
        await new Promise(r => setTimeout(r, 50));

        // Queue should be empty (no malformed message got through)
        expect(msgQueue._msgQueue.length).toBe(0);
    });

    /* ── 7. Response sanitization — Phase 7 of FIX.md ───────────── */

    test('empty response is not sent', async () => {
        ircChannel = await createIRCChannel(mockServer);
        bus.register(ircChannel);

        const capturedBefore = mockServer.capturedMessages.length;

        // Send empty string
        await ircChannel.sendMessage(TEST_CHANNEL, '');
        await new Promise(r => setTimeout(r, 50));

        const capturedAfter = mockServer.capturedMessages.length;
        // Empty messages should not create new captured entries
        expect(capturedAfter).toBe(capturedBefore);
    });

    /* ── 8. IRCChannel disconnect and cleanup ────────────────────── */

    test('disconnect cleans up state', async () => {
        ircChannel = await createIRCChannel(mockServer);
        expect(ircChannel.status).toBe('connected');
        expect(mockServer.clientCount).toBe(1);

        await ircChannel.disconnect();
        // Wait for socket close to propagate through TCP
        await new Promise(r => setTimeout(r, 300));
        expect(ircChannel.status).toBe('disconnected');
        expect(mockServer.clientCount).toBe(0);
    });

    /* ── 9. EmbodimentBus stats ─────────────────────────────────── */

    test('bus tracks message stats across channel', async () => {
        ircChannel = await createIRCChannel(mockServer);
        bus.register(ircChannel);

        for (let i = 0; i < 3; i++) {
            mockServer.simulateUserMessage(TEST_USER, TEST_CHANNEL, `Message ${i}`);
            await waitForEvent(bus, 'message', 3000);
        }

        const stats = bus.getStats();
        expect(stats.totalMessages).toBe(3);
        expect(stats.totalEmbodiments).toBe(1);
    });
});
