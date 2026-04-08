/**
 * SkillDispatcher.js — S-expression parse + dispatch + registry
 *
 * Owns both registration and dispatch. When sExprSkillDispatch is false,
 * the dispatcher still exists but parse() returns [] and callers fall back
 * to ToolAdapter.js JSON path.
 *
 * Response format expected from LLM:
 *   ((skill1 "arg1" "arg2") (skill2 "arg3"))
 *
 * The outer list is parsed as an expression whose operator is the first
 * command and whose components are the remaining commands.
 *
 * Phase 4: Integrated SafetyLayer and AuditSpace for safety checks and audit logging.
 * Phase 4.5: Integrated HookOrchestrator for declarative pre/post hooks.
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
    this._handlers = new Map(); // name → { handler, capFlag, tier }
    this._parser = new Parser();
    this._safetyLayer = null;
    this._auditSpace = null;
  }

  /**
   * Initialize safety layer, audit space, and hook orchestrator (lazy, on first use).
   * Phase 4.5: Also loads hooks.metta when executionHooks enabled.
   */
  async _ensureSafetyAndAudit() {
    if (this._config?.capabilities?.safetyLayer && !this._safetyLayer) {
      this._safetyLayer = getSafetyLayer(this._config);
      await this._safetyLayer.initialize();
    }
    if (this._config?.capabilities?.auditLog && !this._auditSpace) {
      this._auditSpace = new AuditSpace(this._config);
      await this._auditSpace.initialize();
    }
    // Phase 4.5: Load hooks
    if (this._config?.capabilities?.executionHooks) {
      const hookOrchestrator = getHookOrchestrator(this._config, this._auditSpace);
      if (!hookOrchestrator.loaded) {
        const { join } = await import('path');
        const hooksPath = join(process.cwd(), 'agent', 'src', 'metta', 'hooks.metta');
        await hookOrchestrator.loadHooksFromFile(hooksPath);
      }
    }
  }

  /**
   * Register a JS handler for a named skill.
   * @param {string}   name     — skill name (matches skills.metta)
   * @param {Function} handler  — async (arg0, arg1, ...) → string result
   * @param {string}   capFlag  — capability flag that gates this skill
   * @param {string}   tier     — ':reflect' | ':network' | ':memory' | ':local-read' | ':local-write' | ':system' | ':meta'
   */
  register(name, handler, capFlag, tier) {
    this._handlers.set(name, { handler, capFlag, tier });
  }

  /**
   * Parse an LLM response string into an array of { name, args } commands.
   * Returns { cmds, error }. On parse failure, cmds is [] and error is set.
   */
  parseResponse(responseStr) {
    if (!isEnabled(this._config, 'sExprSkillDispatch')) {
      return { cmds: [], error: null };
    }

    const str = (responseStr ?? '').trim();
    if (!str) return { cmds: [], error: null };

    // Balance parentheses (MeTTaClaw-style recovery)
    const balanced = this._balanceParens(str);

    let atom;
    try {
      atom = this._parser.parse(balanced);
    } catch (err) {
      return { cmds: [], error: `parse-error: ${err.message}` };
    }

    if (!atom) return { cmds: [], error: null };

    const cmds = this._extractCommands(atom);
    const max = this._config.loop?.maxSkillsPerCycle ?? 3;
    return { cmds: cmds.slice(0, max), error: null };
  }

  /**
   * Execute an array of { name, args } commands.
   * Returns array of { skill, result, error }.
   *
   * Phase 4: Routes through SafetyLayer if enabled, emits audit events.
   */
  async execute(cmds) {
    if (!Array.isArray(cmds) || cmds.length === 0) return [];

    // Initialize safety and audit subsystems lazily
    await this._ensureSafetyAndAudit();

    const results = [];
    for (const cmd of cmds) {
      results.push(await this._dispatch(cmd));
    }
    return results;
  }

  /**
   * Returns S-expression strings for all skills whose capability flag is
   * currently enabled. Used to populate the SKILLS context slot.
   */
  getActiveSkillDefs() {
    const lines = [];
    for (const [name, { capFlag, tier }] of this._handlers) {
      if (isEnabled(this._config, capFlag)) {
        lines.push(`(${name} ...)`);
      }
    }
    if (lines.length === 0) return '(no skills available)';
    return lines.join('\n');
  }

  hasSkill(name) {
    return this._handlers.has(name);
  }

  // ── Private ──────────────────────────────────────────────────────

  /**
   * Dispatch a single command with hook orchestration, safety check, and audit logging.
   * Phase 4.5: Routes through HookOrchestrator before SafetyLayer.
   */
  async _dispatch({ name, args }) {
    const entry = this._handlers.get(name);

    if (!entry) {
      return { skill: name, result: null, error: `unknown-skill: ${name}` };
    }

    if (!isEnabled(this._config, entry.capFlag)) {
      return { skill: name, result: null, error: `capability-disabled: ${entry.capFlag}` };
    }

    // Phase 4.5: Hook orchestration (before safety layer)
    let currentArgs = args;
    if (this._config.capabilities?.executionHooks) {
      const hookOrchestrator = getHookOrchestrator(this._config, this._auditSpace);
      const preHookResult = await hookOrchestrator.runPreHooks({ name, args: currentArgs });
      
      if (preHookResult.action === 'deny') {
        return { skill: name, result: null, error: `hook-deny: ${preHookResult.reason}` };
      }
      if (preHookResult.action === 'rewrite') {
        currentArgs = preHookResult.newArgs || currentArgs;
      }
    }

    // Phase 4: Safety check before execution
    if (this._safetyLayer && this._config?.capabilities?.safetyLayer) {
      const safety = await this._safetyLayer.check(name, currentArgs, entry.tier);
      if (!safety.cleared) {
        // Emit audit event for blocked skill
        if (this._auditSpace && this._config?.capabilities?.auditLog) {
          await this._auditSpace.emitSkillBlocked(name, currentArgs, safety.reason);
        }
        return { skill: name, result: null, error: `safety-blocked: ${safety.reason}` };
      }
    }

    // Execute the skill handler
    let result;
    let error = null;
    try {
      result = await entry.handler(...currentArgs);
    } catch (err) {
      error = err.message;
    }

    // Phase 4.5: Post-hook execution
    if (this._config.capabilities?.executionHooks) {
      const hookOrchestrator = getHookOrchestrator(this._config, this._auditSpace);
      await hookOrchestrator.runPostHooks({ name, args: currentArgs }, result ?? error);
    }

    // Phase 4: Audit logging for skill invocation
    if (this._auditSpace && this._config?.capabilities?.auditLog) {
      await this._auditSpace.emitSkillInvoked(name, currentArgs, result ?? error);
    }

    return { skill: name, result, error };
  }

  /**
   * Extract commands from a parsed MeTTa atom.
   *
   * The LLM outputs: ((cmd1 arg1) (cmd2 arg2) (cmd3 arg3))
   * The MeTTa parser sees this as an expression where:
   *   operator = (cmd1 arg1)   ← first command
   *   components = [(cmd2 arg2), (cmd3 arg3)]  ← remaining commands
   *
   * We collect operator (if it's an expression) + all components that
   * are expressions.
   */
  _extractCommands(atom) {
    const commands = [];

    if (!isExpression(atom)) {
      // Single command with no outer wrapper: (cmd arg)
      const cmd = this._parseCommand(atom);
      if (cmd) commands.push(cmd);
      return commands;
    }

    // Outer wrapper expression: operator is first cmd, components are rest
    if (isExpression(atom.operator)) {
      const cmd = this._parseCommand(atom.operator);
      if (cmd) commands.push(cmd);
    } else if (atom.operator?.name && atom.operator.name !== '()') {
      // Plain symbol operator with components — treat whole atom as one command
      const cmd = this._parseCommand(atom);
      if (cmd) commands.push(cmd);
      return commands;
    }

    for (const comp of (atom.components ?? [])) {
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
    // Grounded atom with a JS value
    if (atom.value !== undefined) return atom.value;
    // String atom (quoted strings in MeTTa)
    if (atom.type === 'str' || (atom.name && atom.name.startsWith('"'))) {
      return (atom.name ?? atom.value ?? '').replace(/^"|"$/g, '');
    }
    // Symbol or number
    if (atom.name !== undefined) {
      const n = Number(atom.name);
      return isNaN(n) ? atom.name : n;
    }
    // Expression — return as string representation
    if (isExpression(atom)) {
      const opStr = atom.operator?.name ?? '';
      const argStr = (atom.components ?? []).map(c => this._atomToJS(c)).join(' ');
      return argStr ? `(${opStr} ${argStr})` : `(${opStr})`;
    }
    return String(atom);
  }

  /**
   * Balance parentheses in an S-expression string.
   * Adds missing closing parens or removes extra opening parens.
   */
  _balanceParens(str) {
    let depth = 0;
    let inString = false;
    let escaped = false;

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
