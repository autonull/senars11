/**
 * SafetyLayer.js — Reflective consequence analysis before skill execution
 */

import { Logger } from '@senars/core';
import { MeTTaInterpreter } from '../../../metta/src/MeTTaInterpreter.js';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Workaround for Jest VM environment where import.meta.url might not be available
let __dir;
try {
    __dir = dirname(fileURLToPath(import.meta.url));
} catch (e) {
    __dir = typeof global !== 'undefined' && global.__dirname 
        ? global.__dirname 
        : process.cwd();
}
const SAFETY_TIMEOUT_MS = 50;

const RISK_ORDER = { ':low': 1, ':medium': 2, ':high': 3, ':critical': 4 };

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

  async initialize() {
    if (this._initialized) return;
    try {
      this._interpreter = new MeTTaInterpreter(null, { maxReductionSteps: 100 });
      const rulesPath = join(__dir, '../metta/safety.metta');
      await this._interpreter.run(await readFile(rulesPath, 'utf8'));
      this._rulesLoaded = true;
      Logger.info('[SafetyLayer] Initialized with safety.metta rules');
    } catch (err) {
      Logger.error(`[SafetyLayer] Initialization failed: ${err.message}`);
      this._rulesLoaded = false;
    }
    this._initialized = true;
  }

  async check(skillName, args, tier = ':unknown') {
    if (!this._config?.capabilities?.safetyLayer) return { cleared: true };
    await this.initialize();
    if (!this._rulesLoaded) {
      Logger.warn('[SafetyLayer] Rules not loaded, failing closed');
      return { cleared: false, reason: 'safety-rules-not-loaded' };
    }

    const tierInfo = TIER_GATES[tier] || { requiresSafety: true, maxRisk: 2 };
    if (!tierInfo.requiresSafety) {
      Logger.debug(`[SafetyLayer] ${skillName} tier :reflect, auto-cleared`);
      return { cleared: true };
    }

    const result = await this._checkWithTimeout(skillName, args, tierInfo.maxRisk);
    if (result.cleared) {
      Logger.debug(`[SafetyLayer] ${skillName} cleared (risk: ${result.risk})`);
    } else {
      Logger.warn(`[SafetyLayer] ${skillName} blocked: ${result.reason}`);
    }
    return result;
  }

  async _checkWithTimeout(skillName, args, maxAllowedRisk) {
    const timeout = new Promise(resolve => {
      setTimeout(() => resolve({ cleared: false, reason: 'safety-check-timeout', risk: ':unknown' }), SAFETY_TIMEOUT_MS);
    });
    const check = this._inferConsequence(skillName, args, maxAllowedRisk);
    try {
      return await Promise.race([check, timeout]);
    } catch (err) {
      Logger.error(`[SafetyLayer] Check error: ${err.message}`);
      return { cleared: false, reason: `safety-check-error: ${err.message}` };
    }
  }

  async _inferConsequence(skillName, args, maxAllowedRisk) {
    const argsStr = args.map(a => {
      const s = String(a);
      return s.includes(' ') || s.includes('"') ? `"${s}"` : s;
    }).join(' ');

    const query = `(consequence-of (${skillName} ${argsStr}) $consequence $risk)`;
    try {
      const results = await this._interpreter.run(query);
      if (!results?.length) {
        Logger.debug(`[SafetyLayer] No rule for ${skillName}, assuming :medium risk`);
        return { cleared: maxAllowedRisk >= 2, consequence: '(unknown-consequence)', risk: ':medium' };
      }

      const { consequence, risk } = this._extractMatch(results[0]);
      const riskLevel = RISK_ORDER[risk] ?? 2;
      return {
        cleared: riskLevel <= maxAllowedRisk,
        consequence,
        risk,
        reason: riskLevel <= maxAllowedRisk ? undefined : `risk-${risk}-exceeds-tier-gate`
      };
    } catch (err) {
      Logger.error(`[SafetyLayer] Inference error: ${err.message}`);
      return { cleared: false, reason: `inference-error: ${err.message}` };
    }
  }

  _extractMatch(match) {
    if (match && typeof match === 'object') {
      return {
        consequence: this._formatAtom(match.$consequence),
        risk: this._formatAtom(match.$risk) || ':medium'
      };
    }
    const str = String(match);
    const riskMatch = str.match(/:(${\w+})/);
    return { consequence: str, risk: riskMatch ? riskMatch[0] : ':medium' };
  }

  _formatAtom(atom) {
    if (!atom) return '';
    if (typeof atom === 'string') return atom;
    if (atom.name !== undefined) return atom.name;
    if (atom.value !== undefined) return String(atom.value);
    if (Array.isArray(atom)) return atom.map(a => this._formatAtom(a)).join(' ');
    return String(atom);
  }

  getRules() {
    return this._interpreter?.space?.getAll() ?? [];
  }
}

let _instance = null;
export function getSafetyLayer(config) {
  if (!_instance) _instance = new SafetyLayer(config);
  return _instance;
}
