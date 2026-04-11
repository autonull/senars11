/**
 * IntegrationContract.js — Formal protocol definitions for cross-component interoperability
 *
 * This module defines the canonical data shapes that flow between subsystems.
 * Every boundary (I/O, LLM, skills, reasoning, persistence) must validate
 * against these contracts — reject invalid, never silently normalize.
 */

/* ═══════════════════════════════════════════════════════════════════════
 * 1. MESSAGE ENVELOPE — I/O → MeTTaLoop
 * ═══════════════════════════════════════════════════════════════════════ */

export const MessageEnvelope = {
    required: ['text', 'from', 'embodimentId', 'content'],
    validate(msg) {
        const errors = [];
        if (!msg) errors.push('message is null/undefined');
        else {
            for (const field of this.required) {
                if (msg[field] == null || msg[field] === '') {
                    errors.push(`missing required field: ${field}`);
                }
            }
            if (msg.from === 'unknown' || msg.from === '') {
                errors.push(`invalid sender: "${msg.from}"`);
            }
        }
        return errors.length === 0 ? { valid: true } : { valid: false, errors };
    }
};

/* ═══════════════════════════════════════════════════════════════════════
 * 2. ACTION RESULT — ActionDispatcher → Consumer
 * ═══════════════════════════════════════════════════════════════════════ */

export const ActionResult = {
    validate(result) {
        if (!result || typeof result.action !== 'string') {
            return { valid: false, errors: ['missing action name'] };
        }
        if (typeof result.success !== 'boolean') {
            return { valid: false, errors: ['missing success boolean'] };
        }
        return { valid: true };
    }
};

/* ═══════════════════════════════════════════════════════════════════════
 * 3. LLM ACTION — JSON tool call protocol
 * ═══════════════════════════════════════════════════════════════════════ */

export const LLMActionProtocol = {
    // Validated action schemas
    actions: {
        respond: { args: ['string'], desc: 'Send text response to user' },
        think: { args: ['string'], desc: 'Record internal thought' },
        send: { args: ['string'], desc: 'Send message to channel' },
        remember: { args: ['string'], desc: 'Store to semantic memory' },
        search: { args: ['string'], desc: 'Web search query' },
        attend: { args: ['string', 'number?'], desc: 'Add to working memory' },
        dismiss: { args: ['string'], desc: 'Remove from working memory' },
        'read-file': { args: ['string'], desc: 'Read file contents' },
        'write-file': { args: ['string', 'string'], desc: 'Write file contents' },
    },

    validate(actions) {
        if (!Array.isArray(actions)) return { valid: false, errors: ['actions must be array'] };
        const errors = [];
        for (const action of actions) {
            if (!action.name || typeof action.name !== 'string') {
                errors.push('action missing name');
                continue;
            }
            if (!this.actions[action.name]) {
                errors.push(`unknown action: ${action.name}`);
            }
            if (!Array.isArray(action.args)) {
                errors.push(`action ${action.name}: args must be array`);
            }
        }
        return errors.length === 0 ? { valid: true } : { valid: false, errors };
    },

    // Convert to human-readable skill list for LLM prompt
    describe() {
        return Object.entries(this.actions)
            .map(([name, info]) => `  • ${name}(${info.args.join(', ')}): ${info.desc}`)
            .join('\n');
    }
};

/* ═══════════════════════════════════════════════════════════════════════
 * 4. IRC MESSAGE — irc-framework → IRCChannel → Embodiment
 * ═══════════════════════════════════════════════════════════════════════ */

export const IRCMessage = {
    validate(event) {
        const errors = [];
        if (!event) return { valid: false, errors: ['null event'] };
        if (!event.nick) errors.push('missing nick — server message, drop');
        if (event.message == null || event.message === '') errors.push('empty message content');
        if (!event.target) errors.push('missing target/channel');
        return errors.length === 0 ? { valid: true } : { valid: false, errors };
    }
};

/* ═══════════════════════════════════════════════════════════════════════
 * 5. NAR INPUT — External text → InputProcessor → NARS
 * ═══════════════════════════════════════════════════════════════════════ */

export const NARInput = {
    maxInputLength: 4096,
    forbiddenPattern: /[\x00-\x08\x0e-\x1f\x7f]/,

    validate(input) {
        const errors = [];
        if (typeof input !== 'string') {
            return { valid: false, errors: ['input must be string'] };
        }
        const trimmed = input.trim();
        if (!trimmed) return { valid: false, errors: ['empty input after trim'] };
        if (trimmed.length > this.maxInputLength) {
            errors.push(`input too long: ${trimmed.length} chars (max ${this.maxInputLength})`);
        }
        if (this.forbiddenPattern.test(trimmed)) {
            errors.push('input contains control characters');
        }
        return errors.length === 0 ? { valid: true, normalized: trimmed } : { valid: false, errors };
    }
};

/* ═══════════════════════════════════════════════════════════════════════
 * 6. LLM RESPONSE — AIClient → Consumer
 * ═══════════════════════════════════════════════════════════════════════ */

export const LLMResponse = {
    validate(result) {
        const errors = [];
        if (!result) return { valid: false, errors: ['null result'] };
        if (result.text != null && typeof result.text !== 'string') {
            errors.push('text field is not a string');
        }
        if (result.response != null && typeof result.response !== 'string') {
            errors.push('response field is not a string');
        }
        return errors.length === 0 ? { valid: true } : { valid: false, errors };
    },
    extractText(result) {
        return result?.text ?? result?.response ?? '';
    }
};
