/**
 * AuditSpace.js — Append-only audit log for SeNARS agent
 */

import {mkdir, readFile, writeFile} from 'fs/promises';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';
import {fallbackMemoryDir, generateId, Logger, resolveWithFallback, truncate} from '@senars/core';
import {escapeQuotes, MettaParser, toMettaAtom} from './MettaParser.js';

const __dataDir = resolveWithFallback(() => dirname(fileURLToPath(import.meta.url)), fallbackMemoryDir);

export class AuditSpace {
    constructor(config = {}) {
        this._config = config;
        this._dataDir = config.dataDir ?? join(__dataDir, '../../memory/audit');
        this._events = [];
        this._cycleCount = 0;
        this._restored = false;
    }

    get stats() {
        const byType = {};
        for (const event of this._events) {
            byType[event.type] = (byType[event.type] || 0) + 1;
        }
        return {totalEvents: this._events.length, cycleCount: this._cycleCount, byType};
    }

    async initialize() {
        if (this._restored) {
            return;
        }
        await mkdir(this._dataDir, {recursive: true});

        const eventsPath = join(this._dataDir, 'events.metta');
        try {
            const content = await readFile(eventsPath, 'utf8');
            this._parseEvents(content);
            Logger.info(`[AuditSpace] Restored ${this._events.length} events`);
        } catch {
            Logger.debug('[AuditSpace] No existing events, starting fresh');
        }
        this._restored = true;
    }

    _parseEvents(content) {
        const parser = new MettaParser();
        parser.registerHandler('audit-event', (event) => event);
        this._events.push(...parser.parse(content));
    }

    async emit(type, data = {}) {
        await this.initialize();
        const id = generateId('aud');
        const event = {id, timestamp: Date.now(), type, cycle: this._cycleCount, ...data};
        this._events.push(event);
        await this._persist();
        Logger.debug(`[AuditSpace] emit: ${type} (${id})`);
        return id;
    }

    async emitSkillInvoked(skillName, args, result) {
        return this.emit('skill-invoked', {
            skill: skillName,
            args: this._serializeArgs(args),
            result: this._truncate(String(result ?? ''), 500)
        });
    }

    async emitSkillBlocked(skillName, args, reason) {
        return this.emit('skill-blocked', {
            skill: skillName,
            args: this._serializeArgs(args),
            reason: this._truncate(reason, 500)
        });
    }

    async emitLlmCall(model, promptChars, responseChars, latencyMs, tokenUsage = {}) {
        return this.emit('llm-call', {
            model, promptChars, responseChars, latencyMs,
            tokensIn: tokenUsage.promptTokens,
            tokensOut: tokenUsage.completionTokens,
            tokensTotal: tokenUsage.totalTokens
        });
    }

    async emitMemoryWrite(memoryId, content, type) {
        return this.emit('memory-write', {memoryId, content: this._truncate(content, 200), type});
    }

    async emitCycleAudit(input, output, results) {
        return this.emit('cycle-audit', {
            input: this._truncate(input ?? '', 1000),
            output: this._truncate(output ?? '', 2000),
            results: this._truncate(JSON.stringify(results ?? []), 2000)
        });
    }

    async emitHarnessModified(cycle, score) {
        return this.emit('harness-modified', {cycle, score});
    }

    incrementCycle() {
        this._cycleCount++;
    }

    getRecent(limit = 50, type = null) {
        let events = this._events;
        if (type) {
            events = events.filter(e => e.type === type);
        }
        return events.slice(-limit);
    }

    getAll() {
        return [...this._events];
    }

    async _persist() {
        await mkdir(this._dataDir, {recursive: true});
        const content = this._events.map(e => this._eventToMetta(e)).join('\n');
        await writeFile(join(this._dataDir, 'events.metta'), content);
    }

    _eventToMetta(event) {
        const fields = {
            id: event.id,
            timestamp: event.timestamp,
            type: (event.type || '').replace(':', ''),
            cycle: event.cycle
        };
        if (event.skill) {
            fields.skill = event.skill;
        }
        if (event.reason) {
            fields.reason = escapeQuotes(event.reason);
        }
        if (event.model) {
            fields.model = event.model;
        }
        if (event.args) {
            fields.args = event.args;
        }
        if (event.result) {
            fields.result = escapeQuotes(event.result);
        }
        if (event.latencyMs !== undefined) {
            fields.latencyMs = event.latencyMs;
        }
        if (event.promptChars !== undefined) {
            fields.promptChars = event.promptChars;
        }
        if (event.responseChars !== undefined) {
            fields.responseChars = event.responseChars;
        }
        if (event.tokensIn !== undefined) {
            fields.tokensIn = event.tokensIn;
        }
        if (event.tokensOut !== undefined) {
            fields.tokensOut = event.tokensOut;
        }
        if (event.tokensTotal !== undefined) {
            fields.tokensTotal = event.tokensTotal;
        }
        if (event.memoryId) {
            fields.memoryId = event.memoryId;
        }
        if (event.content) {
            fields.content = escapeQuotes(event.content);
        }
        if (event.input) {
            fields.input = escapeQuotes(event.input);
        }
        if (event.output) {
            fields.output = escapeQuotes(event.output);
        }
        return toMettaAtom('audit-event', fields);
    }

    _serializeArgs(args) {
        if (!Array.isArray(args)) {
            return '()';
        }
        return `(${args.map(a => {
            const s = String(a);
            return s.includes(' ') ? `"${s}"` : s;
        }).join(' ')})`;
    }

    _truncate(str, max) {
        return truncate(str, max);
    }
}
