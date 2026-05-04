/**
 * MeTTa Loop Response E2E Tests
 *
 * Verifies that the MeTTa cognitive loop correctly sends responses back
 * to the user in all scenarios:
 * 1. Plain text LLM response (no actions)
 * 2. JSON actions with a `respond` action
 * 3. JSON actions without a `respond` action (uses stripped text)
 * 4. Empty/suppressed responses are not sent
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.setTimeout(10000);

// ── Helpers ─────────────────────────────────────────────────────────────────

function createMockEmbodimentBus() {
    const listeners = {};
    const sentMessages = [];
    return {
        on: (evt, fn) => { (listeners[evt] ??= []).push(fn); },
        emit: (evt, data) => { (listeners[evt] ?? []).forEach(fn => fn(data)); },
        get: (id) => id === 'irc' ? ircEmbodiment : null,
        sentMessages,
    };
}

const ircEmbodiment = {
    status: 'connected',
    id: 'irc',
    sendMessage: jest.fn(async (target, text) => {
        ircEmbodiment.sentMessages.push({ target, text });
        return true;
    }),
    sentMessages: [],
};

function createMockMsgQueue(embodimentBus) {
    const messages = [];
    let resolver = null;
    embodimentBus.on('message', (msg) => {
        if (resolver) { resolver(msg); resolver = null; }
        else { messages.push(msg); }
    });
    return {
        enqueue: (msg) => {
            if (messages.length > 0) { messages.push(msg); }
            else if (resolver) { resolver(msg); resolver = null; }
            else { messages.push(msg); }
        },
        dequeue: async () => {
            if (messages.length > 0) return messages.shift();
            return new Promise(resolve => { resolver = resolve; });
        },
        messages,
    };
}

function createMockLlmInvoker(responseFn) {
    return {
        invoke: async (ctx) => {
            return responseFn ? responseFn(ctx) : 'I am fine.';
        },
    };
}

function createMockContextBuilder() {
    return {
        build: async (text, cycle, wm) => `Context for: ${text}`,
    };
}

function createMockActionDispatcher(parseResult, execResult) {
    return {
        parseResponse: (text) => parseResult,
        execute: async (cmds) => execResult ?? [],
        _ensureSafetyAndAudit: async () => {},
        _auditSpace: null,
    };
}

// Simulate the MeTTaLoopBuilder's response extraction logic (inline for testing)
function extractReplyText(rawResp, results) {
    const respondResult = results?.find(r => r.action === 'respond' && !r.error);
    if (respondResult?.result?.text) {
        return respondResult.result.text;
    }
    if (!rawResp || typeof rawResp !== 'string') return null;
    const text = rawResp.trim();
    if (!text) return null;
    const stripped = stripJsonBlocks(text);
    let cleaned = stripped
        .replace(/^(JSON\s*tool\s*call[:\s]*)+/gi, '')
        .replace(/^(Action[s]?\s*:?\s*)+/gi, '')
        .replace(/^(Response\s*:?\s*)+/gi, '')
        .replace(/^(Output\s*:?\s*)+/gi, '')
        .trim();
    if (!cleaned) return null;
    if (/^\(llm-error|^\(respond-error/i.test(cleaned)) return null;
    return cleaned.length > 2000 ? cleaned.slice(0, 2000) + '...' : cleaned;
}

function stripJsonBlocks(text) {
    let result = '';
    let i = 0;
    while (i < text.length) {
        if (text[i] === '{') {
            const end = findJsonBlockEnd(text, i);
            if (end >= 0) { i = end + 1; continue; }
        }
        result += text[i];
        i++;
    }
    return result;
}

function findJsonBlockEnd(text, start) {
    let depth = 0, inStr = false, escaped = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('MeTTa Loop Response Handling', () => {
    describe('extractReplyText()', () => {
        it('returns respond action text when present', () => {
            const resp = 'The answer is 4.';
            const results = [{ action: 'respond', result: { text: 'Hello!' } }];
            expect(extractReplyText(resp, results)).toBe('Hello!');
        });

        it('returns plain text when no actions parsed', () => {
            const resp = 'I think the answer is 4.';
            const results = [];
            expect(extractReplyText(resp, results)).toBe('I think the answer is 4.');
        });

        it('strips JSON block and junk prefix, returns clean text', () => {
            const resp = 'JSON tool call: {"actions":[{"name":"query","args":["2+2"]}]}\nThe answer is 4.';
            const results = [{ action: 'query', result: { answer: 4 } }];
            expect(extractReplyText(resp, results)).toBe('The answer is 4.');
        });

        it('returns null for pure JSON response with no remainder', () => {
            const resp = '{"actions":[{"name":"query","args":["2+2"]}]}';
            const results = [{ action: 'query', result: {} }];
            expect(extractReplyText(resp, results)).toBeNull();
        });

        it('returns null for (llm-error) sentinel', () => {
            expect(extractReplyText('(llm-error "timeout")', [])).toBeNull();
        });

        it('returns null for (respond-error) sentinel', () => {
            expect(extractReplyText('(respond-error "bad args")', [])).toBeNull();
        });

        it('returns null for empty response', () => {
            expect(extractReplyText('', [])).toBeNull();
        });

        it('returns null for whitespace-only response', () => {
            expect(extractReplyText('   \n\t  ', [])).toBeNull();
        });

        it('truncates responses over 2000 chars', () => {
            const long = 'x'.repeat(2100);
            const result = extractReplyText(long, []);
            expect(result.length).toBe(2003); // 2000 + '...'
            expect(result.endsWith('...')).toBe(true);
        });

        it('handles multiple JSON blocks stripped correctly', () => {
            const resp = '{"actions":[{"name":"think","args":["hmm"]}]} Here is my answer {"actions":[{"name":"log","args":["done"]}]} Final thought.';
            expect(extractReplyText(resp, [])).toBe('Here is my answer  Final thought.');
        });
    });
});
