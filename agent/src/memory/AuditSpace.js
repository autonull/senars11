/**
 * AuditSpace.js — Append-only audit log for SeNARS agent
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Logger } from '@senars/core';

let __dataDir;
try {
    __dataDir = dirname(fileURLToPath(import.meta.url));
} catch {
    __dataDir = typeof global !== 'undefined' && global.__dirname
        ? global.__dirname
        : process.cwd();
}

export class AuditSpace {
  constructor(config = {}) {
    this._config = config;
    this._dataDir = config.dataDir ?? join(__dataDir, '../../memory/audit');
    this._events = [];
    this._cycleCount = 0;
    this._restored = false;
  }

  async initialize() {
    if (this._restored) return;
    await mkdir(this._dataDir, { recursive: true });

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
    const lines = content.split('\n');
    let currentEvent = null, currentKey = null, inSkill = false, skillLines = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('(audit-event')) {
        currentEvent = {};
        inSkill = false;
        skillLines = [];
        continue;
      }
      if (trimmed === ')') {
        if (currentEvent?.id) {
          if (skillLines.length > 0) currentEvent.skill = skillLines.join(' ').trim();
          this._events.push(currentEvent);
        }
        currentEvent = null;
        continue;
      }
      if (!currentEvent) continue;

      const match = trimmed.match(/^:(\w+)\s*(.*)$/);
      if (match) {
        currentKey = match[1];
        let value = match[2].trim();
        if (['id', 'type', 'reason', 'model'].includes(currentKey)) {
          currentEvent[currentKey] = value.replace(/^"|"$/g, '');
        } else if (['timestamp', 'cycle'].includes(currentKey)) {
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

  async emit(type, data = {}) {
    await this.initialize();
    const id = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const event = { id, timestamp: Date.now(), type, cycle: this._cycleCount, ...data };
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
    return this.emit('memory-write', { memoryId, content: this._truncate(content, 200), type });
  }

  async emitCycleAudit(input, output, results) {
    return this.emit('cycle-audit', {
      input: this._truncate(input ?? '', 1000),
      output: this._truncate(output ?? '', 2000),
      results: this._truncate(JSON.stringify(results ?? []), 2000)
    });
  }

  async emitHarnessModified(cycle, score) {
    return this.emit('harness-modified', { cycle, score });
  }

  incrementCycle() { this._cycleCount++; }

  getRecent(limit = 50, type = null) {
    let events = this._events;
    if (type) events = events.filter(e => e.type === type);
    return events.slice(-limit);
  }

  getAll() { return [...this._events]; }

  get stats() {
    const byType = {};
    for (const event of this._events) byType[event.type] = (byType[event.type] || 0) + 1;
    return { totalEvents: this._events.length, cycleCount: this._cycleCount, byType };
  }

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
    if (event.skill) lines.push(`  :skill     ${event.skill}`);
    if (event.reason) lines.push(`  :reason    "${this._escapeQuotes(event.reason)}"`);
    if (event.model) lines.push(`  :model     "${event.model}"`);
    if (event.args) lines.push(`  :args      ${event.args}`);
    if (event.result) lines.push(`  :result    "${this._escapeQuotes(event.result)}"`);
    if (event.latencyMs !== undefined) lines.push(`  :latencyMs ${event.latencyMs}`);
    if (event.promptChars !== undefined) lines.push(`  :promptChars ${event.promptChars}`);
    if (event.responseChars !== undefined) lines.push(`  :responseChars ${event.responseChars}`);
    if (event.tokensIn !== undefined) lines.push(`  :tokensIn  ${event.tokensIn}`);
    if (event.tokensOut !== undefined) lines.push(`  :tokensOut ${event.tokensOut}`);
    if (event.tokensTotal !== undefined) lines.push(`  :tokensTotal ${event.tokensTotal}`);
    if (event.memoryId) lines.push(`  :memoryId  "${event.memoryId}"`);
    if (event.content) lines.push(`  :content   "${this._escapeQuotes(event.content)}"`);
    if (event.input) lines.push(`  :input     "${this._escapeQuotes(event.input)}"`);
    if (event.output) lines.push(`  :output    "${this._escapeQuotes(event.output)}"`);
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
