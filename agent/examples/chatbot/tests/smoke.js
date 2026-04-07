#!/usr/bin/env node
/**
 * smoke-chatbot.js — Full pipeline integration tests for IMP
 *
 * Tests run against a mock embodiment (no IRC). Each test uses an isolated
 * temporary context that is cleaned up on exit. No user persistent memory
 * is read or written.
 *
 * Test categories:
 *   • Pipeline — classification, response generation, audit
 *   • Context — assembly, formatting, dump
 *   • I/O — nick stripping, message splitting, batching
 *   • Memory — persistence, recall, trimming
 *   • Skills — S-expr detection, dispatch, fallback
 */
import { AIClient } from '../../../src/ai/AIClient.js';
import { IntelligentMessageProcessor } from '../../../src/ai/index.js';
import { SemanticMemory } from '../../../src/memory/index.js';
import { AuditSpace } from '../../../src/memory/index.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir, rm } from 'fs/promises';

const __dir = dirname(fileURLToPath(import.meta.url));
const TEST_MEMORY_DIR = join(__dir, '..', '..', '..', 'memory', '_smoke-test');

// ── Test harness ──────────────────────────────────────────────────────────

class TestEnv {
    /**
     * @param {object} opts
     * @param {boolean} opts.withMemory     — attach SemanticMemory
     * @param {boolean} opts.withAudit      — attach AuditSpace
     * @param {boolean} opts.withActions    — enable actionDispatch
     * @param {boolean} opts.withMetta      — attach mock MeTTa interpreter
     * @param {Function} opts.mockResponse  — (content, context) => string, overrides LLM
     * @param {number}   opts.maxContext    — maxContextLength override
     * @param {string[]} opts.beliefs       — NARS beliefs to return
     */
    constructor(opts = {}) {
        this.id = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.opts = {
            withMemory: false, withAudit: false, withActions: false,
            withMetta: false, mockResponse: null, maxContext: 30,
            beliefs: ['<("math" -- "arithmetic") --> known>'],
            ...opts
        };
        this.ai = null;
        this.semanticMemory = null;
        this.auditSpace = null;
        this.metta = null;
        this.imp = null;
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

        if (this.opts.withMetta) {
            this.metta = { _atoms: [], _queryResults: new Map() };
            this.metta.run = (atom) => { this.metta._atoms.push(atom); return atom; };
            this.metta.query = (pattern) => {
                if (pattern.includes('conversation')) {
                    return this.metta._atoms.filter(a => a.startsWith('(conversation'));
                }
                return this.metta._queryResults.get(pattern) ?? [];
            };
        }

        const mockResponse = this.opts.mockResponse;
        if (mockResponse) {
            this.ai = {
                generate: async (input) => {
                    const content = Array.isArray(input)
                        ? input[input.length - 1]?.content ?? ''
                        : String(input);
                    return { text: await mockResponse(content, this), usage: {}, finishReason: 'stop' };
                }
            };
        } else {
            this.ai = new AIClient({
                provider: 'transformers',
                modelName: 'onnx-community/Qwen2.5-0.5B-Instruct',
                temperature: 0.7, maxTokens: 64
            });
        }

        const caps = {
            auditLog: this.opts.withAudit,
            actionDispatch: this.opts.withActions,
            semanticMemory: this.opts.withMemory,
            mettaControlPlane: this.opts.withActions,
            ...this.opts.capabilities
        };

        const agent = {
            ai: this.ai,
            semanticMemory: this.semanticMemory,
            getBeliefs: () => [...this.opts.beliefs],
            metta: this.metta,
            channels: { send: async () => ({}) },
            commandRegistry: null,
        };

        this.imp = new IntelligentMessageProcessor(agent, {
            botNick: 'SeNARchy',
            personality: 'helpful and concise',
            maxContextLength: this.opts.maxContext,
            contextWindowMs: 300_000,
            respondToMentions: true,
            respondToQuestions: true,
            respondToCommands: true,
            respondToGreeting: true,
            learnFromConversation: true,
            agentConfig: { capabilities: caps },
        });
        return this;
    }

    /** Send a message through the full pipeline, capturing what would be sent back */
    async send(from, content, channel = 'test') {
        const sent = [];
        const origSend = this.imp.agent.channels.send;
        this.imp.agent.channels.send = async (...args) => {
            sent.push(args);
            return origSend?.(...args) ?? {};
        };

        const msg = {
            from, content,
            metadata: { isPrivate: false, channel },
            channelId: channel
        };
        const result = await this.imp.processMessage(msg);
        this.imp.agent.channels.send = origSend;
        return { result, sent };
    }

    context(key) { return this.imp.contexts.get(key); }

    async cleanup() {
        const dir = join(TEST_MEMORY_DIR, this.id);
        try { await rm(dir, { recursive: true, force: true }); } catch {}
    }
}

// ── Assertions ────────────────────────────────────────────────────────────

function assert(cond, label) {
    if (!cond) throw new Error(`Assertion failed: ${label}`);
}

function pass(label) {
    console.log(`  ✓ ${label}`);
    return true;
}

// ── Tests ─────────────────────────────────────────────────────────────────

async function testNickPrefixStripping() {
    console.log('=== 1: Nick Prefix Stripping ===');
    const env = await new TestEnv({
        mockResponse: async (content) => `Got: "${content}"`
    }).setup();

    // "SeNARchy: who are you?" should strip to "who are you?"
    const { result } = await env.send('sseehh', 'SeNARchy: who are you?');
    assert(result.response.includes('who are you?'), `stripped content in response`);
    assert(!result.response.startsWith('SeNARchy:'), `no echoed prefix`);

    // Verify stored message is clean
    const ctx = env.context('test:sseehh');
    assert(ctx.messages.some(m => m.content === 'who are you?'), `clean message stored`);
    pass(`"SeNARchy: X" → "X", clean stored, no echo`);

    // "SeNARchy, hi" (comma) should also strip
    const { result: r2 } = await env.send('sseehh', 'SeNARchy, ping');
    assert(r2.response.includes('ping'), `comma prefix stripped`);
    pass(`comma prefix stripped`);

    await env.cleanup();
    return true;
}

async function testCommandDetection() {
    console.log('\n=== 2: Command Detection ===');

    // Use mockResponse so classification uses heuristics (not real LLM for mentioned messages)
    // But we need the real AIClient for LLM classification when isMentioned=true.
    // Instead, test the classification directly.
    const env = await new TestEnv({}).setup();

    // Test !help is classified as command (heuristic path — no mention)
    const { result } = await env.send('sseehh', '!help');
    assert(result.classification.type === 'command', `!help classified as command`);
    assert(result.response.includes('Commands'), `help response contains command list`);
    pass(`!help → command, returns command list`);

    // Test nick-prefixed message is classified as question (not command "SeNARchy:")
    // by checking the _stripNickPrefix + _heuristicClassify pipeline directly
    const stripped = env.imp._stripNickPrefix('SeNARchy: who created you?');
    assert(stripped === 'who created you?', `prefix stripped: "${stripped}"`);
    const classification = env.imp._heuristicClassify(stripped);
    assert(classification.type === 'question', `stripped content classified as question, got ${classification.type}`);
    pass(`nick prefix not treated as command`);

    await env.cleanup();
    return true;
}

async function testMessageClassification() {
    console.log('\n=== 3: Message Classification ===');
    const env = await new TestEnv({}).setup();

    const tests = [
        ['hi', 'greeting', true],
        ['hello there', 'greeting', true],
        ['what is 2+2?', 'question', true],
        ['is this working', 'question', true],
        ['!stats', 'command', true],
        ['the sky is blue', 'statement', false],  // unmentioned statement → no response
    ];

    for (const [msg, expectedType, shouldRespond] of tests) {
        const { result } = await env.send('user1', msg);
        assert(result.shouldRespond === shouldRespond,
            `"${msg}" shouldRespond=${shouldRespond}`);
        if (result.shouldRespond) {
            assert(result.classification?.type === expectedType,
                `"${msg}" → ${expectedType}, got ${result.classification?.type}`);
            pass(`"${msg}" → ${expectedType}`);
        } else {
            pass(`"${msg}" → correctly ignored (no mention)`);
        }
    }

    await env.cleanup();
    return true;
}

async function testIOFormatting() {
    console.log('\n=== 4: I/O Formatting (Split + Batch) ===');

    // Test _splitIntoLines directly (runner method, not IMP)
    // We test via a mock runner instance
    const mockRunner = {
        _splitIntoLines(text, maxLength) {
            const clean = text.replace(/\r\n/g, '\n').trim();
            const rawLines = clean.split('\n').map(l => l.trim()).filter(l => l);
            const lines = [];
            for (const rawLine of rawLines) {
                if (rawLine.length <= maxLength) {
                    lines.push(rawLine);
                } else {
                    let remaining = rawLine;
                    while (remaining.length > maxLength) {
                        let splitAt = remaining.lastIndexOf('.', maxLength);
                        if (splitAt < maxLength / 2) splitAt = remaining.lastIndexOf(' ', maxLength);
                        if (splitAt < 1) splitAt = maxLength;
                        else splitAt++;
                        lines.push(remaining.substring(0, splitAt).trim());
                        remaining = remaining.substring(splitAt).trim();
                    }
                    if (remaining) lines.push(remaining);
                }
            }
            return lines.length ? lines : [clean.substring(0, maxLength)];
        },
        _batchLines(lines, maxLength) {
            const BATCH_CHAR_LIMIT = Math.floor(maxLength * 0.8);
            const SECTION_HEADER_RE = /^(===|[A-Z_]+[\s:(]|LLM:|\([a-z]+)/;
            const batches = [];
            let current = '';
            for (const line of lines) {
                const isStructural = SECTION_HEADER_RE.test(line) || line.length > BATCH_CHAR_LIMIT;
                if (isStructural) {
                    if (current) batches.push(current);
                    batches.push(line);
                    current = '';
                } else {
                    const candidate = current ? `${current} ${line}` : line;
                    if (candidate.length > maxLength) {
                        if (current) batches.push(current);
                        current = line;
                    } else {
                        current = candidate;
                    }
                }
            }
            if (current) batches.push(current);
            return batches.length ? batches : lines;
        }
    };

    const maxLen = 350;

    // Test 1: Multi-line !context dump splits correctly
    const contextDump = `=== System State ===\n\nRECALL (0 recent):\n  (empty)\n\nHISTORY (1 messages):\n  sseehh: !context\n\nSKILLS:\n  (skill respond (String) mettaControlPlane :reflect "Reply")\n\nLLM: transformers/?\n\n=== End State ===`;

    const lines = mockRunner._splitIntoLines(contextDump, maxLen);
    const batches = mockRunner._batchLines(lines, maxLen);

    // Every output must be under limit and newline-free
    for (const batch of batches) {
        assert(batch.length <= maxLen, `batch under ${maxLen} chars (${batch.length})`);
        assert(!batch.includes('\n'), `no embedded newlines`);
    }
    pass(`${lines.length} lines → ${batches.length} batches, all under ${maxLen} chars, newline-free`);

    // Verify section headers are NOT merged into prose walls
    const hasStandaloneHeader = batches.some(b => b.startsWith('===') || b.startsWith('RECALL') || b.startsWith('HISTORY') || b.startsWith('SKILLS') || b.startsWith('LLM:'));
    assert(hasStandaloneHeader, `section headers preserved as distinct messages`);
    pass(`section headers on separate messages`);

    // Test 2: Help text is a single short line
    assert(mockRunner._splitIntoLines('short help', 350).length === 1, `short text stays as one line`);
    pass(`short text stays as one line`);

    return true;
}

async function testHelpConsolidation() {
    console.log('\n=== 5: Help Message Consolidation ===');
    const env = await new TestEnv({}).setup();

    const { result } = await env.send('sseehh', '!help');
    const helpText = result.response;

    assert(helpText.length <= 350, `help under 350 chars (${helpText.length})`);
    assert(!helpText.includes('\n'), `help is single line`);
    assert(helpText.includes('!help'), `mentions !help`);
    assert(helpText.includes('!context'), `mentions !context`);
    assert(helpText.includes('!stats'), `mentions !stats`);
    pass(`help: ${helpText.length} chars, single line, all commands present`);

    await env.cleanup();
    return true;
}

async function testContextAssembly() {
    console.log('\n=== 6: Context Assembly ===');
    const env = await new TestEnv({ withMemory: true, withAudit: true, withActions: true }).setup();

    // Seed semantic memory
    await env.semanticMemory.remember({ content: 'User asked what is 2+2, bot answered 4', type: 'episodic', source: 'test' });
    await env.semanticMemory.remember({ content: 'Math is a fundamental skill', type: 'semantic', source: 'test' });

    // Seed audit feedback
    await env.auditSpace.emit('cycle-audit', { error: 'Previous timeout failure' });

    const ctx = env.imp._getOrCreateContext('test:sseehh');
    ctx.messages.push(
        { from: 'sseehh', content: 'hi SeNARchy', timestamp: Date.now() - 60000 },
        { from: 'SeNARchy', content: 'Hello!', timestamp: Date.now() - 59000 },
    );

    const context = await env.imp._buildContext('what math question did I ask?', ctx);

    assert(context.HISTORY?.includes('hi SeNARchy'), `HISTORY slot has recent messages`);
    assert(context.RECALL?.length > 0, `RECALL slot populated`);
    assert(context.BELIEFS?.includes('math'), `BELIEFS slot filtered by keywords`);
    pass(`RECALL, BELIEFS, HISTORY all populated`);

    // Verify SKILLS slot
    assert(context.SKILLS?.length > 0, `SKILLS slot populated`);
    pass(`SKILLS slot populated`);

    // Verify !context dump shows all slots
    const dump = await env.imp._dumpContextDump('test', 'sseehh', ctx);
    for (const section of ['HISTORY', 'RECALL', 'BELIEFS', 'SKILLS']) {
        assert(dump.includes(section), `dump has ${section}`);
    }
    pass(`!context dump shows all sections`);

    await env.cleanup();
    return true;
}

async function testPersistentHistory() {
    console.log('\n=== 7: Persistent History (MeTTa Atoms) ===');
    const env = await new TestEnv({ withMetta: true }).setup();

    // Simulate a conversation exchange
    await env.imp._learnFromExchange(
        { from: 'sseehh', content: 'what is 2+2?', channel: 'test' },
        '4'
    );

    const atoms = env.metta._atoms;
    assert(atoms.some(a => a.startsWith('(conversation')), `conversation atom stored`);
    assert(atoms.some(a => a.includes('sseehh')), `user nick in atom`);
    assert(atoms.some(a => a.includes('what is 2+2')), `question content in atom`);
    pass(`MeTTa (conversation ...) atoms stored`);

    await env.cleanup();
    return true;
}

async function testContextTrimWithPersistence() {
    console.log('\n=== 8: Context Trim + Persistence ===');
    const env = await new TestEnv({ withMetta: true, maxContext: 3 }).setup();

    const ctx = env.imp._getOrCreateContext('test:sseehh');
    for (let i = 0; i < 5; i++) {
        ctx.messages.push({
            from: i % 2 === 0 ? 'sseehh' : 'SeNARchy',
            content: `message ${i}`,
            timestamp: Date.now() - (5 - i) * 1000
        });
    }

    env.imp._trimContext(ctx);

    assert(ctx.messages.length <= 3, `trimmed to maxContextLength`);
    const evictedAtoms = env.metta._atoms.filter(a => a.startsWith('(conversation'));
    pass(`context trimmed to ${ctx.messages.length}, ${evictedAtoms.length} evicted atoms saved`);

    await env.cleanup();
    return true;
}

async function testActionDispatchDetection() {
    console.log('\n=== 9: Action Dispatch Detection ===');
    const env = await new TestEnv({ withActions: true }).setup();

    const tests = [
        ['{"actions":[{"name":"respond","args":["The answer is 4."]}]}', true, 'JSON action'],
        ['{"actions":[{"name":"think","args":["hmm"]},{"name":"respond","args":["ok"]}]}', true, 'multi action'],
        ['The answer is 4.', false, 'plain text'],
        ['I think it is 4 because...', false, 'prose with paren'],
        ['', false, 'empty string'],
    ];

    for (const [input, expectActions, label] of tests) {
        const { cmds } = env.imp._actionDispatcher.parseResponse(input);
        const hasActions = cmds.length > 0;
        assert(hasActions === expectActions, `${label}: ${hasActions} === ${expectActions}`);
        pass(`${label} → ${expectActions ? 'actions' : 'text'}`);
    }

    await env.cleanup();
    return true;
}

async function testAuditTrail() {
    console.log('\n=== 10: Audit Trail ===');
    const env = await new TestEnv({ withAudit: true }).setup();

    await env.send('sseehh', 'ping');

    const events = env.imp._auditSpace.getAll();
    const types = events.map(e => e.type);

    assert(types.includes('message-received'), `message-received event`);
    assert(types.includes('response-sent'), `response-sent event`);
    pass(`audit trail: message-received + response-sent`);

    await env.cleanup();
    return true;
}

async function testCognitiveRecall() {
    console.log('\n=== 11: Cognitive Recall ===');
    const env = await new TestEnv({
        withMemory: true,
        mockResponse: async (content) => {
            // Verify RECALL context was included in the prompt
            const hasRecall = content.includes('RECALL:') || content.includes('semantic memory');
            return hasRecall ? 'RECALL_USED' : 'NO_RECALL';
        }
    }).setup();

    // Seed memory with distinctive content
    await env.semanticMemory.remember({
        content: 'The capital of France is Paris',
        type: 'episodic',
        source: 'test'
    });

    // Ask a question that should trigger semantic recall
    const { result } = await env.send('sseehh', 'what is the capital of France?');
    assert(result.response === 'RECALL_USED', `semantic memory queried and included in context`);
    pass(`recall: semantic memory included in LLM prompt`);

    await env.cleanup();
    return true;
}

async function testStartupOrient() {
    console.log('\n=== 12: Startup Orient ===');

    const env = await new TestEnv({
        withMetta: true,
        withAudit: true,
        beliefs: ['<("startup" -- "test") --> belief>'],
        mockResponse: async (content) => content.includes('STARTUP_ORIENT') ? 'ORIENTED' : 'NOT_ORIENTED'
    }).setup();

    // Seed prior conversation atoms — return as Term-like objects with variable bindings
    env.metta._queryResults.set('(conversation $channel $user $input $response)', [
        { $channel: { value: 'test' }, $user: { value: 'sseehh' }, $input: { value: 'prior question' }, $response: { value: 'prior answer' } }
    ]);

    // First message — question forces LLM path (greeting doesn't call LLM)
    const { result } = await env.send('sseehh', 'what do you remember?');

    assert(result.response === 'ORIENTED', `startup orient injected on first message`);
    pass(`startup orient: beliefs + history loaded on first message`);

    await env.cleanup();
    return true;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
    console.log('SeNARS/MeTTa Cognitive Bot — Integration Smoke Tests\n');
    console.log(`Test isolation: ${TEST_MEMORY_DIR}\n`);

    const tests = [
        testNickPrefixStripping,
        testCommandDetection,
        testMessageClassification,
        testIOFormatting,
        testHelpConsolidation,
        testContextAssembly,
        testPersistentHistory,
        testContextTrimWithPersistence,
        testActionDispatchDetection,
        testAuditTrail,
        testCognitiveRecall,
        testStartupOrient,
    ];

    const results = [];
    for (const test of tests) {
        try {
            results.push(await test());
        } catch (err) {
            console.log(`  ✗ ${err.message}`);
            console.log('  FAIL\n');
            results.push(false);
        }
    }

    // Cleanup all temp dirs
    try { await rm(TEST_MEMORY_DIR, { recursive: true, force: true }); } catch {}

    const passed = results.filter(Boolean).length;
    const total = results.length;
    console.log(`\n${passed}/${total} tests passed.`);

    if (passed < total) {
        const failed = tests.filter((_, i) => !results[i]).map(t => t.name);
        console.log(`Failed: ${failed.join(', ')}`);
    }

    process.exit(passed === total ? 0 : 1);
}

main().catch(err => { console.error('Smoke test error:', err); process.exit(1); });
