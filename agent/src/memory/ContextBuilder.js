/**
 * ContextBuilder.js — JS implementation of MeTTa context builder
 */
import {existsSync, readFileSync} from 'fs';
import {join} from 'path';
import {Logger, truncate} from '@senars/core';
import {isEnabled} from '../config/index.js';

const safeGet = async (fn, fallback = '', warnMsg) => {
    try {
        return await fn() ?? fallback;
    } catch (err) {
        Logger.warn(`[ContextBuilder] ${warnMsg}`, err.message);
        return fallback;
    }
};

export class ContextBuilder {
    constructor(config, semanticMemory, historySpace, actionDispatcher, introspectionOps, nar = null) {
        this.config = config;
        this.semanticMemory = semanticMemory;
        this.historySpace = historySpace;
        this.actionDispatcher = actionDispatcher;
        this.introspectionOps = introspectionOps;
        this.nar = nar;
        this.lastFeedback = null;
        this.lastError = null;

        this.budgets = {
            pinnedMaxChars: config.memory?.pinnedMaxChars ?? 3000,
            wmRegisterChars: config.workingMemory?.maxEntries ? config.workingMemory.maxEntries * 75 : 1500,
            agentManifestChars: 2000,
            startupOrientChars: 2000,
            tasksChars: 1500,
            recallChars: config.memory?.maxRecallChars ?? 8000,
            recallItems: config.memory?.maxRecallItems ?? 20,
            historyChars: config.memory?.maxHistoryChars ?? 12000,
            feedbackChars: config.memory?.maxFeedbackChars ?? 6000
        };

        this.harnessPath = join(process.cwd(), 'memory', 'harness', 'prompt.metta');
        Logger.info('[ContextBuilder] Initialized', {budgets: this.budgets});
    }

    registerGroundedOps(interp) {
        const reg = (name, fn) => interp.ground.register(name, fn, {lazy: true});
        reg('context-init', () => 'ok');
        reg('context-concat', sections => this._concat(sections));
        reg('load-harness-prompt', () => this._loadHarnessPrompt());
        reg('default-system-prompt', () => this._defaultSystemPrompt());
        reg('filter-capabilities', mode => this._filterCapabilities(mode));
        reg('get-active-skills', () => this._getActiveSkills());
        reg('get-pinned-memories', () => this._getPinnedMemories());
        reg('get-wm-entries', () => this._getWmEntries());
        reg('generate-manifest', () => this._generateManifest());
        reg('query-memories', (msg, k) => this._queryMemories(msg, k));
        reg('get-history', () => this._getHistory());
        reg('get-feedback', () => this._getFeedback());
        reg('format-input', msg => this._formatInput(msg));
        reg('get-budget', key => this._getBudget(key));
        Logger.info('[ContextBuilder] Registered grounded ops');
    }

    async build(msg, cycleCount = 0, wmEntries = []) {
        this._currentWmEntries = wmEntries;
        this._currentCycleCount = cycleCount;
        try {
            const sections = await Promise.all([
                this._loadHarnessPrompt(),
                this._filterCapabilities('active'),
                this._getActiveSkills(),
                this._getStartupOrient(cycleCount),
                this._getTasks(),
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

    _concat(sections) {
        const headers = ['SYSTEM_PROMPT', 'CAPABILITIES', 'ACTIONS', 'STARTUP_ORIENT', 'TASKS', 'PINNED', 'WM_REGISTER', 'AGENT_MANIFEST', 'RECALL', 'HISTORY', 'FEEDBACK', 'INPUT'];
        return sections
            .map((s, i) => s?.trim() && i < headers.length ? `═══ ${headers[i]} ═══\n${s}\n\n` : '')
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
        return `You are SeNARchy, a helpful AI assistant.
Respond in plain text. Be concise.

If you need to take actions (send a message, remember something, search, etc.), output a JSON tool call at the start of your response:
{"actions":[{"name":"action_name","args":["arg1","arg2"]}]}

Available actions: respond, think, send, remember, search, read-file, write-file, attend, dismiss

Examples:
{"actions":[{"name":"respond","args":["Hello! How can I help?"]}]}
{"actions":[{"name":"think","args":["User seems confused"]},{"name":"respond","args":["Let me explain..."]}]}
{"actions":[{"name":"remember","args":["User prefers technical answers"]}]}

If you just want to respond, plain text is fine — no JSON needed.`;
    }

    _filterCapabilities() {
        const active = Object.entries(this.config.capabilities || {}).filter(([, v]) => v).map(([k]) => k).join(', ');
        return active || '(no capabilities enabled)';
    }

    _getActiveSkills() {
        if (!isEnabled(this.config, 'actionDispatch')) {
            return '(action dispatch disabled — using plain text responses)';
        }
        const defs = this.actionDispatcher?.getActiveActionDefs();
        if (!defs || defs.startsWith('(no actions')) return defs;
        return defs;
    }

    async _getStartupOrient(cycleCount) {
        if (cycleCount !== 0 || !this.nar) {
            return '';
        }
        return safeGet(async () => {
            if (!this.nar.taskManager) return '';
            const goals = this.nar.taskManager.findTasksByType('GOAL');
            const parts = [];
            const active = goals.filter(g => g.budget?.priority >= 0.5);
            if (active.length) {
                parts.push(`Active goals: ${active.map(g => g.term.toString()).join('; ')}`);
            }
            const needsAttention = this.nar.taskManager.getTasksNeedingAttention?.({minPriority: 0.3, limit: 5});
            if (needsAttention?.length) {
                parts.push(`Needs attention: ${needsAttention.map(t => t.term.toString()).join('; ')}`);
            }
            return this._truncate(parts.join('\n'), this.budgets.startupOrientChars);
        }, '', 'Failed to get startup orient');
    }

    _getTasks() {
        if (!this.nar) {
            return '';
        }
        return safeGet(async () => {
            if (!this.nar.taskManager) return '';
            const goals = this.nar.taskManager.findTasksByType('GOAL');
            if (!goals.length) {
                return '';
            }
            return this._truncate(
                goals.map(g => `[${g.budget?.priority >= 0.5 ? 'active' : 'pending'}] ${g.term.toString()}`).join('\n'),
                this.budgets.tasksChars
            );
        }, '', 'Failed to get tasks');
    }

    async _getPinnedMemories() {
        if (!isEnabled(this.config, 'semanticMemory') || !this.semanticMemory) {
            return '';
        }
        return safeGet(async () => {
            const pinned = await this.semanticMemory.getPinned(this.budgets.pinnedMaxChars);
            return this._truncate(pinned.map(m => m.content ?? String(m)).join('\n'), this.budgets.pinnedMaxChars);
        }, '', 'Failed to get pinned memories');
    }

    _getWmEntries() {
        const wmEntries = this._currentWmEntries ?? [];
        if (!wmEntries.length) {
            return '';
        }
        return this._truncate(
            wmEntries.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
                .map(e => `[${e.priority?.toFixed(1) ?? '0.5'}] ${e.content} (TTL: ${e.ttl ?? 0})`)
                .join('\n'),
            this.budgets.wmRegisterChars
        );
    }

    _generateManifest() {
        if (!isEnabled(this.config, 'runtimeIntrospection') || !this.introspectionOps) {
            return '';
        }
        return safeGet(async () => {
            const manifest = this.introspectionOps.generateManifest();
            return this._truncate(typeof manifest === 'string' ? manifest : JSON.stringify(manifest, null, 2), this.budgets.agentManifestChars);
        }, '', 'Failed to generate manifest');
    }

    async _queryMemories(msg, k) {
        if (!isEnabled(this.config, 'semanticMemory') || !this.semanticMemory) {
            return '';
        }
        return safeGet(async () => {
            const memories = await this.semanticMemory.query(msg?.content || msg || 'recent context', k);
            return this._truncate(memories.map(m => m.content ?? String(m)).join('\n'), this.budgets.recallChars);
        }, '', 'Failed to query memories');
    }

    async _getHistory() {
        if (!isEnabled(this.config, 'persistentHistory') || !this.historySpace) {
            return '';
        }
        return safeGet(async () => {
            const history = await this.historySpace.getRecent(this.budgets.recallItems);
            return this._truncate(history.map(h => {
                const ts = h.timestamp ? new Date(h.timestamp).toISOString() : '?';
                return `[${ts}] ${h.content ?? h.message ?? String(h)}`;
            }).join('\n'), this.budgets.historyChars);
        }, '', 'Failed to get history');
    }

    _getFeedback() {
        const parts = [];
        if (this.lastFeedback) {
            parts.push(`Feedback: ${this.lastFeedback}`);
        }
        if (this.lastError) {
            parts.push(`Error: ${this.lastError}`);
        }
        this.lastFeedback = null;
        this.lastError = null;
        return this._truncate(parts.join('\n'), this.budgets.feedbackChars);
    }

    _formatInput(msg) {
        if (!msg) {
            return isEnabled(this.config, 'autonomousLoop') ? '(autonomous cycle — no external input)' : '(no input)';
        }
        if (typeof msg === 'string') {
            return `Message: ${msg}`;
        }
        if (typeof msg !== 'object') {
            return String(msg);
        }
        const parts = [];
        if (msg.content) {
            parts.push(`Content: ${msg.content}`);
        }
        if (msg.source) {
            parts.push(`Source: ${msg.source}`);
        }
        if (msg.type) {
            parts.push(`Type: ${msg.type}`);
        }
        if (msg.timestamp) {
            parts.push(`Time: ${new Date(msg.timestamp).toISOString()}`);
        }
        return parts.join('\n') || '(empty input)';
    }

    _getBudget(key) {
        return this.budgets[key] ?? 0;
    }

    _truncate(content, maxChars) {
        return truncate(content, maxChars, '\n... [truncated]');
    }
}
