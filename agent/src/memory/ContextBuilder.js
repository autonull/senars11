/**
 * ContextBuilder.js — JS wrapper for MeTTa context builder
 *
 * Governed by: contextBudgets capability flag
 *
 * Provides grounded op implementations for ContextBuilder.metta.
 * Context assembly happens in MeTTa; this class provides the JS bindings
 * that access memory systems, history, and configuration.
 */

import { Logger } from '@senars/core';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { isEnabled } from '../config/capabilities.js';

export class ContextBuilder {
  constructor(config, semanticMemory, historySpace, skillDispatcher, introspectionOps) {
    this.config = config;
    this.semanticMemory = semanticMemory;
    this.historySpace = historySpace;
    this.skillDispatcher = skillDispatcher;
    this.introspectionOps = introspectionOps;
    
    this.budgets = {
      pinnedMaxChars: config.memory?.pinnedMaxChars ?? 3000,
      wmRegisterChars: config.workingMemory?.maxEntries ? config.workingMemory.maxEntries * 75 : 1500,
      agentManifestChars: 2000,
      recallChars: config.memory?.maxRecallChars ?? 8000,
      recallItems: config.memory?.maxRecallItems ?? 20,
      historyChars: config.memory?.maxHistoryChars ?? 12000,
      feedbackChars: config.memory?.maxFeedbackChars ?? 6000
    };
    
    this.harnessPath = join(process.cwd(), 'memory', 'harness', 'prompt.metta');
    this.lastFeedback = null;
    this.lastError = null;
    
    Logger.info('[ContextBuilder] Initialized', { budgets: this.budgets });
  }

  /**
   * Register grounded ops with MeTTa interpreter.
   */
  registerGroundedOps(interp) {
    interp.registerOp('context-init', () => this._init());
    interp.registerOp('context-concat', (...sections) => this._concat(sections));
    interp.registerOp('load-harness-prompt', () => this._loadHarnessPrompt());
    interp.registerOp('default-system-prompt', () => this._defaultSystemPrompt());
    interp.registerOp('filter-capabilities', (mode) => this._filterCapabilities(mode));
    interp.registerOp('get-active-skills', () => this._getActiveSkills());
    interp.registerOp('get-pinned-memories', () => this._getPinnedMemories());
    interp.registerOp('get-wm-entries', () => this._getWmEntries());
    interp.registerOp('generate-manifest', () => this._generateManifest());
    interp.registerOp('query-memories', (msg, k) => this._queryMemories(msg, k));
    interp.registerOp('get-history', () => this._getHistory());
    interp.registerOp('get-feedback', () => this._getFeedback());
    interp.registerOp('format-input', (msg) => this._formatInput(msg));
    interp.registerOp('get-budget', (key) => this._getBudget(key));
    
    Logger.info('[ContextBuilder] Registered grounded ops');
  }

  /**
   * Build context for a given input message.
   * This is the JS entry point called by AgentLoop.
   */
  async build(msg) {
    try {
      const sections = await Promise.all([
        this._loadHarnessPrompt(),
        this._filterCapabilities('active'),
        this._getActiveSkills(),
        this._getPinnedMemories(),
        this._getWmEntries(),
        this._generateManifest(),
        this._queryMemories(msg, this.budgets.recallItems),
        this._getHistory(),
        this._getFeedback(),
        this._formatInput(msg)
      ]);

      const context = this._concat(sections);
      Logger.debug('[ContextBuilder] Built context', { length: context.length });
      return context;
    } catch (error) {
      Logger.error('[ContextBuilder] Failed to build context:', error);
      return this._defaultSystemPrompt();
    }
  }

  /**
   * Record feedback/error for next cycle's FEEDBACK slot.
   */
  recordFeedback(feedback, error = null) {
    this.lastFeedback = feedback;
    this.lastError = error;
  }

  // ── Grounded op implementations ─────────────────────────────────

  _init() {
    // Initialization hook (no-op for now)
    return 'ok';
  }

  _concat(sections) {
    return sections
      .filter(s => s && s.trim() !== '')
      .map((s, i) => {
        const headers = [
          'SYSTEM_PROMPT', 'CAPABILITIES', 'SKILLS', 'PINNED', 'WM_REGISTER',
          'AGENT_MANIFEST', 'RECALL', 'HISTORY', 'FEEDBACK', 'INPUT'
        ];
        if (i < headers.length && s.trim() !== '') {
          return `═══ ${headers[i]} ═══\n${s}\n\n`;
        }
        return s;
      })
      .join('');
  }

  _loadHarnessPrompt() {
    try {
      if (isEnabled(this.config, 'harnessOptimization') && existsSync(this.harnessPath)) {
        const content = readFileSync(this.harnessPath, 'utf-8');
        return this._truncate(content, this.budgets.pinnedMaxChars);
      }
    } catch (error) {
      Logger.warn('[ContextBuilder] Failed to load harness prompt:', error);
    }
    return this._defaultSystemPrompt();
  }

  _defaultSystemPrompt() {
    return `You are SeNARchy, a helpful AI assistant.
Respond concisely. Use S-expression skill calls when taking actions.
Example: ((send "Hello") (remember "User prefers concise responses"))`;
  }

  _filterCapabilities(mode) {
    const caps = this.config.capabilities || {};
    const active = Object.entries(caps)
      .filter(([_, enabled]) => enabled)
      .map(([name, _]) => name)
      .join(', ');
    
    return active || '(no capabilities enabled)';
  }

  _getActiveSkills() {
    if (!isEnabled(this.config, 'sExprSkillDispatch')) {
      return '(skill dispatch disabled — using JSON tool calls)';
    }
    return this.skillDispatcher?.getActiveSkillDefs() ?? '(no skills registered)';
  }

  async _getPinnedMemories() {
    if (!isEnabled(this.config, 'semanticMemory') || !this.semanticMemory) {
      return '';
    }
    try {
      const pinned = await this.semanticMemory.queryByType(':pinned');
      const content = pinned.map(m => m.content ?? String(m)).join('\n');
      return this._truncate(content, this.budgets.pinnedMaxChars);
    } catch (error) {
      Logger.warn('[ContextBuilder] Failed to get pinned memories:', error);
      return '';
    }
  }

  _getWmEntries() {
    // Working memory entries are managed by AgentLoop state
    // This returns a formatted string of current WM entries
    const wmEntries = this.config._wmEntries || [];
    if (wmEntries.length === 0) return '';
    
    const content = wmEntries
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .map(e => `[${e.priority?.toFixed(1) ?? '0.5'}] ${e.content} (TTL: ${e.ttl ?? 0})`)
      .join('\n');
    
    return this._truncate(content, this.budgets.wmRegisterChars);
  }

  _generateManifest() {
    if (!isEnabled(this.config, 'runtimeIntrospection') || !this.introspectionOps) {
      return '';
    }
    try {
      const manifest = this.introspectionOps.generateManifest();
      const content = typeof manifest === 'string' ? manifest : JSON.stringify(manifest, null, 2);
      return this._truncate(content, this.budgets.agentManifestChars);
    } catch (error) {
      Logger.warn('[ContextBuilder] Failed to generate manifest:', error);
      return '';
    }
  }

  async _queryMemories(msg, k) {
    if (!isEnabled(this.config, 'semanticMemory') || !this.semanticMemory) {
      return '';
    }
    try {
      const query = msg?.content || msg || 'recent context';
      const memories = await this.semanticMemory.query(query, k);
      const content = memories.map(m => m.content ?? String(m)).join('\n');
      return this._truncate(content, this.budgets.recallChars);
    } catch (error) {
      Logger.warn('[ContextBuilder] Failed to query memories:', error);
      return '';
    }
  }

  async _getHistory() {
    if (!isEnabled(this.config, 'persistentHistory') || !this.historySpace) {
      return '';
    }
    try {
      const history = await this.historySpace.getRecent(this.budgets.recallItems);
      const content = history.map(h => {
        const timestamp = h.timestamp ? new Date(h.timestamp).toISOString() : '?';
        return `[${timestamp}] ${h.content ?? h.message ?? String(h)}`;
      }).join('\n');
      return this._truncate(content, this.budgets.historyChars);
    } catch (error) {
      Logger.warn('[ContextBuilder] Failed to get history:', error);
      return '';
    }
  }

  _getFeedback() {
    const parts = [];
    if (this.lastFeedback) {
      parts.push(`Feedback: ${this.lastFeedback}`);
    }
    if (this.lastError) {
      parts.push(`Error: ${this.lastError}`);
    }
    const content = parts.join('\n');
    this.lastFeedback = null;
    this.lastError = null;
    return this._truncate(content, this.budgets.feedbackChars);
  }

  _formatInput(msg) {
    if (!msg) {
      return isEnabled(this.config, 'autonomousLoop')
        ? '(autonomous cycle — no external input)'
        : '(no input)';
    }
    
    if (typeof msg === 'string') {
      return `Message: ${msg}`;
    }
    
    if (typeof msg === 'object') {
      const parts = [];
      if (msg.content) parts.push(`Content: ${msg.content}`);
      if (msg.source) parts.push(`Source: ${msg.source}`);
      if (msg.type) parts.push(`Type: ${msg.type}`);
      if (msg.timestamp) parts.push(`Time: ${new Date(msg.timestamp).toISOString()}`);
      return parts.join('\n') || '(empty input)';
    }
    
    return String(msg);
  }

  _getBudget(key) {
    return this.budgets[key] ?? 0;
  }

  // ── Utilities ───────────────────────────────────────────────────

  _truncate(content, maxChars) {
    if (!content) return '';
    const str = String(content);
    if (str.length <= maxChars) return str;
    return str.slice(0, maxChars - 100) + '\n... [truncated]';
  }
}
