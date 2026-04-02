/**
 * SkillDispatcher.js — S-expression parse + dispatch + registry
 */

import { Parser } from '../../../metta/src/Parser.js';
import { isExpression } from '../../../metta/src/kernel/Term.js';
import { isEnabled } from '../config/capabilities.js';
import { getSafetyLayer } from '../safety/SafetyLayer.js';
import { AuditSpace } from '../memory/AuditSpace.js';
import { getHookOrchestrator } from './HookOrchestrator.js';

export class SkillDispatcher {
  constructor(config) {
    this._config = config;
    this._handlers = new Map();
    this._parser = new Parser();
    this._safetyLayer = null;
    this._auditSpace = null;
  }

  async _ensureSafetyAndAudit() {
    if (this._config?.capabilities?.safetyLayer && !this._safetyLayer) {
      this._safetyLayer = getSafetyLayer(this._config);
      await this._safetyLayer.initialize();
    }
    if (this._config?.capabilities?.auditLog && !this._auditSpace) {
      this._auditSpace = new AuditSpace(this._config);
      await this._auditSpace.initialize();
    }
    if (this._config?.capabilities?.executionHooks) {
      const orchestrator = getHookOrchestrator(this._config, this._auditSpace);
      if (!orchestrator.loaded) {
        const { join } = await import('path');
        await orchestrator.loadHooksFromFile(join(process.cwd(), 'agent', 'src', 'metta', 'hooks.metta'));
      }
    }
  }

  register(name, handler, capFlag, tier) {
    this._handlers.set(name, { handler, capFlag, tier });
  }

  parseResponse(responseStr) {
    if (!isEnabled(this._config, 'sExprSkillDispatch')) {
      return { cmds: [], error: null };
    }

    const str = (responseStr ?? '').trim();
    if (!str) return { cmds: [], error: null };

    const balanced = this._balanceParens(str);
    let atom;
    try {
      atom = this._parser.parse(balanced);
    } catch (err) {
      return { cmds: [], error: `parse-error: ${err.message}` };
    }

    if (!atom) return { cmds: [], error: null };

    const cmds = this._extractCommands(atom);
    return { cmds: cmds.slice(0, this._config.loop?.maxSkillsPerCycle ?? 3), error: null };
  }

  async execute(cmds) {
    if (!Array.isArray(cmds) || cmds.length === 0) return [];
    await this._ensureSafetyAndAudit();

    const results = [];
    for (const cmd of cmds) {
      results.push(await this._dispatch(cmd));
    }
    return results;
  }

  getActiveSkillDefs() {
    const lines = [];
    for (const [name, { capFlag }] of this._handlers) {
      if (isEnabled(this._config, capFlag)) lines.push(`(${name} ...)`);
    }
    return lines.length ? lines.join('\n') : '(no skills available)';
  }

  hasSkill(name) {
    return this._handlers.has(name);
  }

  async _dispatch({ name, args }) {
    const entry = this._handlers.get(name);
    if (!entry) return { skill: name, result: null, error: `unknown-skill: ${name}` };
    if (!isEnabled(this._config, entry.capFlag)) {
      return { skill: name, result: null, error: `capability-disabled: ${entry.capFlag}` };
    }

    let currentArgs = args;
    if (this._config.capabilities?.executionHooks) {
      const orchestrator = getHookOrchestrator(this._config, this._auditSpace);
      const preHookResult = await orchestrator.runPreHooks({ name, args: currentArgs });
      if (preHookResult.action === 'deny') {
        return { skill: name, result: null, error: `hook-deny: ${preHookResult.reason}` };
      }
      if (preHookResult.action === 'rewrite') currentArgs = preHookResult.newArgs || currentArgs;
    }

    if (this._safetyLayer && this._config?.capabilities?.safetyLayer) {
      const safety = await this._safetyLayer.check(name, currentArgs, entry.tier);
      if (!safety.cleared) {
        if (this._auditSpace) await this._auditSpace.emitSkillBlocked(name, currentArgs, safety.reason);
        return { skill: name, result: null, error: `safety-blocked: ${safety.reason}` };
      }
    }

    let result, error = null;
    try {
      result = await entry.handler(...currentArgs);
    } catch (err) {
      error = err.message;
    }

    if (this._config.capabilities?.executionHooks) {
      const orchestrator = getHookOrchestrator(this._config, this._auditSpace);
      await orchestrator.runPostHooks({ name, args: currentArgs }, result ?? error);
    }
    if (this._auditSpace && this._config?.capabilities?.auditLog) {
      await this._auditSpace.emitSkillInvoked(name, currentArgs, result ?? error);
    }

    return { skill: name, result, error };
  }

  _extractCommands(atom) {
    const commands = [];
    if (!isExpression(atom)) {
      const cmd = this._parseCommand(atom);
      if (cmd) commands.push(cmd);
      return commands;
    }

    if (isExpression(atom.operator)) {
      const cmd = this._parseCommand(atom.operator);
      if (cmd) commands.push(cmd);
    } else if (atom.operator?.name && atom.operator.name !== '()') {
      const cmd = this._parseCommand(atom);
      if (cmd) return [cmd];
    }

    for (const comp of atom.components ?? []) {
      if (isExpression(comp)) {
        const cmd = this._parseCommand(comp);
        if (cmd) commands.push(cmd);
      }
    }
    return commands;
  }

  _parseCommand(atom) {
    if (!isExpression(atom)) return null;
    const name = atom.operator?.name;
    if (!name || name === '()') return null;
    const args = (atom.components ?? []).map(a => this._atomToJS(a));
    return { name, args };
  }

  _atomToJS(atom) {
    if (atom === null || atom === undefined) return '';
    if (atom.value !== undefined) return atom.value;
    if (atom.type === 'str' || (atom.name && atom.name.startsWith('"'))) {
      return (atom.name ?? atom.value ?? '').replace(/^"|"$/g, '');
    }
    if (atom.name !== undefined) {
      const n = Number(atom.name);
      return isNaN(n) ? atom.name : n;
    }
    if (isExpression(atom)) {
      const opStr = atom.operator?.name ?? '';
      const argStr = (atom.components ?? []).map(c => this._atomToJS(c)).join(' ');
      return argStr ? `(${opStr} ${argStr})` : `(${opStr})`;
    }
    return String(atom);
  }

  _balanceParens(str) {
    let depth = 0, inString = false, escaped = false;
    for (const ch of str) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
    }
    return str + ')'.repeat(depth);
  }
}
