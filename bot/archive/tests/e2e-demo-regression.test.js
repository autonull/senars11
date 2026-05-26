#!/usr/bin/env node
/**
 * demo-regression.test.js — Automated regression harness using DemoEmbodiment.
 *
 * Verifies that scripted demo messages flow through the full pipeline
 * (Embodiment → Bus → Queue → MessageEnvelope) and produce valid,
 * well-typed envelopes within expected time bounds.
 *
 * Does NOT require an LLM or IRC server — tests the pipeline plumbing only.
 *
 * Usage:
 *   node bot/tests/e2e-demo-regression.test.js
 */

import { strict as assert } from 'assert';
import { EmbodimentBus } from '@senars/agent/io/EmbodimentBus.js';
import { AgentMessageQueue } from '@senars/agent/metta/AgentMessageQueue.js';
import { MessageEnvelope } from '@senars/agent/metta/MessageEnvelope.js';
import { DemoEmbodiment } from '@senars/agent/io/channels/DemoEmbodiment.js';

const TESTS = [];
let passed = 0;
let failed = 0;

function test(name, fn) { TESTS.push({ name, fn }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── Helpers ─────────────────────────────────────────────────────────── */

function createMockCap(overrides = {}) {
    const defaults = { autonomousLoop: true, attentionSalience: false };
    return (flag) => overrides[flag] ?? defaults[flag] ?? false;
}

async function createDemoPipeline(messages, caps = {}) {
    const bus = new EmbodimentBus();
    const cap = createMockCap(caps);
    const queue = new AgentMessageQueue(bus, cap);

    const demo = new DemoEmbodiment({
        id: 'demo-regression',
        nick: 'TestBot',
        channel: '##demo',
        messages,
    });

    bus.register(demo);
    await demo.connect();
    return { bus, queue, demo };
}

/* ── Tests ───────────────────────────────────────────────────────────── */

test('Demo messages flow through pipeline as valid MessageEnvelopes', async () => {
    const messages = [
        { from: 'Alice', content: 'What is 2+2?', delay: 10 },
        { from: 'Bob', content: 'Hello bot', delay: 10 },
    ];
    const { queue, demo } = await createDemoPipeline(messages);

    // Wait for messages to arrive in the bus
    await sleep(200);

    const e1 = await queue.dequeue();
    const e2 = await queue.dequeue();

    assert.ok(e1 instanceof MessageEnvelope, 'First message should be a MessageEnvelope');
    assert.ok(e2 instanceof MessageEnvelope, 'Second message should be a MessageEnvelope');

    assert.strictEqual(e1.from, 'Alice');
    assert.strictEqual(e1.content, 'What is 2+2?');
    assert.strictEqual(e1.embodimentId, 'demo-regression');

    assert.strictEqual(e2.from, 'Bob');
    assert.strictEqual(e2.content, 'Hello bot');

    await demo.disconnect();
});

test('Demo messages arrive in order via blocking dequeue', async () => {
    const messages = [
        { from: 'User1', content: 'msg1', delay: 10 },
        { from: 'User2', content: 'msg2', delay: 10 },
        { from: 'User3', content: 'msg3', delay: 10 },
    ];
    // Use non-autonomous mode so dequeue() blocks until each message arrives
    const { queue, demo } = await createDemoPipeline(messages, { autonomousLoop: false });

    const e1 = await queue.dequeue();
    const e2 = await queue.dequeue();
    const e3 = await queue.dequeue();

    assert.strictEqual(e1.content, 'msg1');
    assert.strictEqual(e1.from, 'User1');
    assert.strictEqual(e2.content, 'msg2');
    assert.strictEqual(e2.from, 'User2');
    assert.strictEqual(e3.content, 'msg3');
    assert.strictEqual(e3.from, 'User3');

    await demo.disconnect();
});

test('Empty demo message list produces no envelopes', async () => {
    const { queue, demo } = await createDemoPipeline([]);
    await sleep(200);

    const result = await queue.dequeue();
    assert.strictEqual(result, null, 'No messages means dequeue returns null');

    await demo.disconnect();
});

test('Demo messages with special characters are preserved', async () => {
    const messages = [
        { from: 'Test', content: '你好世界 🎉 Привет мир <tags> & "quotes"', delay: 10 },
    ];
    const { queue, demo } = await createDemoPipeline(messages);

    await sleep(200);
    const env = await queue.dequeue();

    assert.strictEqual(env.content, '你好世界 🎉 Привет мир <tags> & "quotes"');
    assert.ok(env.text.includes('你好世界'));

    await demo.disconnect();
});

test('Demo disconnect stops pending messages', async () => {
    const messages = [
        { from: 'Fast', content: 'quick', delay: 10 },
        { from: 'Slow', content: 'delayed', delay: 500 },
        { from: 'Slower', content: 'very delayed', delay: 1000 },
    ];
    const { queue, demo } = await createDemoPipeline(messages);

    await sleep(50); // Let first message emit
    await demo.disconnect();

    await sleep(300); // Wait past where second message would have fired

    const e1 = await queue.dequeue();
    assert.ok(e1, 'First message should be queued');
    assert.strictEqual(e1.content, 'quick');

    const e2 = await queue.dequeue();
    assert.strictEqual(e2, null, 'Second message should not arrive after disconnect');

    await demo.disconnect();
});

test('Multiple demo embodiments route through same bus in order', async () => {
    const bus = new EmbodimentBus();
    const cap = createMockCap({ autonomousLoop: true });
    const queue = new AgentMessageQueue(bus, cap);

    const demo1 = new DemoEmbodiment({
        id: 'demo-a', nick: 'Bot', channel: '##demo',
        messages: [{ from: 'A', content: 'from-a', delay: 10 }],
    });
    const demo2 = new DemoEmbodiment({
        id: 'demo-b', nick: 'Bot', channel: '##demo',
        messages: [{ from: 'B', content: 'from-b', delay: 10 }],
    });

    bus.register(demo1);
    bus.register(demo2);
    await demo1.connect();
    await demo2.connect();

    await sleep(200);

    const e1 = await queue.dequeue();
    const e2 = await queue.dequeue();

    assert.strictEqual(e1.embodimentId, 'demo-a');
    assert.strictEqual(e1.content, 'from-a');
    assert.strictEqual(e2.embodimentId, 'demo-b');
    assert.strictEqual(e2.content, 'from-b');

    await demo1.disconnect();
    await demo2.disconnect();
});

/* ── Main ─────────────────────────────────────────────────────────────── */

async function main() {
    console.log('═══ Demo Regression Harness ═══\n');

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

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
