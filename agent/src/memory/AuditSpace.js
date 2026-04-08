/**
 * AuditSpace.js — Append-only audit log for SeNARS agent
 *
 * All audit events are written to a PersistentSpace backed by atoms.metta.
 * Events are never modified or deleted — only appended.
 *
 * Event types:
 *   :skill-invoked     — skill executed successfully
 *   :skill-blocked     — skill blocked by safety layer
 *   :llm-call          — LLM invocation with model, tokens, latency
 *   :memory-write      — memory atom created/updated
 *   :harness-modified  — prompt or harness file changed
 *   :cycle-audit       — full cycle summary (input, output, results)
 *
 * The agent can read its own audit log via:
 *   (metta (get-atoms &audit-space))
 */

import { Logger } from '@senars/core';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

/**
 * AuditSpace — append-only event store
 */
export class AuditSpace {
    constructor(config = {}) {
        this._config = config;
        this._dataDir = config.dataDir ?? join(__dir, '../../memory/audit');
        this._events = [];
        this._cycleCount = 0;
        this._restored = false;
    }

    /**
     * Initialize: restore events from disk.
     */
    async initialize() {
        if (this._restored) return;

        await mkdir(this._dataDir, { recursive: true });

        const eventsPath = join(this._dataDir, 'events.metta');
        try {
            const content = await readFile(eventsPath, 'utf8');
            this._parseEvents(content);
            Logger.info(`[AuditSpace] Restored ${this._events.length} events`);
        } catch (err) {
            Logger.debug('[AuditSpace] No existing events, starting fresh');
        }

        this._restored = true;
    }

    _parseEvents(content) {
        // Parse (audit-event :key value ...) format
        const lines = content.split('\n');
        let currentEvent = null;
        let currentKey = null;
        let inSkill = false;
        let skillLines = [];

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith('(audit-event')) {
                currentEvent = {};
                inSkill = false;
                skillLines = [];
                continue;
            }

            if (trimmed === ')') {
                if (currentEvent && currentEvent.id) {
                    if (skillLines.length > 0) {
                        currentEvent.skill = skillLines.join(' ').trim();
                    }
                    this._events.push(currentEvent);
                }
                currentEvent = null;
                continue;
            }

            if (!currentEvent) continue;

            // Parse :key value
            const match = trimmed.match(/^:(\w+)\s*(.*)$/);
            if (match) {
                currentKey = match[1];
                let value = match[2].trim();

                if (currentKey === 'id' || currentKey === 'type' || currentKey === 'reason' || currentKey === 'model') {
                    currentEvent[currentKey] = value.replace(/^"|"$/g, '');
                } else if (currentKey === 'timestamp' || currentKey === 'cycle') {
                    currentEvent[currentKey] = parseInt(value, 10);
                } else if (currentKey === 'skill') {
                    inSkill = true;
                    skillLines.push(value);
                } else {
                    currentEvent[currentKey] = value.replace(/^"|"$/g, '');
                }
            } else if (inSkill) {
                skillLines.push(trimmed);
            }
        }
    }

    /**
     * Emit an audit event.
     * @param {string} type - Event type (:skill-invoked | :skill-blocked | :llm-call | :memory-write | :harness-modified | :cycle-audit)
     * @param {Object} data - Event data
     * @returns {Promise<string>} Event ID
     */
    async emit(type, data = {}) {
        await this.initialize();

        const id = `aud_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const event = {
            id,
            timestamp: Date.now(),
            type,
            cycle: this._cycleCount,
            ...data
        };

        this._events.push(event);
        await this._persist();

        Logger.debug(`[AuditSpace] emit: ${type} (${id})`);
        return id;
    }

    /**
     * Emit a skill invocation event.
     */
    async emitSkillInvoked(skillName, args, result) {
        return this.emit('skill-invoked', {
            skill: skillName,
            args: this._serializeArgs(args),
            result: this._truncate(String(result ?? ''), 500)
        });
    }

    /**
     * Emit a skill blocked event.
     */
    async emitSkillBlocked(skillName, args, reason) {
        return this.emit('skill-blocked', {
            skill: skillName,
            args: this._serializeArgs(args),
            reason: this._truncate(reason, 500)
        });
    }

    /**
     * Emit an LLM call event.
     */
    async emitLlmCall(model, promptChars, responseChars, latencyMs, tokenUsage = {}) {
        return this.emit('llm-call', {
            model,
            promptChars,
            responseChars,
            latencyMs,
            tokensIn: tokenUsage.promptTokens,
            tokensOut: tokenUsage.completionTokens,
            tokensTotal: tokenUsage.totalTokens
        });
    }

    /**
     * Emit a memory write event.
     */
    async emitMemoryWrite(memoryId, content, type) {
        return this.emit('memory-write', {
            memoryId,
            content: this._truncate(content, 200),
            type
        });
    }

    /**
     * Emit a full cycle audit event.
     */
    async emitCycleAudit(input, output, results) {
        return this.emit('cycle-audit', {
            input: this._truncate(input ?? '', 1000),
            output: this._truncate(output ?? '', 2000),
            results: this._truncate(JSON.stringify(results ?? []), 2000)
        });
    }

    /**
     * Increment cycle counter.
     */
    incrementCycle() {
        this._cycleCount++;
    }

    /**
     * Get recent events.
     * @param {number} limit - Max events to return
     * @param {string} [type] - Filter by type
     * @returns {Array}
     */
    getRecent(limit = 50, type = null) {
        let events = this._events;
        if (type) {
            events = events.filter(e => e.type === type);
        }
        return events.slice(-limit);
    }

    /**
     * Get all events (for agent introspection).
     */
    getAll() {
        return [...this._events];
    }

    /**
     * Get event statistics.
     */
    get stats() {
        const byType = {};
        for (const event of this._events) {
            byType[event.type] = (byType[event.type] || 0) + 1;
        }
        return {
            totalEvents: this._events.length,
            cycleCount: this._cycleCount,
            byType
        };
    }

    // ── Private ──────────────────────────────────────────────────────

    async _persist() {
        await mkdir(this._dataDir, { recursive: true });

        const content = this._events.map(e => this._eventToMetta(e)).join('\n');
        await writeFile(join(this._dataDir, 'events.metta'), content);
    }

    _eventToMetta(event) {
        const lines = ['(audit-event'];
        lines.push(`  :id        "${event.id}"`);
        lines.push(`  :timestamp ${event.timestamp}`);
        lines.push(`  :type      :${event.type.replace(':', '')}`);
        lines.push(`  :cycle     ${event.cycle}`);

        if (event.skill) {
            lines.push(`  :skill     ${event.skill}`);
        }
        if (event.reason) {
            lines.push(`  :reason    "${this._escapeQuotes(event.reason)}"`);
        }
        if (event.model) {
            lines.push(`  :model     "${event.model}"`);
        }
        if (event.args) {
            lines.push(`  :args      ${event.args}`);
        }
        if (event.result) {
            lines.push(`  :result    "${this._escapeQuotes(event.result)}"`);
        }
        if (event.latencyMs !== undefined) {
            lines.push(`  :latencyMs ${event.latencyMs}`);
        }
        if (event.promptChars !== undefined) {
            lines.push(`  :promptChars ${event.promptChars}`);
        }
        if (event.responseChars !== undefined) {
            lines.push(`  :responseChars ${event.responseChars}`);
        }
        if (event.tokensIn !== undefined) {
            lines.push(`  :tokensIn  ${event.tokensIn}`);
        }
        if (event.tokensOut !== undefined) {
            lines.push(`  :tokensOut ${event.tokensOut}`);
        }
        if (event.tokensTotal !== undefined) {
            lines.push(`  :tokensTotal ${event.tokensTotal}`);
        }
        if (event.memoryId) {
            lines.push(`  :memoryId  "${event.memoryId}"`);
        }
        if (event.content) {
            lines.push(`  :content   "${this._escapeQuotes(event.content)}"`);
        }
        if (event.input) {
            lines.push(`  :input     "${this._escapeQuotes(event.input)}"`);
        }
        if (event.output) {
            lines.push(`  :output    "${this._escapeQuotes(event.output)}"`);
        }

        lines.push(')');
        return lines.join('\n');
    }

    _serializeArgs(args) {
        if (!Array.isArray(args)) return '()';
        return `(${args.map(a => {
            const s = String(a);
            return s.includes(' ') ? `"${s}"` : s;
        }).join(' ')})`;
    }

    _truncate(str, max) {
        if (str.length <= max) return str;
        return str.slice(0, max - 3) + '...';
    }

    _escapeQuotes(str) {
        return str.replace(/"/g, '\\"');
    }
}
