/**
 * SafetyLayer.js — Reflective consequence analysis before skill execution
 *
 * Before any side-effecting skill executes, the SafetyLayer does a forward-
 * inference pass over safety.metta rules. Unsafe results abort execution
 * and produce an audit record.
 *
 * Architecture:
 * - Loads safety.metta consequence rules into a MeTTa interpreter
 * - On check(skillName, args): pattern-matches against rules, infers consequences
 * - Returns { cleared: boolean, consequence?, risk? }
 * - Fails closed on timeout (50ms budget)
 *
 * Risk tiers (from capability tiers):
 *   :reflect    — always permitted (internal operations)
 *   :memory     — low risk (memory operations)
 *   :local-read — low risk (read within cwd)
 *   :network    — medium risk (external communication)
 *   :local-write — medium risk (file modification)
 *   :system     — high risk (OS commands)
 *   :meta       — medium/high risk (self-modification)
 *
 * When executionHooks is enabled, SafetyLayer becomes the first pre-skill
 * hook in the HookOrchestrator pipeline.
 */

import { Logger } from '@senars/core';
import { MeTTaInterpreter } from '../../../metta/src/MeTTaInterpreter.js';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SAFETY_TIMEOUT_MS = 50;

/**
 * Risk level ordering for tier gates
 */
const RISK_ORDER = {
    ':low': 1,
    ':medium': 2,
    ':high': 3,
    ':critical': 4
};

/**
 * Tier gates — which risk levels require safetyLayer capability
 */
const TIER_GATES = {
    ':reflect': { requiresSafety: false, maxRisk: 1 },
    ':memory': { requiresSafety: true, maxRisk: 1 },
    ':local-read': { requiresSafety: true, maxRisk: 1 },
    ':network': { requiresSafety: true, maxRisk: 2 },
    ':local-write': { requiresSafety: true, maxRisk: 2 },
    ':system': { requiresSafety: true, maxRisk: 3 },
    ':meta': { requiresSafety: true, maxRisk: 3 }
};

export class SafetyLayer {
    constructor(config) {
        this._config = config;
        this._interpreter = null;
        this._rulesLoaded = false;
        this._initialized = false;
    }

    /**
     * Initialize the MeTTa interpreter and load safety rules.
     */
    async initialize() {
        if (this._initialized) return;

        try {
            this._interpreter = new MeTTaInterpreter(null, {
                maxReductionSteps: 100
            });

            // Load safety.metta rules
            const rulesPath = join(__dir, '../metta/safety.metta');
            const rulesContent = await readFile(rulesPath, 'utf8');
            await this._interpreter.run(rulesContent);

            this._rulesLoaded = true;
            Logger.info('[SafetyLayer] Initialized with safety.metta rules');
        } catch (err) {
            Logger.error(`[SafetyLayer] Initialization failed: ${err.message}`);
            this._rulesLoaded = false;
        }

        this._initialized = true;
    }

    /**
     * Check if a skill call is safe to execute.
     *
     * @param {string} skillName - Name of the skill
     * @param {Array} args - Skill arguments
     * @param {string} tier - Skill tier (:reflect, :memory, :network, etc.)
     * @returns {Promise<{cleared: boolean, consequence?: string, risk?: string, reason?: string}>}
     */
    async check(skillName, args, tier = ':unknown') {
        // If safetyLayer is disabled in config, always clear
        if (!this._config?.capabilities?.safetyLayer) {
            return { cleared: true };
        }

        await this.initialize();

        if (!this._rulesLoaded) {
            Logger.warn('[SafetyLayer] Rules not loaded, failing closed');
            return { cleared: false, reason: 'safety-rules-not-loaded' };
        }

        // Apply tier gate first
        const tierInfo = TIER_GATES[tier] || { requiresSafety: true, maxRisk: 2 };
        if (!tierInfo.requiresSafety) {
            Logger.debug(`[SafetyLayer] ${skillName} tier :reflect, auto-cleared`);
            return { cleared: true };
        }

        // Pattern-match against safety rules with timeout
        const result = await this._checkWithTimeout(skillName, args, tierInfo.maxRisk);

        if (result.cleared) {
            Logger.debug(`[SafetyLayer] ${skillName} cleared (risk: ${result.risk})`);
        } else {
            Logger.warn(`[SafetyLayer] ${skillName} blocked: ${result.reason}`);
        }

        return result;
    }

    /**
     * Check skill safety with timeout.
     */
    async _checkWithTimeout(skillName, args, maxAllowedRisk) {
        const timeoutPromise = new Promise(resolve => {
            setTimeout(() => {
                resolve({
                    cleared: false,
                    reason: 'safety-check-timeout',
                    risk: ':unknown'
                });
            }, SAFETY_TIMEOUT_MS);
        });

        const checkPromise = this._inferConsequence(skillName, args, maxAllowedRisk);

        try {
            return await Promise.race([checkPromise, timeoutPromise]);
        } catch (err) {
            Logger.error(`[SafetyLayer] Check error: ${err.message}`);
            return { cleared: false, reason: `safety-check-error: ${err.message}` };
        }
    }

    /**
     * Infer consequence of skill execution via MeTTa pattern matching.
     */
    async _inferConsequence(skillName, args, maxAllowedRisk) {
        // Build the skill call pattern
        const argsStr = args.map(a => {
            const s = String(a);
            return s.includes(' ') || s.includes('"') ? `"${s}"` : s;
        }).join(' ');

        const skillCall = `(${skillName} ${argsStr})`;

        // Query: (consequence-of (skillName ...) $consequence $risk)
        const query = `(consequence-of ${skillCall} $consequence $risk)`;

        try {
            // Run the query against loaded rules
            const results = await this._interpreter.run(query);

            if (!results || results.length === 0) {
                // No matching rule found — default to medium risk assumption
                Logger.debug(`[SafetyLayer] No rule for ${skillName}, assuming :medium risk`);
                return {
                    cleared: maxAllowedRisk >= 2,
                    consequence: '(unknown-consequence)',
                    risk: ':medium'
                };
            }

            // Extract consequence and risk from first match
            const match = results[0];
            const { consequence, risk } = this._extractMatch(match);

            const riskLevel = RISK_ORDER[risk] ?? 2;
            const cleared = riskLevel <= maxAllowedRisk;

            return {
                cleared,
                consequence,
                risk,
                reason: cleared ? undefined : `risk-${risk}-exceeds-tier-gate`
            };
        } catch (err) {
            Logger.error(`[SafetyLayer] Inference error: ${err.message}`);
            return {
                cleared: false,
                reason: `inference-error: ${err.message}`
            };
        }
    }

    /**
     * Extract consequence and risk from MeTTa match result.
     */
    _extractMatch(match) {
        // Match format depends on MeTTa output
        // Expected: bindings like { $consequence: ..., $risk: ... }
        if (match && typeof match === 'object') {
            const consequence = this._formatAtom(match.$consequence);
            const risk = this._formatAtom(match.$risk);
            return { consequence, risk: risk || ':medium' };
        }

        // Fallback: parse string representation
        const str = String(match);
        const riskMatch = str.match(/:(${\w+})/);
        return {
            consequence: str,
            risk: riskMatch ? riskMatch[0] : ':medium'
        };
    }

    /**
     * Format a MeTTa atom as a string.
     */
    _formatAtom(atom) {
        if (!atom) return '';
        if (typeof atom === 'string') return atom;
        if (atom.name !== undefined) return atom.name;
        if (atom.value !== undefined) return String(atom.value);
        if (Array.isArray(atom)) return atom.map(a => this._formatAtom(a)).join(' ');
        return String(atom);
    }

    /**
     * Get all loaded safety rules (for introspection).
     */
    getRules() {
        return this._interpreter?.space?.getAll() ?? [];
    }
}

/**
 * Singleton instance for use across the application
 */
let _instance = null;

export function getSafetyLayer(config) {
    if (!_instance) {
        _instance = new SafetyLayer(config);
    }
    return _instance;
}
