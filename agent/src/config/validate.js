/**
 * validate.js — Startup configuration validation for agent.json
 * Run in Agent.initialize() before validateDeps().
 * Per METTACLAW §5.9 — Invalid configurations should produce clear errors.
 */
import {DEFAULTS} from './capabilities.js';

const VALID_PROFILES = ['minimal', 'parity', 'evolved', 'full'];

export function validate(config) {
    const errors = [];

    if (config.profile && !VALID_PROFILES.includes(config.profile)) {
        errors.push(`Unknown profile '${config.profile}'. Valid: ${VALID_PROFILES.join(', ')}`);
    }

    // Capability keys are optional — unknown keys are harmlessly ignored.
    // Only profile and provider need validation.

    const lm = config.lm ?? {};
    if (lm.provider === 'openai' && !lm.apiKey && !process.env.OPENAI_API_KEY) {
        errors.push('OpenAI provider selected but no API key configured (set lm.apiKey or OPENAI_API_KEY)');
    }
    if (lm.provider === 'anthropic' && !lm.apiKey && !process.env.ANTHROPIC_API_KEY) {
        errors.push('Anthropic provider selected but no API key configured (set lm.apiKey or ANTHROPIC_API_KEY)');
    }

    // IRC embodiment — only validate when explicitly connecting to external server
    const ircEmb = config.embodiments?.irc ?? config.channels?.irc;
    // host: null means embedded server (valid), host: 'example.com' means external
    // No validation needed — the bot handles both cases correctly
    const nostrEmb = config.channels?.nostr;
    if (nostrEmb?.enabled && !nostrEmb.privateKey) {
        errors.push('Nostr channel enabled but no privateKey configured');
    }

    return errors;
}
