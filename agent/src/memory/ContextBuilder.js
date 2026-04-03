/**
 * ContextBuilder.js — JS wrapper for MeTTa context builder
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
    this.lastFeedback = null;
    this.lastError = null;

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
    Logger.info('[ContextBuilder] Initialized', { budgets: this.budgets });
  }

  registerGroundedOps(interp) {
    // Register grounded operations using interpreter.ground.register()
    const registerOp = (name, fn) => interp.ground.register(name, fn, { lazy: true });
    
    registerOp('context-init', () => this._init());
    registerOp('context-concat', (...sections) => this._concat(sections));
    registerOp('load-harness-prompt', () => this._loadHarnessPrompt());
    registerOp('default-system-prompt', () => this._defaultSystemPrompt());
    registerOp('filter-capabilities', (mode) => this._filterCapabilities(mode));
    registerOp('get-active-skills', () => this._getActiveSkills());
    registerOp('get-pinned-memories', () => this._getPinnedMemories());
    registerOp('get-wm-entries', () => this._getWmEntries());
    registerOp('generate-manifest', () => this._generateManifest());
    registerOp('query-memories', (msg, k) => this._queryMemories(msg, k));
    registerOp('get-history', () => this._getHistory());
    registerOp('get-feedback', () => this._getFeedback());
    registerOp('format-input', (msg) => this._formatInput(msg));
    registerOp('get-budget', (key) => this._getBudget(key));
    Logger.info('[ContextBuilder] Registered grounded ops');
  }

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
      return this._concat(sections);
    } catch (error) {
      Logger.error('[ContextBuilder] Failed to build context:', error);
      return this._defaultSystemPrompt();
    }
  }

  recordFeedback(feedback, error = null) {
    this.lastFeedback = feedback;
    this.lastError = error;
  }

  _init() { return 'ok'; }

  _concat(sections) {
    const headers = ['SYSTEM_PROMPT', 'CAPABILITIES', 'SKILLS', 'PINNED', 'WM_REGISTER', 'AGENT_MANIFEST', 'RECALL', 'HISTORY', 'FEEDBACK', 'INPUT'];
    return sections
      .filter(s => s && s.trim() !== '')
      .map((s, i) => i < headers.length && s.trim() !== '' ? `═══ ${headers[i]} ═══\n${s}\n\n` : s)
      .join('');
  }

  _loadHarnessPrompt() {
    try {
      if (isEnabled(this.config, 'harnessOptimization') && existsSync(this.harnessPath)) {
        return this._truncate(readFileSync(this.harnessPath, 'utf-8'), this.budgets.pinnedMaxChars);
      }
    } catch {
      Logger.warn('[ContextBuilder] Failed to load harness prompt');
    }
    return this._defaultSystemPrompt();
  }

  _defaultSystemPrompt() {
    return `You are SeNARchy, a helpful AI assistant.\nRespond concisely. Use S-expression skill calls when taking actions.\nExample: ((send "Hello") (remember "User prefers concise responses"))`;
  }

  _filterCapabilities(mode) {
    const caps = this.config.capabilities || {};
    const active = Object.entries(caps).filter(([_, enabled]) => enabled).map(([name]) => name).join(', ');
    return active || '(no capabilities enabled)';
  }

  _getActiveSkills() {
    if (!isEnabled(this.config, 'sExprSkillDispatch')) return '(skill dispatch disabled — using JSON tool calls)';
    return this.skillDispatcher?.getActiveSkillDefs() ?? '(no skills registered)';
  }

  async _getPinnedMemories() {
    if (!isEnabled(this.config, 'semanticMemory') || !this.semanticMemory) return '';
    try {
      const pinned = await this.semanticMemory.queryByType(':pinned');
      return this._truncate(pinned.map(m => m.content ?? String(m)).join('\n'), this.budgets.pinnedMaxChars);
    } catch {
      Logger.warn('[ContextBuilder] Failed to get pinned memories');
      return '';
    }
  }

  _getWmEntries() {
    const wmEntries = this.config._wmEntries || [];
    if (!wmEntries.length) return '';
    return this._truncate(
      wmEntries.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
        .map(e => `[${e.priority?.toFixed(1) ?? '0.5'}] ${e.content} (TTL: ${e.ttl ?? 0})`)
        .join('\n'),
      this.budgets.wmRegisterChars
    );
  }

  _generateManifest() {
    if (!isEnabled(this.config, 'runtimeIntrospection') || !this.introspectionOps) return '';
    try {
      const manifest = this.introspectionOps.generateManifest();
      return this._truncate(typeof manifest === 'string' ? manifest : JSON.stringify(manifest, null, 2), this.budgets.agentManifestChars);
    } catch {
      Logger.warn('[ContextBuilder] Failed to generate manifest');
      return '';
    }
  }

  async _queryMemories(msg, k) {
    if (!isEnabled(this.config, 'semanticMemory') || !this.semanticMemory) return '';
    try {
      const memories = await this.semanticMemory.query(msg?.content || msg || 'recent context', k);
      return this._truncate(memories.map(m => m.content ?? String(m)).join('\n'), this.budgets.recallChars);
    } catch {
      Logger.warn('[ContextBuilder] Failed to query memories');
      return '';
    }
  }

  async _getHistory() {
    if (!isEnabled(this.config, 'persistentHistory') || !this.historySpace) return '';
    try {
      const history = await this.historySpace.getRecent(this.budgets.recallItems);
      const content = history.map(h => {
        const timestamp = h.timestamp ? new Date(h.timestamp).toISOString() : '?';
        return `[${timestamp}] ${h.content ?? h.message ?? String(h)}`;
      }).join('\n');
      return this._truncate(content, this.budgets.historyChars);
    } catch {
      Logger.warn('[ContextBuilder] Failed to get history');
      return '';
    }
  }

  _getFeedback() {
    const parts = [];
    if (this.lastFeedback) parts.push(`Feedback: ${this.lastFeedback}`);
    if (this.lastError) parts.push(`Error: ${this.lastError}`);
    this.lastFeedback = null;
    this.lastError = null;
    return this._truncate(parts.join('\n'), this.budgets.feedbackChars);
  }

  _formatInput(msg) {
    if (!msg) return isEnabled(this.config, 'autonomousLoop') ? '(autonomous cycle — no external input)' : '(no input)';
    if (typeof msg === 'string') return `Message: ${msg}`;
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

  _truncate(content, maxChars) {
    if (!content) return '';
    const str = String(content);
    return str.length <= maxChars ? str : str.slice(0, maxChars - 100) + '\n... [truncated]';
  }
}
