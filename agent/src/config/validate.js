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

    for (const key of Object.keys(config.capabilities ?? {})) {
        if (!(key in DEFAULTS)) {
            errors.push(`Unknown capability: ${key}`);
        }
    }

    const lm = config.lm ?? {};
    if (lm.provider === 'openai' && !lm.apiKey && !process.env.OPENAI_API_KEY) {
        errors.push('OpenAI provider selected but no API key configured (set lm.apiKey or OPENAI_API_KEY)');
    }
    if (lm.provider === 'anthropic' && !lm.apiKey && !process.env.ANTHROPIC_API_KEY) {
        errors.push('Anthropic provider selected but no API key configured (set lm.apiKey or ANTHROPIC_API_KEY)');
    }

    if (config.channels?.irc?.enabled && !config.channels.irc.host) {
        errors.push('IRC channel enabled but no host configured');
    }
    if (config.channels?.nostr?.enabled && !config.channels.nostr.privateKey) {
        errors.push('Nostr channel enabled but no privateKey configured');
    }

    return errors;
}
