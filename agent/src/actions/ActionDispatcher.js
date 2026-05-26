import { readFileSync, existsSync } from 'fs';
import { Logger } from '@senars/core';
import { isEnabled } from '../config/capabilities.js';

export class ActionDispatcher {
  constructor(config) {
    this._config = config;
    this._handlers = new Map();
    this._actionDecls = new Map();
    this._safetyLayer = null;
    this._auditSpace = null;
  }

  loadActionsFromFile(path) {
    if (!existsSync(path)) return;
    try {
      for (const line of readFileSync(path, 'utf-8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('(skill ')) continue;
        const decl = this._parseSkillDecl(trimmed);
        if (decl) this._actionDecls.set(decl.name, decl);
      }
    } catch (err) {
      Logger.warn('[ActionDispatcher] Failed to load actions from', path, err.message);
    }
  }

  _parseSkillDecl(line) {
    const m = line.match(/^\(skill\s+(\S+)\s+\S+\s+(\S+)\s+(\S+)\s+"([^"]*)"/);
    if (!m) return null;
    return { name: m[1], capFlag: m[2], tier: m[3], description: m[4] };
  }

  async _ensureSafetyAndAudit() {
    // Stub — overridden by MeTTaLoopBuilder after services are ready
  }

  register(name, handler, capFlag, tier, description = '') {
    const decl = this._actionDecls.get(name);
    if (decl) {
      if (decl.capFlag !== capFlag) {
        Logger.warn(`[ActionDispatcher] Capability mismatch for ${name}`);
      }
    } else {
      this._actionDecls.set(name, { name, capFlag, tier, description });
    }
    this._handlers.set(name, { handler, capFlag, tier });
  }

  parseResponse(respStr) {
    if (!respStr || typeof respStr !== 'string' || !respStr.trim()) {
      return { cmds: [], error: null };
    }
    if (!isEnabled(this._config, 'actionDispatch')) {
      return { cmds: [], error: null };
    }
    try {
      const json = JSON.parse(respStr);
      if (!json.actions || !Array.isArray(json.actions)) {
        return { cmds: [], error: null };
      }
      const maxActions = this._config.loop?.maxActionsPerCycle
        ?? this._config.loop?.maxSkillsPerCycle
        ?? Infinity;
      const cmds = json.actions.slice(0, maxActions);
      return { cmds, error: null };
    } catch {
      return { cmds: [], error: null };
    }
  }

  async execute(cmds) {
    if (!cmds?.length) return [];
    return Promise.all(cmds.map(cmd => this._dispatch(cmd)));
  }

  async _dispatch({ name, args }) {
    const entry = this._handlers.get(name);
    if (!entry) {
      return { action: name, error: `unknown-action: ${name}` };
    }
    if (!isEnabled(this._config, entry.capFlag)) {
      return { action: name, error: `capability-disabled: ${entry.capFlag}` };
    }

    // Safety check
    if (isEnabled(this._config, 'safetyLayer') && this._safetyLayer) {
      try {
        const safetyResult = await this._safetyLayer.check(name, args, entry.tier);
        if (!safetyResult.cleared) {
          const reason = `safety-blocked: ${safetyResult.reason}`;
          if (this._auditSpace?.emitSkillBlocked) {
            const auditBlocked = this._auditSpace.emitSkillBlocked(name, args, safetyResult.reason);
            if (auditBlocked?.catch) auditBlocked.catch(() => {});
          }
          return { action: name, error: reason };
        }
      } catch {
        return { action: name, error: 'safety-check-failed' };
      }
    }

    // Audit: skill invoked
    const auditPending = this._auditSpace?.emitSkillInvoked?.(name, args, 'pending');
    if (auditPending?.catch) auditPending.catch(() => {});

    try {
      const result = await entry.handler(...(args || []));
      // Update audit with success
      const auditOk = this._auditSpace?.emitSkillInvoked?.(name, args, 'success');
      if (auditOk?.catch) auditOk.catch(() => {});
      return { action: name, result, error: null };
    } catch (e) {
      const auditErr = this._auditSpace?.emitSkillInvoked?.(name, args, e.message);
      if (auditErr?.catch) auditErr.catch(() => {});
      return { action: name, error: e.message };
    }
  }

  getActiveActionDefs() {
    const lines = [];
    for (const [name, decl] of this._actionDecls) {
      if (isEnabled(this._config, decl.capFlag)) {
        const args = decl.argTypes && decl.argTypes !== 'any' && decl.argTypes !== '()'
          ? `(${decl.argTypes})`
          : '';
        lines.push(`• ${name}${args}: ${decl.description}`);
      }
    }
    return lines.length ? lines.join('\n') : '(no actions available)';
  }

  hasAction(name) {
    return this._handlers.has(name);
  }
}
