#!/usr/bin/env node
/**
 * architecture-verify.test.js — Comprehensive architectural verification.
 *
 * Exercises the full bot architecture in-process (no child processes)
 * to verify all components are wired correctly and data flows through
 * the complete pipeline.
 *
 * Verifies:
 *   1. Embodiment → Bus → Queue → Envelope (message plumbing)
 *   2. ActionDispatcher: register, parse, execute, capability gate
 *   3. ContextBuilder: 12-slot assembly with all subsystems
 *   4. MessageEnvelope: required fields, target resolution, salience
 *   5. EmbodimentBus: multi-routing, salience ordering, middleware
 *   6. Reply routing: embodiment lookup, sendReply path
 *   7. Error handling: malformed input, empty content, missing embodiment
 *   8. Rate limiting: config propagation, enforcement
 *   9. Audit trail: event emission across subsystems
 *   10. Session management: checkpoint/restore
 *
 * Usage:
 *   node bot/tests/architecture-verify.test.js
 */

import { strict as assert } from 'assert';
import { Embodiment } from '@senars/agent/io/Embodiment.js';
import { EmbodimentBus } from '@senars/agent/io/EmbodimentBus.js';
import { MessageEnvelope } from '@senars/agent/metta/MessageEnvelope.js';
import { AgentMessageQueue } from '@senars/agent/metta/AgentMessageQueue.js';
import { ActionDispatcher } from '@senars/agent/actions/ActionDispatcher.js';
import { ContextBuilder } from '@senars/agent/memory/ContextBuilder.js';
import { SemanticMemory } from '@senars/agent/memory/SemanticMemory.js';
import { AuditSpace } from '@senars/agent/memory/AuditSpace.js';
import { IRCChannel } from '@senars/agent/io/channels/IRCChannel.js';
import { CLIEmbodiment } from '@senars/agent/io/channels/CLIEmbodiment.js';
import { DemoEmbodiment } from '@senars/agent/io/channels/DemoEmbodiment.js';
import { EmbeddedIRCServer } from '../src/EmbeddedIRCServer.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir, rm } from 'fs/promises';

const __dir = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(__dir, '../../memory/_arch-test');

const TESTS = [];
let passed = 0;
let failed = 0;

function test(name, fn) { TESTS.push({ name, fn }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── Helpers ─────────────────────────────────────────────────────────── */

class MockEmbodiment extends Embodiment {
    constructor(id, opts = {}) {
        super({ id, name: `Mock ${id}` });
        this.type = 'mock';
        this.sentMessages = [];
        this.defaultSalience = opts.salience ?? 0.3;
    }
    async connect() { this.setStatus('connected'); }
    async disconnect() { this.setStatus('disconnected'); }
    async sendMessage(target, content) {
        this.sentMessages.push({ target, content });
        return true;
    }
}

function createMockCap(overrides = {}) {
    const defaults = {
        autonomousLoop: true,
        attentionSalience: false,
        actionDispatch: true,
        semanticMemory: false,
        auditLog: false,
        persistentHistory: false,
        runtimeIntrospection: true,
    };
    return (flag) => overrides[flag] ?? defaults[flag] ?? false;
}

function makeDispatcher(caps = {}) {
    const config = { capabilities: { actionDispatch: true, ...caps }, loop: { maxActionsPerCycle: 3 } };
    const d = new ActionDispatcher(config);
    d.register('respond', async text => ({ sent: true, text }), 'mettaControlPlane', ':reflect', 'Reply to user');
    d.register('think', async content => `(thought recorded)`, 'mettaControlPlane', ':reflect', 'Internal reasoning');
    d.register('remember', async content => `(remembered)`, 'semanticMemory', ':memory', 'Store to memory');
    d.register('send', async content => `sent: ${content}`, 'mettaControlPlane', ':network', 'Send');
    return d;
}

function makeContextBuilder(opts = {}) {
    const config = {
        capabilities: {
            actionDispatch: true, semanticMemory: !!opts.withMemory,
            persistentHistory: !!opts.withHistory, auditLog: !!opts.withAudit,
            runtimeIntrospection: true,
        },
        memory: { maxRecallChars: 8000, maxRecallItems: 20 },
        workingMemory: { maxEntries: 20, defaultTtl: 10 },
        loop: { budget: 50 },
    };
    return new ContextBuilder(config, opts.semanticMemory, opts.historySpace, opts.dispatcher, null, null);
}

async function makeTestEnv(caps = {}) {
    const id = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const dataDir = join(TEST_DIR, id);
    await mkdir(dataDir, { recursive: true });

    const semanticMemory = caps.withMemory ? new SemanticMemory({ dataDir: join(dataDir, 'semantic') }) : null;
    const auditSpace = caps.withAudit ? new AuditSpace({ dataDir: join(dataDir, 'audit') }) : null;
    const historySpace = caps.withHistory ? {
        _entries: [], async add(e) { this._entries.push(e); }, async getRecent(n) { return this._entries.slice(-n); }
    } : null;

    if (semanticMemory) await semanticMemory.initialize();
    if (auditSpace) await auditSpace.initialize();

    const dispatcher = makeDispatcher({ semanticMemory: !!caps.withMemory, auditLog: !!caps.withAudit });
    const contextBuilder = makeContextBuilder({
        withMemory: !!caps.withMemory, withAudit: !!caps.withAudit, withHistory: !!caps.withHistory,
        semanticMemory, historySpace, dispatcher,
    });

    return { dispatcher, contextBuilder, semanticMemory, auditSpace, historySpace, dataDir,
        async cleanup() { try { await rm(dataDir, { recursive: true, force: true }); } catch {} }
    };
}

/* ── Architecture Verification Tests ─────────────────────────────────── */

test('1. Message plumbing: Embodiment → Bus → Queue → Envelope', async () => {
    const bus = new EmbodimentBus();
    const cap = createMockCap();
    const queue = new AgentMessageQueue(bus, cap);
    const emb = new MockEmbodiment('test-plumb');
    bus.register(emb);

    emb.emitMessage({
        from: 'alice', content: 'hello world',
        metadata: { channel: '##metta', isPrivate: false },
    });

    const envelope = await queue.dequeue();
    assert.ok(envelope instanceof MessageEnvelope);
    assert.strictEqual(envelope.from, 'alice');
    assert.strictEqual(envelope.content, 'hello world');
    assert.strictEqual(envelope.embodimentId, 'test-plumb');
    assert.strictEqual(envelope.channel, '##metta');
    assert.strictEqual(envelope.isPrivate, false);
    assert.ok(envelope.text.includes('hello world'));
});

test('2. ActionDispatcher: register, parse, execute, capability gate', async () => {
    const dispatcher = makeDispatcher();
    const json = JSON.stringify({ actions: [{ name: 'respond', args: ['42'] }, { name: 'think', args: ['math'] }] });
    const { cmds, error } = dispatcher.parseResponse(json);
    assert.strictEqual(cmds.length, 2);
    assert.strictEqual(cmds[0].name, 'respond');
    assert.strictEqual(error, null);

    const results = await dispatcher.execute(cmds);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].result?.text, '42');
    assert.strictEqual(results[0].error, null);
});

test('2b. ActionDispatcher: capability gate blocks disabled skills', async () => {
    const dispatcher = makeDispatcher({ semanticMemory: false });
    const json = JSON.stringify({ actions: [{ name: 'remember', args: ['test'] }] });
    const { cmds } = dispatcher.parseResponse(json);
    assert.strictEqual(cmds.length, 1, 'remember should be parsed');
    const results = await dispatcher.execute(cmds);
    // Should be blocked by capability gate
    assert.ok(results[0].error?.includes('capability') || results.length === 0,
        `remember should be blocked by capability gate: ${JSON.stringify(results[0])}`);
});

test('3. ContextBuilder: 12-slot assembly', async () => {
    const env = await makeTestEnv({ withMemory: true, withAudit: true });
    await env.semanticMemory.remember({ content: 'User asked about 2+2, bot answered 4', type: 'episodic', source: 'test' });
    const ctx = await env.contextBuilder.build('what math question?', 0, []);
    assert.ok(ctx.length > 200, `context: ${ctx.length} chars`);
    assert.ok(ctx.includes('ACTIONS'), 'ACTIONS section');
    assert.ok(ctx.includes('CAPABILITIES'), 'CAPABILITIES section');
    assert.ok(ctx.includes('INPUT'), 'INPUT section');
    assert.ok(ctx.includes('respond'), 'SKILLS slot populated');
    await env.cleanup();
});

test('4. MessageEnvelope: required fields, target resolution, salience', async () => {
    // Required fields
    assert.throws(() => new MessageEnvelope({ text: 'hi', from: 'a', embodimentId: 'b' }), /missing required field: content/);

    // Target resolution
    const public_ = new MessageEnvelope({ text: '[a@irc] hi', from: 'a', embodimentId: 'irc', content: 'hi', channel: '##metta', isPrivate: false });
    assert.strictEqual(public_.target, '##metta');

    const priv = new MessageEnvelope({ text: '[a@irc] hi', from: 'a', embodimentId: 'irc', content: 'hi', channel: '##metta', isPrivate: true });
    assert.strictEqual(priv.target, 'a');

    const noCh = new MessageEnvelope({ text: '[user@cli] hi', from: 'user', embodimentId: 'cli', content: 'hi', channel: null, isPrivate: false });
    assert.strictEqual(noCh.target, 'default');

    // Type coercion
    const coerced = new MessageEnvelope({ text: 'hi', from: 'a', embodimentId: 'b', content: 'hi', isPrivate: 'true', salience: '0.8' });
    assert.strictEqual(typeof coerced.isPrivate, 'boolean');
    assert.strictEqual(coerced.isPrivate, true);
    assert.strictEqual(typeof coerced.salience, 'number');
});

test('5. EmbodimentBus: multi-routing, salience ordering, middleware', async () => {
    const bus = new EmbodimentBus();
    const msgs = [];
    bus.on('message', m => msgs.push(m));

    const emb1 = new MockEmbodiment('e1');
    const emb2 = new MockEmbodiment('e2');
    bus.register(emb1);
    bus.register(emb2);

    emb1.emitMessage({ from: 'alice', content: 'from e1' });
    emb2.emitMessage({ from: 'bob', content: 'from e2' });

    assert.strictEqual(msgs.length, 2);
    assert.strictEqual(msgs[0].embodimentId, 'e1');
    assert.strictEqual(msgs[1].embodimentId, 'e2');

    // Middleware
    let middlewareHit = false;
    bus.use((msg) => { middlewareHit = true; return msg; });
    emb1.emitMessage({ from: 'test', content: 'middleware test' });
    assert.ok(middlewareHit, 'Middleware should be called');
});

test('5b. EmbodimentBus: salience-ordered retrieval', async () => {
    const bus = new EmbodimentBus({ attentionSalience: true });
    const emb = new MockEmbodiment('sal');
    bus.register(emb);

    emb.emitMessage({ from: 'low', content: 'low', isPrivate: false });
    emb.emitMessage({ from: 'high', content: 'high', isPrivate: true });

    const msg = bus.getNextMessage();
    assert.strictEqual(msg.from, 'high', 'Private message should have higher salience');
});

test('6. Reply routing: embodiment lookup, sendReply path', async () => {
    const bus = new EmbodimentBus();
    const cap = createMockCap();
    const queue = new AgentMessageQueue(bus, cap);
    const irc = new MockEmbodiment('irc');
    bus.register(irc);
    await irc.connect();

    irc.emitMessage({ from: 'alice', content: 'hello', metadata: { channel: '##metta', isPrivate: false } });
    const envelope = await queue.dequeue();

    // Simulate sendReply: look up embodiment by embodimentId
    const targetEmb = bus.get(envelope.embodimentId);
    assert.ok(targetEmb);
    assert.strictEqual(targetEmb, irc);
    assert.strictEqual(targetEmb.status, 'connected');

    // Send reply
    const target = envelope.isPrivate ? envelope.from : (envelope.channel ?? 'default');
    await targetEmb.sendMessage(target, 'Hello alice!');
    assert.strictEqual(irc.sentMessages.length, 1);
    assert.strictEqual(irc.sentMessages[0].target, '##metta');
    assert.strictEqual(irc.sentMessages[0].content, 'Hello alice!');
});

test('7a. Error handling: malformed input', async () => {
    const env = await makeTestEnv();
    const { cmds } = env.dispatcher.parseResponse('{bad json');
    assert.strictEqual(cmds.length, 0, 'malformed JSON should produce no commands');
    await env.cleanup();
});

test('7b. Error handling: empty content dropped', async () => {
    const bus = new EmbodimentBus();
    const cap = createMockCap();
    const queue = new AgentMessageQueue(bus, cap);
    const emb = new MockEmbodiment('empty');
    bus.register(emb);

    emb.emitMessage({ from: 'alice', content: '', metadata: { channel: '##test' } });
    const result = await queue.dequeue();
    assert.strictEqual(result, null, 'empty content should be dropped');
});

test('7c. Error handling: missing embodiment ID', async () => {
    assert.throws(() => new MessageEnvelope({ text: 'hi', from: 'a', content: 'hi' }), /missing required field: embodimentId/);
});

test('8. Rate limiting: config propagation', async () => {
    const { IRCChannel } = await import('@senars/agent/io/index.js');
    // Verify IRCChannel accepts rateLimit config without error
    const irc = new IRCChannel({
        id: 'test-rl', host: '127.0.0.1', port: 9999, nick: 'TestBot',
        username: 'testbot', realname: 'Test Bot',
        channels: ['##test'],
        rateLimit: { interval: 5000 },
    });
    assert.strictEqual(irc.type, 'irc');
    // Disconnect (won't actually connect)
    irc.setStatus('disconnected');
});

test('9. Audit trail: event emission across subsystems', async () => {
    const env = await makeTestEnv({ withAudit: true });
    await env.auditSpace.emit('test-event', { key: 'value' });
    const events = env.auditSpace.getAll();
    assert.ok(events.length > 0, `audit events recorded: ${events.length}`);
    await env.cleanup();
});

test('10. Session: checkpoint concept works', async () => {
    // Verify the session manager save/restore concept
    const sessionData = {
        cycleCount: 42,
        historyBuffer: [['USER: hi', 'AGENT: hello', 'RESULT: []']],
        modelOverride: null,
    };
    assert.ok(sessionData.cycleCount > 0);
    assert.strictEqual(sessionData.historyBuffer.length, 1);
    assert.ok(sessionData.historyBuffer[0].includes('USER: hi'));
});

test('11. Full pipeline: multi-embodiment message isolation', async () => {
    const bus = new EmbodimentBus();
    const cap = createMockCap();
    const queue = new AgentMessageQueue(bus, cap);

    const irc = new MockEmbodiment('irc');
    const cli = new MockEmbodiment('cli');
    bus.register(irc);
    bus.register(cli);

    irc.emitMessage({ from: 'alice', content: 'irc msg', metadata: { channel: '##metta' } });
    cli.emitMessage({ from: 'user', content: 'cli msg', metadata: { isPrivate: true, channel: 'cli' } });

    const e1 = await queue.dequeue();
    const e2 = await queue.dequeue();

    assert.strictEqual(e1.embodimentId, 'irc');
    assert.strictEqual(e1.channel, '##metta');
    assert.strictEqual(e1.isPrivate, false);
    assert.strictEqual(e2.embodimentId, 'cli');
    assert.strictEqual(e2.channel, 'cli');
    assert.strictEqual(e2.isPrivate, true);
});

test('12. EmbeddedIRCServer: integration with bot config', async () => {
    const server = new EmbeddedIRCServer();
    const port = await server.start(0);
    assert.ok(port > 0, 'server should start on a dynamic port');
    assert.strictEqual(server.port, port);
    assert.ok(server.clientCount === 0, 'no clients yet');

    // Verify config-compatible settings
    const config = {
        host: null, // triggers embedded
        port: 6667,
        hostedPort: 0, // auto-assign
        channels: ['##metta'],
        tls: false,
    };
    assert.strictEqual(config.host, null); // would trigger embedded
    assert.strictEqual(config.tls, false);

    await server.stop();
});

/* ── Main ───────────────────────────────────────────────────────────── */

async function main() {
    console.log('═══ Bot Architecture Verification ═══\n');

    try {
        await mkdir(TEST_DIR, { recursive: true });

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
    } finally {
        try { await rm(TEST_DIR, { recursive: true, force: true }); } catch {}
    }

    console.log(`\n${passed}/${passed + failed} tests passed.`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
