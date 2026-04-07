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
    // Stub
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
    try {
      const json = JSON.parse(respStr);
      if (json.actions && Array.isArray(json.actions)) {
        return { cmds: json.actions, error: null };
      }
      return { cmds: [], error: 'no actions found' };
    } catch (e) {
      return { cmds: [], error: e.message };
    }
  }

  async execute(cmds) {
    return Promise.all(cmds.map(cmd => this._dispatch(cmd)));
  }

  async _dispatch({ name, args }) {
    const entry = this._handlers.get(name);
    if (!entry) {
      return { name, error: `unknown-action: ${name}` };
    }
    if (!isEnabled(this._config, entry.capFlag)) {
      return { name, error: `capability-disabled: ${entry.capFlag}` };
    }
    try {
      const result = await entry.handler(...(args || []));
      return { name, result };
    } catch (e) {
      return { name, error: e.message };
    }
  }

  getActiveActionDefs() {
    const lines = [];
    for (const [name, decl] of this._actionDecls) {
      if (isEnabled(this._config, decl.capFlag)) {
        lines.push(`• ${name}: ${decl.description}`);
      }
    }
    return lines.length ? lines.join('\n') : '(no actions available)';
  }

  hasAction(name) {
    return this._handlers.has(name);
  }
}
