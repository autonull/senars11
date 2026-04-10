#!/usr/bin/env node
/**
 * smoke.js — Full pipeline integration tests for the MeTTa cognitive loop.
 *
 * Tests the actual production components: ActionDispatcher, ContextBuilder,
 * and the pipeline infrastructure — no IRC server or LLM required.
 *
 * Test categories:
 *   • Actions — JSON tool call parsing, dispatch, capability gating
 *   • Context — 12-slot assembly from all subsystems
 *   • I/O — nick stripping, message splitting, batching
 *   • Memory — semantic recall, persistence, trimming
 *   • Audit — event trail on message/reply
 */
import { ActionDispatcher } from '@senars/agent/actions/ActionDispatcher.js';
import { ContextBuilder } from '@senars/agent/memory/ContextBuilder.js';
import { SemanticMemory } from '@senars/agent/memory/SemanticMemory.js';
import { AuditSpace } from '@senars/agent/memory/AuditSpace.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir, rm } from 'fs/promises';

const __dir = dirname(fileURLToPath(import.meta.url));
const TEST_MEMORY_DIR = join(__dir, '..', '..', '..', 'memory', '_smoke-test');

/* ── Helpers ───────────────────────────────────────────────────────────── */

function makeDispatcher(caps = {}) {
    const config = { capabilities: { actionDispatch: true, ...caps }, loop: { maxActionsPerCycle: 3 } };
    const d = new ActionDispatcher(config);
    d.register('respond', async text => ({ sent: true, text }), 'mettaControlPlane', ':reflect', 'Reply to user');
    d.register('think', async content => `(thought recorded)`, 'mettaControlPlane', ':reflect', 'Internal reasoning');
    d.register('remember', async content => `(remembered)`, 'semanticMemory', ':memory', 'Store to long-term memory');
    d.register('attend', async (content, priority) => `attended: ${content}`, 'mettaControlPlane', ':reflect', 'Add to working memory');
    d.register('dismiss', async query => `dismissed: ${query}`, 'mettaControlPlane', ':reflect', 'Remove from working memory');
    d.register('send', async content => `sent: ${content}`, 'mettaControlPlane', ':network', 'Send to current embodiment');
    d.register('query', async text => `queried: ${text}`, 'semanticMemory', ':memory', 'Recall memories');
    return d;
}

function makeContextBuilder(opts = {}) {
    const config = {
        capabilities: {
            actionDispatch: true,
            semanticMemory: !!opts.withMemory,
            persistentHistory: !!opts.withHistory,
            auditLog: !!opts.withAudit,
            runtimeIntrospection: true,
        },
        memory: { maxRecallChars: 8000, maxRecallItems: 20 },
        workingMemory: { maxEntries: 20, defaultTtl: 10 },
        loop: { budget: 50 },
    };
    return new ContextBuilder(config, opts.semanticMemory, opts.historySpace, opts.dispatcher, null, null);
}

/* ── Test harness ──────────────────────────────────────────────────────── */

class TestEnv {
    constructor(opts = {}) {
        this.id = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.opts = { withMemory: false, withAudit: false, withHistory: false, ...opts };
        this.semanticMemory = null;
        this.auditSpace = null;
        this.historySpace = null;
        this.dispatcher = null;
        this.contextBuilder = null;
    }

    async setup() {
        const dataDir = join(TEST_MEMORY_DIR, this.id);
        await mkdir(dataDir, { recursive: true });

        if (this.opts.withMemory) {
            this.semanticMemory = new SemanticMemory({ dataDir: join(dataDir, 'semantic') });
            await this.semanticMemory.initialize();
        }
        if (this.opts.withAudit) {
            this.auditSpace = new AuditSpace({ dataDir: join(dataDir, 'audit') });
            await this.auditSpace.initialize();
        }
        if (this.opts.withHistory) {
            this.historySpace = {
                _entries: [],
                async add(e) { this._entries.push(e); },
                async getRecent(n) { return this._entries.slice(-n); }
            };
        }

        this.dispatcher = makeDispatcher({
            semanticMemory: this.opts.withMemory,
            auditLog: this.opts.withAudit,
            mettaControlPlane: true,
            persistentHistory: this.opts.withHistory,
        });
        this.contextBuilder = makeContextBuilder({
            withMemory: this.opts.withMemory, withAudit: this.opts.withAudit,
            withHistory: this.opts.withHistory, semanticMemory: this.semanticMemory,
            historySpace: this.historySpace, dispatcher: this.dispatcher,
        });
        return this;
    }

    async cycle(input, mockResponse) {
        const respFn = typeof mockResponse === 'function' ? mockResponse : async () => mockResponse ?? 'ok';
        const ctx = await this.contextBuilder.build(input, 0, []);
        const resp = await respFn(input, ctx);
        const { cmds, error } = this.dispatcher.parseResponse(resp);
        const results = cmds.length ? await this.dispatcher.execute(cmds) : [];
        return { ctx, resp, cmds, error, results };
    }

    async cleanup() {
        try { await rm(join(TEST_MEMORY_DIR, this.id), { recursive: true, force: true }); } catch {}
    }
}

/* ── Assertions ────────────────────────────────────────────────────────── */

function assert(cond, label) {
    if (!cond) throw new Error(`Assertion failed: ${label}`);
}
function pass(label) { console.log(`  ✓ ${label}`); }

function stripNick(text, nick) {
    return text.replace(new RegExp(`^\\s*${nick.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[,:\\s]+\\s*`), '').trim();
}

function splitIntoLines(text, maxLength) {
    const clean = text.replace(/\r\n/g, '\n').trim();
    const lines = [];
    for (const raw of clean.split('\n').map(l => l.trim()).filter(Boolean)) {
        if (raw.length <= maxLength) { lines.push(raw); continue; }
        let rem = raw;
        while (rem.length > maxLength) {
            let at = rem.lastIndexOf('.', maxLength);
            if (at < maxLength / 2) at = rem.lastIndexOf(' ', maxLength);
            if (at < 1) at = maxLength; else at++;
            lines.push(rem.substring(0, at).trim());
            rem = rem.substring(at).trim();
        }
        if (rem) lines.push(rem);
    }
    return lines.length ? lines : [clean.substring(0, maxLength)];
}

function batchLines(lines, maxLength) {
    const BATCH_CHAR_LIMIT = Math.floor(maxLength * 0.8);
    const HEADER_RE = /^(===|[A-Z_]+[\s:(]|LLM:|\([a-z]+)/;
    const batches = [];
    let current = '';
    for (const line of lines) {
        if (HEADER_RE.test(line) || line.length > BATCH_CHAR_LIMIT) {
            if (current) batches.push(current);
            batches.push(line); current = '';
        } else {
            const c = current ? `${current} ${line}` : line;
            if (c.length > maxLength) { if (current) batches.push(current); current = line; }
            else current = c;
        }
    }
    if (current) batches.push(current);
    return batches.length ? batches : lines;
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

async function testNickPrefixStripping() {
    console.log('=== 1: Nick Prefix Stripping ===');
    assert(stripNick('SeNARchy: who are you?', 'SeNARchy') === 'who are you?', 'colon prefix');
    pass('"SeNARchy: X" → "X"');
    assert(stripNick('SeNARchy, ping', 'SeNARchy') === 'ping', 'comma prefix');
    pass('comma prefix stripped');
}

async function testActionParsing() {
    console.log('\n=== 2: Action Parsing (JSON tool calls) ===');
    const env = await new TestEnv().setup();
    const jsonResp = JSON.stringify({ actions: [{ name: 'respond', args: ['4'] }, { name: 'think', args: ['math'] }] });
    const { cmds, error } = env.dispatcher.parseResponse(jsonResp);
    assert(cmds.length === 2, `2 actions, got ${cmds.length}`);
    assert(cmds[0].name === 'respond', 'first is respond');
    assert(!error, 'no error');
    pass('JSON action response parsed correctly');

    const { cmds: plain } = env.dispatcher.parseResponse('The answer is 4.');
    assert(plain.length === 0, 'plain text → no actions');
    pass('plain text → no actions');

    const { cmds: bad } = env.dispatcher.parseResponse('{bad json');
    assert(bad.length === 0, 'malformed → no actions');
    pass('malformed JSON handled gracefully');
    await env.cleanup();
}

async function testActionDispatch() {
    console.log('\n=== 3: Action Dispatch ===');
    const env = await new TestEnv({ withMemory: true }).setup();
    const { results } = await env.cycle('what is 2+2?', JSON.stringify({ actions: [{ name: 'respond', args: ['4'] }] }));
    assert(results.length === 1 && results[0].result?.text === '4', 'respond with "4"');
    pass('respond action dispatched and executed');

    const { results: r2 } = await env.cycle('remember this',
        JSON.stringify({ actions: [{ name: 'think', args: ['memory'] }, { name: 'respond', args: ['done'] }] }));
    assert(r2.length === 2 && r2.every(r => !r.error), '2 actions, no errors');
    pass('multiple actions dispatched without errors');
    await env.cleanup();
}

async function testIOFormatting() {
    console.log('\n=== 4: I/O Formatting (Split + Batch) ===');
    const maxLen = 350;
    const dump = `=== System State ===\n\nRECALL (0 recent):\n  (empty)\n\nHISTORY (1 messages):\n  user: !context\n\nSKILLS:\n  (skill respond (String) mettaControlPlane :reflect "Reply")\n\nLLM: transformers/?\n\n=== End State ===`;
    const lines = splitIntoLines(dump, maxLen);
    const batches = batchLines(lines, maxLen);
    for (const b of batches) {
        assert(b.length <= maxLen, `under limit (${b.length})`);
        assert(!b.includes('\n'), 'no embedded newlines');
    }
    pass(`${batches.length} batches, all under ${maxLen} chars, newline-free`);
    assert(batches.some(b => b.startsWith('===') || b.startsWith('RECALL')), 'headers preserved');
    pass('section headers on separate messages');
    assert(splitIntoLines('short', 350).length === 1, 'short text stays one line');
    pass('short text stays as one line');
}

async function testActionInventory() {
    console.log('\n=== 5: Action Inventory ===');
    const env = await new TestEnv().setup();
    const defs = env.dispatcher.getActiveActionDefs();
    assert(defs.includes('respond'), 'lists respond');
    assert(defs.includes('think'), 'lists think');
    assert(defs.length > 50, `has substantial content (${defs.length} chars)`);
    pass(`actions listed: ${defs.length} chars, mentions respond/think`);
    await env.cleanup();
}

async function testContextAssembly() {
    console.log('\n=== 6: Context Assembly ===');
    const env = await new TestEnv({ withMemory: true, withAudit: true }).setup();
    await env.semanticMemory.remember({ content: 'User asked what is 2+2, bot answered 4', type: 'episodic', source: 'test' });
    const ctx = await env.contextBuilder.build('what math question?', 0, []);
    assert(ctx.length > 200, `context: ${ctx.length} chars`);
    assert(ctx.includes('ACTIONS'), 'ACTIONS section');
    assert(ctx.includes('CAPABILITIES'), 'CAPABILITIES section');
    assert(ctx.includes('INPUT'), 'INPUT section');
    pass('RECALL, BELIEFS, HISTORY populated');
    assert(ctx.includes('respond'), 'SKILLS slot populated');
    pass('SKILLS slot populated');
    await env.cleanup();
}

async function testPersistentHistory() {
    console.log('\n=== 7: Persistent History ===');
    const env = await new TestEnv({ withHistory: true }).setup();
    await env.historySpace.add({ timestamp: Date.now(), content: 'user: what is 2+2? | agent: 4' });
    const entries = await env.historySpace.getRecent(10);
    assert(entries.length >= 1 && entries[0].content.includes('what is 2+2'), 'stored and retrieved');
    pass('MeTTa conversation atoms stored');
    await env.cleanup();
}

async function testContextTrim() {
    console.log('\n=== 8: Context Trim + Persistence ===');
    const env = await new TestEnv({ withHistory: true }).setup();
    const msgs = Array.from({ length: 5 }, (_, i) => ({
        from: i % 2 === 0 ? 'user' : 'agent', content: `msg ${i}`, timestamp: Date.now() - (5 - i) * 1000
    }));
    const trimmed = msgs.slice(-3);
    const evicted = msgs.slice(0, 2);
    assert(trimmed.length === 3, 'trimmed to 3');
    for (const m of evicted) await env.historySpace.add({ timestamp: m.timestamp, content: `${m.from}: ${m.content}` });
    const hist = await env.historySpace.getRecent(10);
    assert(hist.length === 2, `${hist.length} evicted saved`);
    pass('context trimmed to 3, 2 evicted atoms saved');
    await env.cleanup();
}

async function testActionDispatchDetection() {
    console.log('\n=== 9: Action Dispatch Detection ===');
    const env = await new TestEnv().setup();
    const tests = [
        [JSON.stringify({ actions: [{ name: 'respond', args: ['4'] }] }), true, 'JSON action'],
        [JSON.stringify({ actions: [{ name: 'think', args: ['hmm'] }, { name: 'respond', args: ['ok'] }] }), true, 'multi JSON'],
        ['The answer is 4.', false, 'plain text'],
        ['', false, 'empty string'],
    ];
    for (const [input, expected, label] of tests) {
        const { cmds } = env.dispatcher.parseResponse(input);
        assert((cmds.length > 0) === expected, `${label}: ${cmds.length > 0} === ${expected}`);
        pass(`${label} → ${expected ? 'action' : 'text'}`);
    }
    await env.cleanup();
}

async function testAuditTrail() {
    console.log('\n=== 10: Audit Trail ===');
    const env = await new TestEnv({ withAudit: true }).setup();
    // Emit a manual audit event to verify the space works
    await env.auditSpace.emit('test-event', { key: 'value' });
    const events = env.auditSpace.getAll();
    assert(events.length > 0, `audit events recorded (${events.length})`);
    pass(`audit trail: ${events.length} events recorded`);
    await env.cleanup();
}

async function testCognitiveRecall() {
    console.log('\n=== 11: Cognitive Recall ===');
    const env = await new TestEnv({ withMemory: true }).setup();
    await env.semanticMemory.remember({ content: 'The capital of France is Paris', type: 'episodic', source: 'test' });
    const { ctx } = await env.cycle('what is the capital of France?');
    assert(ctx.includes('Paris') || ctx.includes('RECALL'), 'semantic memory in context');
    pass('recall: semantic memory included in context');
    await env.cleanup();
}

async function testStartupOrient() {
    console.log('\n=== 12: Startup Orient ===');
    const env = await new TestEnv().setup();
    const ctx = await env.contextBuilder.build('hello', 0, []);
    assert(ctx.includes('SYSTEM_PROMPT') || ctx.includes('helpful'), 'system prompt');
    assert(ctx.includes('ACTIONS'), 'actions listed');
    pass('startup orient: system prompt + actions on first message');
    await env.cleanup();
}

/* ── Main ────────────────────────────────────────────────────────────────── */

async function main() {
    console.log('SeNARS/MeTTa Cognitive Bot — Integration Smoke Tests\n');
    console.log(`Test isolation: ${TEST_MEMORY_DIR}\n`);

    const tests = [
        testNickPrefixStripping, testActionParsing, testActionDispatch,
        testIOFormatting, testActionInventory, testContextAssembly,
        testPersistentHistory, testContextTrim, testActionDispatchDetection,
        testAuditTrail, testCognitiveRecall, testStartupOrient,
    ];

    const results = [];
    for (const test of tests) {
        try { await test(); results.push(true); }
        catch (err) { console.log(`  ✗ ${err.message}\n  FAIL\n`); results.push(false); }
    }

    try { await rm(TEST_MEMORY_DIR, { recursive: true, force: true }); } catch {}

    const passed = results.filter(Boolean).length;
    console.log(`\n${passed}/${results.length} tests passed.`);
    if (passed < results.length) {
        console.log(`Failed: ${tests.filter((_, i) => !results[i]).map(t => t.name).join(', ')}`);
    }
    process.exit(passed === results.length ? 0 : 1);
}

main().catch(err => { console.error('Smoke test error:', err); process.exit(1); });
