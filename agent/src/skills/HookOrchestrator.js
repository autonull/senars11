/**
 * HookOrchestrator.js — Pre/post-skill hook execution engine
 *
 * Governed by: executionHooks capability flag
 *
 * Provides declarative hook system for skill execution interception.
 * Hooks are defined in hooks.metta and loaded at startup.
 *
 * Hook actions:
 * - (allow) — proceed with original/modified args
 * - (deny reason) — block execution, emit audit event
 * - (rewrite new-args) — mutate arguments before handler (pre-hook only)
 * - (audit event) — append to audit log (post-hook only)
 */

import { Logger } from '@senars/core';
import { Parser } from '../../../metta/src/Parser.js';
import { isExpression, sym, str, grounded } from '../../../metta/src/kernel/Term.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export class HookOrchestrator {
  constructor(config, auditSpace) {
    this.config = config;
    this.auditSpace = auditSpace;
    this.hooks = { pre: [], post: [] };
    this.parser = new Parser();
    this.loaded = false;
    
    Logger.info('[HookOrchestrator] Initialized');
  }

  /**
   * Load hooks from hooks.metta file.
   */
  async loadHooksFromFile(path) {
    try {
      if (!existsSync(path)) {
        Logger.warn('[HookOrchestrator] No hooks.metta found at', path);
        return;
      }
      
      const content = readFileSync(path, 'utf-8');
      const atoms = this.parser.parse(content);
      
      // Extract hook declarations
      const hookAtoms = this._extractHooks(atoms);
      
      for (const hook of hookAtoms) {
        const phase = hook.phase; // 'pre' or 'post'
        const pattern = hook.pattern; // skill pattern to match
        const body = hook.body; // hook body expression
        
        this.hooks[phase].push({ pattern, body, order: this.hooks[phase].length });
      }
      
      this.loaded = true;
      Logger.info('[HookOrchestrator] Loaded hooks', {
        pre: this.hooks.pre.length,
        post: this.hooks.post.length
      });
    } catch (error) {
      Logger.error('[HookOrchestrator] Failed to load hooks:', error);
      throw error;
    }
  }

  /**
   * Run pre-skill hooks for a given skill call.
   * Returns { action: 'allow'|'deny'|'rewrite', newArgs?, reason? }
   */
  async runPreHooks(skillCall) {
    if (!this.config.capabilities?.executionHooks || !this.loaded) {
      return { action: 'allow' };
    }

    const { name, args } = skillCall;
    
    for (const hook of this.hooks.pre) {
      const match = this._matchPattern(hook.pattern, name, args);
      if (match) {
        try {
          const result = await this._evaluateHook(hook.body, match);
          
          if (result.action === 'deny') {
            Logger.info('[HookOrchestrator] Pre-hook denied', { skill: name, reason: result.reason });
            if (this.auditSpace) {
              await this.auditSpace.emitSkillBlocked(name, args, `hook-deny: ${result.reason}`);
            }
            return result;
          }
          
          if (result.action === 'rewrite') {
            Logger.debug('[HookOrchestrator] Pre-hook rewrote args', { skill: name });
            return result;
          }
        } catch (error) {
          Logger.error('[HookOrchestrator] Pre-hook error:', error);
          // On error, allow execution but log
        }
      }
    }
    
    return { action: 'allow' };
  }

  /**
   * Run post-skill hooks for a given skill call and result.
   * May emit audit events but cannot block execution.
   */
  async runPostHooks(skillCall, result) {
    if (!this.config.capabilities?.executionHooks || !this.loaded) {
      return;
    }

    const { name, args } = skillCall;
    
    for (const hook of this.hooks.post) {
      const match = this._matchPattern(hook.pattern, name, args);
      if (match) {
        try {
          await this._evaluateHook(hook.body, match, result);
        } catch (error) {
          Logger.error('[HookOrchestrator] Post-hook error:', error);
        }
      }
    }
  }

  /**
   * Register a hook programmatically.
   */
  registerHook(phase, pattern, body) {
    if (!['pre', 'post'].includes(phase)) {
      throw new Error(`Invalid hook phase: ${phase}`);
    }
    
    this.hooks[phase].push({ pattern, body, order: this.hooks[phase].length });
    Logger.debug('[HookOrchestrator] Registered hook', { phase, pattern });
  }

  /**
   * Clear all hooks (for testing).
   */
  clearHooks() {
    this.hooks = { pre: [], post: [] };
    this.loaded = false;
  }

  // ── Private ──────────────────────────────────────────────────────

  /**
   * Extract hook declarations from parsed MeTTa atoms.
   */
  _extractHooks(atom) {
    const hooks = [];
    
    if (!atom) return hooks;
    
    const process = (a) => {
      if (isExpression(a) && a.operator?.name === 'hook') {
        const components = a.components || [];
        if (components.length >= 3) {
          const phase = components[0]?.name;
          const pattern = components[1];
          const body = components[2];
          
          if (phase === 'pre' || phase === 'post') {
            hooks.push({ phase, pattern, body });
          }
        }
      }
      
      // Recurse into components
      for (const comp of (a.components || [])) {
        process(comp);
      }
    };
    
    process(atom);
    return hooks;
  }

  /**
   * Match a skill call against a hook pattern.
   * Returns bindings if matched, null otherwise.
   */
  _matchPattern(pattern, skillName, skillArgs) {
    if (!isExpression(pattern)) {
      return null;
    }
    
    const patternName = pattern.operator?.name;
    if (patternName !== skillName) {
      return null;
    }
    
    const patternArgs = pattern.components || [];
    const bindings = { name: skillName, args: skillArgs };
    
    // Match pattern arguments
    for (let i = 0; i < patternArgs.length; i++) {
      const patArg = patternArgs[i];
      const actualArg = skillArgs[i];
      
      if (patArg?.name?.startsWith('$')) {
        // Variable binding
        const varName = patArg.name.slice(1);
        bindings[varName] = actualArg;
      } else if (patArg?.name !== actualArg && patArg?.value !== actualArg) {
        // Literal mismatch
        return null;
      }
    }
    
    return bindings;
  }

  /**
   * Evaluate a hook body with given bindings.
   */
  async _evaluateHook(body, bindings, result = null) {
    // Simple hook body evaluation
    // Supports: (allow), (deny reason), (rewrite args), (audit-emit event)
    
    if (!isExpression(body)) {
      return { action: 'allow' };
    }
    
    const op = body.operator?.name;
    const components = body.components || [];
    
    if (op === 'allow') {
      return { action: 'allow' };
    }
    
    if (op === 'deny') {
      const reason = this._resolveArg(components[0], bindings);
      return { action: 'deny', reason: String(reason) };
    }
    
    if (op === 'rewrite') {
      // Extract new args from rewrite expression
      const newExpr = components[0];
      if (isExpression(newExpr)) {
        const newArgs = (newExpr.components || []).map(c => this._resolveArg(c, bindings));
        return { action: 'rewrite', newArgs };
      }
      return { action: 'allow' };
    }
    
    if (op === 'audit-emit') {
      // Emit audit event
      const event = this._resolveArg(components[0], bindings);
      if (this.auditSpace) {
        await this.auditSpace.emitEvent(event);
      }
      return { action: 'allow' };
    }
    
    if (op === 'if') {
      // Conditional: (if condition then else)
      const condition = components[0];
      const thenBranch = components[1];
      const elseBranch = components[2];
      
      const conditionResult = await this._evaluateCondition(condition, bindings);
      return this._evaluateHook(conditionResult ? thenBranch : elseBranch, bindings, result);
    }
    
    return { action: 'allow' };
  }

  /**
   * Evaluate a condition expression.
   */
  async _evaluateCondition(expr, bindings) {
    if (!isExpression(expr)) {
      return Boolean(this._resolveArg(expr, bindings));
    }
    
    const op = expr.operator?.name;
    const components = expr.components || [];
    
    if (op === 'contains-forbidden?') {
      const str = this._resolveArg(components[0], bindings);
      const forbidden = this.config.shell?.forbiddenPatterns || [];
      return forbidden.some(p => String(str).includes(p));
    }
    
    if (op === 'path-within?') {
      const path = this._resolveArg(components[0], bindings);
      const base = this._resolveArg(components[1], bindings);
      const resolved = join(process.cwd(), String(path));
      const baseResolved = join(process.cwd(), String(base));
      return resolved.startsWith(baseResolved);
    }
    
    if (op === 'capability-enabled?') {
      const flag = this._resolveArg(components[0], bindings);
      return Boolean(this.config.capabilities?.[String(flag)]);
    }
    
    return false;
  }

  /**
   * Resolve an argument value, applying bindings.
   */
  _resolveArg(atom, bindings) {
    if (!atom) return null;
    
    if (atom.name?.startsWith('$')) {
      const varName = atom.name.slice(1);
      return bindings[varName];
    }
    
    if (atom.value !== undefined) {
      return atom.value;
    }
    
    if (atom.name) {
      // Remove quotes from string atoms
      return atom.name.replace(/^"|"$/g, '');
    }
    
    return String(atom);
  }
}

// Singleton pattern
let _instance = null;

export function getHookOrchestrator(config, auditSpace) {
  if (!_instance) {
    _instance = new HookOrchestrator(config, auditSpace);
  }
  return _instance;
}

export function resetHookOrchestrator() {
  _instance = null;
}
