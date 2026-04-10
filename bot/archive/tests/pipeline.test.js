#!/usr/bin/env node
/**
 * pipeline.test.js — Unit/integration tests for the embodiment → MeTTaLoop pipeline.
 *
 * Tests the core message flow without needing a real LLM:
 * - CLIEmbodiment: stdin → emitMessage → bus → queue → envelope
 * - DemoEmbodiment: scripted messages → emitMessage → bus → queue → envelope
 * - IRCChannel: message normalization, metadata propagation
 * - MessageEnvelope: required fields, target resolution
 * - AgentMessageQueue: dequeue behavior, waiter resolution
 * - EmbodimentBus: multi-embodiment routing, salience ordering
 *
 * Usage:
 *   node bot/tests/pipeline.test.js
 */

import { strict as assert } from 'assert';
import { EventEmitter } from 'events';
import { Embodiment } from '@senars/agent/io/Embodiment.js';
import { EmbodimentBus } from '@senars/agent/io/EmbodimentBus.js';
import { MessageEnvelope } from '@senars/agent/metta/MessageEnvelope.js';
import { AgentMessageQueue } from '@senars/agent/metta/AgentMessageQueue.js';
import { CLIEmbodiment } from '@senars/agent/io/channels/CLIEmbodiment.js';
import { DemoEmbodiment } from '@senars/agent/io/channels/DemoEmbodiment.js';

/* ── Test runner ──────────────────────────────────────────────────────── */

const TESTS = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
    TESTS.push({ name, fn });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function createMockBus(config = {}) {
    const bus = new EmbodimentBus(config);
    return bus;
}

function createMockCap(overrides = {}) {
    const defaults = {
        autonomousLoop: false,
        attentionSalience: false,
    };
    return (flag) => overrides[flag] ?? defaults[flag] ?? false;
}

/* ── MessageEnvelope tests ───────────────────────────────────────────── */

test('MessageEnvelope requires text, from, embodimentId, content', () => {
    const env = new MessageEnvelope({
        text: 'hello',
        from: 'alice',
        embodimentId: 'cli',
        content: 'hello',
    });
    assert.strictEqual(env.text, 'hello');
    assert.strictEqual(env.from, 'alice');
    assert.strictEqual(env.embodimentId, 'cli');
    assert.strictEqual(env.content, 'hello');
});

test('MessageEnvelope throws on missing required field', () => {
    assert.throws(
        () => new MessageEnvelope({ text: 'hello', from: 'alice', embodimentId: 'cli' }),
        /missing required field: content/
    );
});

test('MessageEnvelope.target resolves to channel for public messages', () => {
    const env = new MessageEnvelope({
        text: '[alice@irc] hi',
        from: 'alice',
        embodimentId: 'irc',
        content: 'hi',
        channel: '##metta',
        isPrivate: false,
    });
    assert.strictEqual(env.target, '##metta');
});

test('MessageEnvelope.target resolves to from for private messages', () => {
    const env = new MessageEnvelope({
        text: '[alice@irc] hi',
        from: 'alice',
        embodimentId: 'irc',
        content: 'hi',
        channel: '##metta',
        isPrivate: true,
    });
    assert.strictEqual(env.target, 'alice');
});

test('MessageEnvelope.target falls back to "default" when no channel', () => {
    const env = new MessageEnvelope({
        text: '[user@cli] hi',
        from: 'user',
        embodimentId: 'cli',
        content: 'hi',
        channel: null,
        isPrivate: false,
    });
    assert.strictEqual(env.target, 'default');
});

test('MessageEnvelope coerces types correctly', () => {
    const env = new MessageEnvelope({
        text: 'hello',
        from: 'alice',
        embodimentId: 'irc',
        content: 'hello',
        isPrivate: 'true',
        salience: '0.8',
    });
    assert.strictEqual(typeof env.isPrivate, 'boolean');
    assert.strictEqual(env.isPrivate, true);
    assert.strictEqual(typeof env.salience, 'number');
    assert.strictEqual(env.salience, 0.8);
});

/* ── EmbodimentBus tests ─────────────────────────────────────────────── */

test('EmbodimentBus routes messages from multiple embodiments', async () => {
    const bus = createMockBus();
    const received = [];

    class MockEmbodiment extends Embodiment {
        constructor(id) {
            super({ id, name: `Mock ${id}` });
            this.type = 'mock';
        }
        async connect() { this.setStatus('connected'); }
        async disconnect() { this.setStatus('disconnected'); }
        async sendMessage() { return true; }
    }

    const emb1 = new MockEmbodiment('emb1');
    const emb2 = new MockEmbodiment('emb2');
    bus.register(emb1);
    bus.register(emb2);

    bus.on('message', (msg) => received.push(msg));

    emb1.emitMessage({ from: 'alice', content: 'hello from emb1' });
    emb2.emitMessage({ from: 'bob', content: 'hello from emb2' });

    assert.strictEqual(received.length, 2);
    assert.strictEqual(received[0].embodimentId, 'emb1');
    assert.strictEqual(received[0].from, 'alice');
    assert.strictEqual(received[1].embodimentId, 'emb2');
    assert.strictEqual(received[1].from, 'bob');
});

test('EmbodimentBus preserves metadata through routing', async () => {
    const bus = createMockBus();
    let captured = null;
    bus.on('message', (msg) => { captured = msg; });

    class MockEmbodiment extends Embodiment {
        constructor() {
            super({ id: 'test-emb' });
            this.type = 'mock';
        }
        async connect() { this.setStatus('connected'); }
        async disconnect() { this.setStatus('disconnected'); }
        async sendMessage() { return true; }
    }

    const emb = new MockEmbodiment();
    bus.register(emb);

    emb.emitMessage({
        from: 'alice',
        content: 'test',
        metadata: { channel: '##metta', isPrivate: false, custom: 'value' },
    });

    assert.ok(captured);
    assert.strictEqual(captured.embodimentId, 'test-emb');
    assert.strictEqual(captured.metadata.channel, '##metta');
    assert.strictEqual(captured.metadata.custom, 'value');
    assert.ok(captured.salience >= 0 && captured.salience <= 1);
});

test('EmbodimentBus getNextMessage returns FIFO by default', async () => {
    const bus = createMockBus();

    class MockEmbodiment extends Embodiment {
        constructor(id) {
            super({ id });
            this.type = 'mock';
        }
        async connect() { this.setStatus('connected'); }
        async disconnect() { this.setStatus('disconnected'); }
        async sendMessage() { return true; }
    }

    const emb = new MockEmbodiment('fifo-test');
    bus.register(emb);

    emb.emitMessage({ from: 'first', content: 'msg1' });
    emb.emitMessage({ from: 'second', content: 'msg2' });
    emb.emitMessage({ from: 'third', content: 'msg3' });

    const msg1 = bus.getNextMessage();
    const msg2 = bus.getNextMessage();
    const msg3 = bus.getNextMessage();

    assert.strictEqual(msg1.from, 'first');
    assert.strictEqual(msg2.from, 'second');
    assert.strictEqual(msg3.from, 'third');
    assert.strictEqual(bus.getNextMessage(), null);
});

test('EmbodimentBus getNextMessage returns highest salience when enabled', async () => {
    const bus = createMockBus({ attentionSalience: true });

    class MockEmbodiment extends Embodiment {
        constructor(id) {
            super({ id, defaultSalience: 0.3 });
            this.type = 'mock';
        }
        async connect() { this.setStatus('connected'); }
        async disconnect() { this.setStatus('disconnected'); }
        async sendMessage() { return true; }
    }

    const emb = new MockEmbodiment('salience-test');
    bus.register(emb);

    // Private messages get +0.2 salience boost via emitMessage normalization
    emb.emitMessage({ from: 'low', content: 'low', isPrivate: false });
    emb.emitMessage({ from: 'high', content: 'high', isPrivate: true });
    emb.emitMessage({ from: 'mid', content: 'mid', isPrivate: false });

    const msg1 = bus.getNextMessage();
    assert.strictEqual(msg1.from, 'high'); // highest salience (private = +0.2)
});

/* ── AgentMessageQueue tests ─────────────────────────────────────────── */

test('AgentMessageQueue wraps messages in MessageEnvelope', async () => {
    const bus = createMockBus();
    const cap = createMockCap({ autonomousLoop: true });
    const queue = new AgentMessageQueue(bus, cap);

    class MockEmbodiment extends Embodiment {
        constructor() {
            super({ id: 'queue-test' });
            this.type = 'mock';
        }
        async connect() { this.setStatus('connected'); }
        async disconnect() { this.setStatus('disconnected'); }
        async sendMessage() { return true; }
    }

    const emb = new MockEmbodiment();
    bus.register(emb);

    emb.emitMessage({
        from: 'alice',
        content: 'hello world',
        metadata: { channel: '##metta', isPrivate: false },
    });

    const envelope = await queue.dequeue();
    assert.ok(envelope instanceof MessageEnvelope);
    assert.strictEqual(envelope.from, 'alice');
    assert.strictEqual(envelope.content, 'hello world');
    assert.strictEqual(envelope.channel, '##metta');
    assert.strictEqual(envelope.isPrivate, false);
    // Text format: [from@embodimentId] content
    assert.ok(envelope.text.includes('[alice@'));
    assert.ok(envelope.text.includes('hello world'));
});

test('AgentMessageQueue blocks when no messages (non-autonomous mode)', async () => {
    const bus = createMockBus();
    const cap = createMockCap({ autonomousLoop: false });
    const queue = new AgentMessageQueue(bus, cap);

    class MockEmbodiment extends Embodiment {
        constructor() {
            super({ id: 'block-test' });
            this.type = 'mock';
        }
        async connect() { this.setStatus('connected'); }
        async disconnect() { this.setStatus('disconnected'); }
        async sendMessage() { return true; }
    }

    const emb = new MockEmbodiment();
    bus.register(emb);

    // Start dequeue — should block waiting for a message
    const dequeuePromise = queue.dequeue();

    // Emit a message after a short delay
    await sleep(50);
    emb.emitMessage({
        from: 'delayed-user',
        content: 'I am late',
        metadata: { channel: '##metta' },
    });

    const envelope = await dequeuePromise;
    assert.strictEqual(envelope.from, 'delayed-user');
    assert.strictEqual(envelope.content, 'I am late');
});

test('AgentMessageQueue returns null when no messages (autonomous mode)', async () => {
    const bus = createMockBus();
    const cap = createMockCap({ autonomousLoop: true });
    const queue = new AgentMessageQueue(bus, cap);

    const result = await queue.dequeue();
    assert.strictEqual(result, null);
});

test('AgentMessageQueue queues multiple messages, dequeues in order', async () => {
    const bus = createMockBus();
    const cap = createMockCap({ autonomousLoop: true });
    const queue = new AgentMessageQueue(bus, cap);

    class MockEmbodiment extends Embodiment {
        constructor() {
            super({ id: 'order-test' });
            this.type = 'mock';
        }
        async connect() { this.setStatus('connected'); }
        async disconnect() { this.setStatus('disconnected'); }
        async sendMessage() { return true; }
    }

    const emb = new MockEmbodiment();
    bus.register(emb);

    emb.emitMessage({ from: 'first', content: '1', metadata: { channel: '##metta' } });
    emb.emitMessage({ from: 'second', content: '2', metadata: { channel: '##metta' } });
    emb.emitMessage({ from: 'third', content: '3', metadata: { channel: '##metta' } });

    const e1 = await queue.dequeue();
    const e2 = await queue.dequeue();
    const e3 = await queue.dequeue();

    assert.strictEqual(e1.content, '1');
    assert.strictEqual(e2.content, '2');
    assert.strictEqual(e3.content, '3');
});

/* ── CLIEmbodiment tests ─────────────────────────────────────────────── */

test('CLIEmbodiment has correct type and status', () => {
    const cli = new CLIEmbodiment({ id: 'test-cli', nick: 'TestBot' });
    assert.strictEqual(cli.type, 'cli');
    assert.strictEqual(cli.status, 'disconnected');
});

test('CLIEmbodiment emits message with correct metadata', async () => {
    const cli = new CLIEmbodiment({ id: 'test-cli', nick: 'TestBot' });
    const received = [];
    cli.on('message', (msg) => received.push(msg));

    // Simulate stdin input by calling emitMessage directly
    cli.emitMessage({
        from: 'user',
        content: 'hello bot',
        metadata: { isPrivate: true, channel: 'cli' },
    });

    assert.strictEqual(received.length, 1);
    const msg = received[0];
    assert.strictEqual(msg.from, 'user');
    assert.strictEqual(msg.content, 'hello bot');
    assert.strictEqual(msg.embodimentId, 'test-cli');
    assert.strictEqual(msg.metadata.isPrivate, true);
    assert.strictEqual(msg.metadata.channel, 'cli');
});

test('CLIEmbodiment sendMessage writes to stdout', async () => {
    const cli = new CLIEmbodiment({ id: 'test-cli', nick: 'TestBot' });
    cli.status = 'connected';

    const result = await cli.sendMessage('user', 'Hello there!');
    assert.strictEqual(result, true);
});

/* ── DemoEmbodiment tests ────────────────────────────────────────────── */

test('DemoEmbodiment has correct type and status', () => {
    const demo = new DemoEmbodiment({ id: 'test-demo', nick: 'TestBot' });
    assert.strictEqual(demo.type, 'demo');
    assert.strictEqual(demo.status, 'disconnected');
});

test('DemoEmbodiment emits scripted messages with correct metadata', async () => {
    const demo = new DemoEmbodiment({
        id: 'test-demo',
        nick: 'TestBot',
        channel: '##demo',
        messages: [
            { from: 'Alice', content: 'Hello!', delay: 10 },
            { from: 'Bob', content: 'Hi there!', delay: 20 },
        ],
    });

    const received = [];
    demo.on('message', (msg) => received.push(msg));

    await demo.connect();

    // Wait for messages to be emitted
    await sleep(100);

    assert.strictEqual(received.length, 2);
    assert.strictEqual(received[0].from, 'Alice');
    assert.strictEqual(received[0].content, 'Hello!');
    assert.strictEqual(received[0].metadata.channel, '##demo');
    assert.strictEqual(received[0].embodimentId, 'test-demo');

    assert.strictEqual(received[1].from, 'Bob');
    assert.strictEqual(received[1].content, 'Hi there!');
});

test('DemoEmbodiment disconnect stops message emission', async () => {
    const demo = new DemoEmbodiment({
        id: 'test-demo',
        nick: 'TestBot',
        messages: [
            { from: 'Alice', content: 'msg1', delay: 10 },
            { from: 'Alice', content: 'msg2', delay: 50 },
            { from: 'Alice', content: 'msg3', delay: 100 },
        ],
    });

    const received = [];
    demo.on('message', (msg) => received.push(msg));

    await demo.connect();
    await sleep(30);
    await demo.disconnect();

    // Wait for remaining scheduled messages
    await sleep(200);

    // Only the first message should have been emitted before disconnect
    assert.ok(received.length <= 1, `Expected <= 1 messages, got ${received.length}`);
});

/* ── Cross-embodiment isolation tests ────────────────────────────────── */

test('Messages from different embodiments maintain separate embodimentId', async () => {
    const bus = createMockBus();
    const cap = createMockCap({ autonomousLoop: true });
    const queue = new AgentMessageQueue(bus, cap);

    class MockEmbodiment extends Embodiment {
        constructor(id) {
            super({ id });
            this.type = 'mock';
        }
        async connect() { this.setStatus('connected'); }
        async disconnect() { this.setStatus('disconnected'); }
        async sendMessage() { return true; }
    }

    const irc = new MockEmbodiment('irc');
    const cli = new MockEmbodiment('cli');
    bus.register(irc);
    bus.register(cli);

    irc.emitMessage({ from: 'alice', content: 'irc message', metadata: { channel: '##metta' } });
    cli.emitMessage({ from: 'user', content: 'cli message', metadata: { isPrivate: true, channel: 'cli' } });

    const e1 = await queue.dequeue();
    const e2 = await queue.dequeue();

    assert.strictEqual(e1.embodimentId, 'irc');
    assert.strictEqual(e1.channel, '##metta');
    assert.strictEqual(e1.isPrivate, false);

    assert.strictEqual(e2.embodimentId, 'cli');
    assert.strictEqual(e2.channel, 'cli');
    assert.strictEqual(e2.isPrivate, true);
});

test('Reply routing: embodimentId is preserved for sendReply lookup', async () => {
    const bus = createMockBus();
    const cap = createMockCap({ autonomousLoop: true });
    const queue = new AgentMessageQueue(bus, cap);

    class MockEmbodiment extends Embodiment {
        constructor(id) {
            super({ id });
            this.type = 'mock';
            this.sentMessages = [];
        }
        async connect() { this.setStatus('connected'); }
        async disconnect() { this.setStatus('disconnected'); }
        async sendMessage(target, content) {
            this.sentMessages.push({ target, content });
            return true;
        }
    }

    const irc = new MockEmbodiment('irc');
    bus.register(irc);
    await irc.connect();

    irc.emitMessage({
        from: 'alice',
        content: 'hello',
        metadata: { channel: '##metta', isPrivate: false },
    });

    const envelope = await queue.dequeue();

    // Simulate what #sendReply does: look up embodiment by embodimentId
    const targetEmbodiment = bus.get(envelope.embodimentId);
    assert.ok(targetEmbodiment);
    assert.strictEqual(targetEmbodiment, irc);
    assert.strictEqual(targetEmbodiment.status, 'connected');

    // Simulate reply routing
    const target = envelope.isPrivate ? envelope.from : (envelope.channel ?? 'default');
    await targetEmbodiment.sendMessage(target, 'Hello alice!');

    assert.strictEqual(irc.sentMessages.length, 1);
    assert.strictEqual(irc.sentMessages[0].target, '##metta');
    assert.strictEqual(irc.sentMessages[0].content, 'Hello alice!');
});

test('Reply routing: private message goes to user nick, not channel', async () => {
    const bus = createMockBus();
    const cap = createMockCap({ autonomousLoop: true });
    const queue = new AgentMessageQueue(bus, cap);

    class MockEmbodiment extends Embodiment {
        constructor() {
            super({ id: 'irc' });
            this.type = 'mock';
            this.sentMessages = [];
        }
        async connect() { this.setStatus('connected'); }
        async disconnect() { this.setStatus('disconnected'); }
        async sendMessage(target, content) {
            this.sentMessages.push({ target, content });
            return true;
        }
    }

    const irc = new MockEmbodiment();
    bus.register(irc);

    irc.emitMessage({
        from: 'alice',
        content: 'hello bot',
        metadata: { channel: '##metta', isPrivate: true },
    });

    const envelope = await queue.dequeue();
    assert.strictEqual(envelope.isPrivate, true);

    const target = envelope.isPrivate ? envelope.from : (envelope.channel ?? 'default');
    assert.strictEqual(target, 'alice'); // PM goes to nick, not channel
});

/* ── Message format tests ────────────────────────────────────────────── */

test('AgentMessageQueue text format includes source and embodiment', async () => {
    const bus = createMockBus();
    const cap = createMockCap({ autonomousLoop: true });
    const queue = new AgentMessageQueue(bus, cap);

    class MockEmbodiment extends Embodiment {
        constructor() {
            super({ id: 'irc' });
            this.type = 'mock';
        }
        async connect() { this.setStatus('connected'); }
        async disconnect() { this.setStatus('disconnected'); }
        async sendMessage() { return true; }
    }

    const emb = new MockEmbodiment();
    bus.register(emb);

    emb.emitMessage({
        from: 'alice',
        content: 'what is 2+2?',
        metadata: { channel: '##metta' },
    });

    const envelope = await queue.dequeue();
    assert.strictEqual(envelope.text, '[alice@irc] what is 2+2?');
});

/* ── Rate limiting simulation tests ──────────────────────────────────── */

test('Multiple rapid messages are all queued, not dropped', async () => {
    const bus = createMockBus();
    const cap = createMockCap({ autonomousLoop: true });
    const queue = new AgentMessageQueue(bus, cap);

    class MockEmbodiment extends Embodiment {
        constructor() {
            super({ id: 'flood-test' });
            this.type = 'mock';
        }
        async connect() { this.setStatus('connected'); }
        async disconnect() { this.setStatus('disconnected'); }
        async sendMessage() { return true; }
    }

    const emb = new MockEmbodiment();
    bus.register(emb);

    // Simulate flood: 10 messages in rapid succession
    for (let i = 0; i < 10; i++) {
        emb.emitMessage({
            from: 'flood-user',
            content: `message ${i}`,
            metadata: { channel: '##metta' },
        });
    }

    const messages = [];
    for (let i = 0; i < 10; i++) {
        const env = await queue.dequeue();
        messages.push(env);
    }

    assert.strictEqual(messages.length, 10);
    for (let i = 0; i < 10; i++) {
        assert.strictEqual(messages[i].content, `message ${i}`);
    }
});

/* ── Edge case tests ─────────────────────────────────────────────────── */

test('Empty content message is dropped by MessageEnvelope validation', async () => {
    const bus = createMockBus();
    const cap = createMockCap({ autonomousLoop: true });
    const queue = new AgentMessageQueue(bus, cap);

    class MockEmbodiment extends Embodiment {
        constructor() {
            super({ id: 'edge-test' });
            this.type = 'mock';
        }
        async connect() { this.setStatus('connected'); }
        async disconnect() { this.setStatus('disconnected'); }
        async sendMessage() { return true; }
    }

    const emb = new MockEmbodiment();
    bus.register(emb);

    // Empty content should be dropped by MessageEnvelope validation
    emb.emitMessage({
        from: 'alice',
        content: '',
        metadata: { channel: '##metta' },
    });

    // MessageEnvelope requires truthy 'content', so this should be dropped
    // In autonomous mode, dequeue returns null when queue is empty
    const result = await queue.dequeue();
    assert.strictEqual(result, null);
});

test('Unicode content is preserved through the pipeline', async () => {
    const bus = createMockBus();
    const cap = createMockCap({ autonomousLoop: true });
    const queue = new AgentMessageQueue(bus, cap);

    class MockEmbodiment extends Embodiment {
        constructor() {
            super({ id: 'unicode-test' });
            this.type = 'mock';
        }
        async connect() { this.setStatus('connected'); }
        async disconnect() { this.setStatus('disconnected'); }
        async sendMessage() { return true; }
    }

    const emb = new MockEmbodiment();
    bus.register(emb);

    emb.emitMessage({
        from: 'alice',
        content: '你好世界 🎉 Привет мир',
        metadata: { channel: '##metta' },
    });

    const envelope = await queue.dequeue();
    assert.strictEqual(envelope.content, '你好世界 🎉 Привет мир');
    assert.ok(envelope.text.includes('你好世界'));
});

test('Long content is preserved (no truncation in pipeline)', async () => {
    const bus = createMockBus();
    const cap = createMockCap({ autonomousLoop: true });
    const queue = new AgentMessageQueue(bus, cap);

    class MockEmbodiment extends Embodiment {
        constructor() {
            super({ id: 'long-test' });
            this.type = 'mock';
        }
        async connect() { this.setStatus('connected'); }
        async disconnect() { this.setStatus('disconnected'); }
        async sendMessage() { return true; }
    }

    const emb = new MockEmbodiment();
    bus.register(emb);

    const longContent = 'x'.repeat(5000);
    emb.emitMessage({
        from: 'alice',
        content: longContent,
        metadata: { channel: '##metta' },
    });

    const envelope = await queue.dequeue();
    assert.strictEqual(envelope.content.length, 5000);
    assert.strictEqual(envelope.content, longContent);
});

/* ── Main ─────────────────────────────────────────────────────────────── */

async function main() {
    console.log('═══ SeNARS Bot — Pipeline Tests ═══\n');

    for (const { name, fn } of TESTS) {
        try {
            await fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (err) {
            console.log(`  ✗ ${name}: ${err.message}`);
            failed++;
        }
    }

    console.log(`\n${passed}/${passed + failed} tests passed.`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
