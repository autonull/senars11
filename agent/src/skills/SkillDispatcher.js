/**
 * SkillDispatcher.js — S-expression parse + dispatch + registry
 */
import {existsSync, readFileSync} from 'fs';
import {join} from 'path';
import {Logger} from '@senars/core';
import {Parser} from '@senars/metta/Parser.js';
import {isExpression} from '@senars/metta/kernel/Term.js';
import {isEnabled} from '../config/index.js';
import {getSafetyLayer} from '../safety/index.js';
import {AuditSpace} from '../memory/index.js';
import {getHookOrchestrator} from './HookOrchestrator.js';
import {SkillResult} from './SkillResult.js';

const atomValue = c => c?.name ?? c?.value ?? '';

export class SkillDispatcher {
    constructor(config) {
        this._config = config;
        this._handlers = new Map();
        this._skillDecls = new Map();
        this._parser = new Parser();
        this._safetyLayer = null;
        this._auditSpace = null;
    }

    loadSkillsFromFile(path) {
        if (!existsSync(path)) {
            return;
        }
        try {
            for (const line of readFileSync(path, 'utf-8').split('\n')) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('(skill ')) {
                    continue;
                }
                for (const decl of this._extractSkillDecls(this._parser.parse(trimmed))) {
                    this._skillDecls.set(decl.name, decl);
                }
            }
        } catch (err) {
            Logger.warn('[SkillDispatcher] Failed to load skills from', path, err.message);
        }
    }

    _extractSkillDecls(atom) {
        const decls = [];
        if (!isExpression(atom) || atom.operator?.name !== 'skill') {
            return decls;
        }
        const c = atom.components || [];
        if (c.length >= 5) {
            decls.push({
                name: atomValue(c[0]),
                argTypes: this._atomToJS(c[1]),
                capFlag: atomValue(c[2]),
                tier: atomValue(c[3]),
                description: atomValue(c[4]).replace(/^"|"$/g, ''),
            });
        }
        return decls;
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
                await orchestrator.loadHooksFromFile(join(process.cwd(), 'agent', 'src', 'metta', 'hooks.metta'));
            }
        }
    }

    register(name, handler, capFlag, tier, description = '') {
        const decl = this._skillDecls.get(name);
        if (decl) {
            if (decl.capFlag !== capFlag) {
                Logger.warn(`[SkillDispatcher] Capability mismatch for ${name}: .metta says ${decl.capFlag}, JS says ${capFlag}`);
            }
            if (decl.tier !== tier) {
                Logger.warn(`[SkillDispatcher] Tier mismatch for ${name}: .metta says ${decl.tier}, JS says ${tier}`);
            }
        } else {
            this._skillDecls.set(name, {name, argTypes: 'any', capFlag, tier, description});
        }
        this._handlers.set(name, {handler, capFlag, tier});
    }

    parseResponse(responseStr) {
        if (!isEnabled(this._config, 'sExprSkillDispatch')) {
            return {cmds: [], error: null};
        }
        const str = (responseStr ?? '').trim();
        if (!str) {
            return {cmds: [], error: null};
        }

        // Try JSON tool calls first
        const jsonCmds = this._tryParseJsonActions(str);
        if (jsonCmds) return {cmds: jsonCmds, error: null};

        // Fall back to S-expression parsing
        let atom;
        try {
            atom = this._parser.parse(this._balanceParens(str));
        } catch (err) {
            return {cmds: [], error: `parse-error: ${err.message}`};
        }
        if (!atom) {
            return {cmds: [], error: null};
        }
        return {cmds: this._extractCommands(atom).slice(0, this._config.loop?.maxSkillsPerCycle ?? 3), error: null};
    }

    _tryParseJsonActions(str) {
        // Extract JSON block handling nested braces properly
        const jsonBlock = this._extractJsonBlock(str);
        if (!jsonBlock) return null;
        try {
            const parsed = JSON.parse(jsonBlock);
            if (!parsed.actions || !Array.isArray(parsed.actions)) return null;
            const cmds = parsed.actions
                .filter(a => a.name && Array.isArray(a.args))
                .map(a => ({ name: a.name, args: a.args }))
                .slice(0, this._config.loop?.maxSkillsPerCycle ?? 3);
            return cmds.length > 0 ? cmds : null;
        } catch {
            return null;
        }
    }

    _extractJsonBlock(str) {
        // Find first `{` and match balanced braces
        let depth = 0, start = -1;
        let inString = false, escaped = false;
        for (let i = 0; i < str.length; i++) {
            const ch = str[i];
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === '{') {
                if (depth === 0) start = i;
                depth++;
            } else if (ch === '}') {
                depth--;
                if (depth === 0 && start >= 0) {
                    return str.substring(start, i + 1);
                }
            }
        }
        return null;
    }

    async execute(cmds) {
        if (!Array.isArray(cmds) || cmds.length === 0) {
            return [];
        }
        await this._ensureSafetyAndAudit();
        return Promise.all(cmds.map(cmd => this._dispatch(cmd)));
    }

    getActiveSkillDefs() {
        const lines = [];
        for (const [name, decl] of this._skillDecls) {
            if (isEnabled(this._config, decl.capFlag)) {
                lines.push(`(skill ${name} ${decl.argTypes} ${decl.capFlag} ${decl.tier} "${decl.description}")`);
            }
        }
        return lines.length ? lines.join('\n') : '(no skills available)';
    }

    hasSkill(name) {
        return this._handlers.has(name);
    }

    async _dispatch({name, args}) {
        const entry = this._handlers.get(name);
        if (!entry) {
            return SkillResult.fail(name, `unknown-skill: ${name}`);
        }
        if (!isEnabled(this._config, entry.capFlag)) {
            return SkillResult.fail(name, `capability-disabled: ${entry.capFlag}`);
        }

        let currentArgs = args;
        if (this._config.capabilities?.executionHooks) {
            const orchestrator = getHookOrchestrator(this._config, this._auditSpace);
            const preHookResult = await orchestrator.runPreHooks({name, args: currentArgs});
            if (preHookResult.action === 'deny') {
                return SkillResult.fail(name, `hook-deny: ${preHookResult.reason}`);
            }
            if (preHookResult.action === 'rewrite') {
                currentArgs = preHookResult.newArgs || currentArgs;
            }
        }

        if (this._safetyLayer && this._config?.capabilities?.safetyLayer) {
            const safety = await this._safetyLayer.check(name, currentArgs, entry.tier);
            if (!safety.cleared) {
                if (this._auditSpace) {
                    await this._auditSpace.emitSkillBlocked(name, currentArgs, safety.reason);
                }
                return SkillResult.fail(name, `safety-blocked: ${safety.reason}`);
            }
        }

        let result, error = null;
        try {
            result = await entry.handler(...currentArgs);
        } catch (err) {
            Logger.error(`[SkillDispatcher] ${name} failed:`, err);
            error = err.message;
        }

        if (this._config.capabilities?.executionHooks) {
            await getHookOrchestrator(this._config, this._auditSpace).runPostHooks({
                name,
                args: currentArgs
            }, result ?? error);
        }
        if (this._auditSpace && this._config?.capabilities?.auditLog) {
            await this._auditSpace.emitSkillInvoked(name, currentArgs, result ?? error);
        }

        return error ? SkillResult.fail(name, error) : SkillResult.ok(name, result);
    }

    _extractCommands(atom) {
        const commands = [];
        if (!isExpression(atom)) {
            const cmd = this._parseCommand(atom);
            if (cmd) {
                commands.push(cmd);
            }
            return commands;
        }
        if (isExpression(atom.operator)) {
            const cmd = this._parseCommand(atom.operator);
            if (cmd) {
                commands.push(cmd);
            }
        } else if (atom.operator?.name && atom.operator.name !== '()') {
            const cmd = this._parseCommand(atom);
            if (cmd) {
                return [cmd];
            }
        }
        for (const comp of atom.components ?? []) {
            if (isExpression(comp)) {
                const cmd = this._parseCommand(comp);
                if (cmd) {
                    commands.push(cmd);
                }
            }
        }
        return commands;
    }

    _parseCommand(atom) {
        if (!isExpression(atom)) {
            return null;
        }
        const name = atom.operator?.name;
        if (!name || name === '()') {
            return null;
        }
        return {name, args: (atom.components ?? []).map(c => this._atomToJS(c))};
    }

    _atomToJS(atom) {
        if (atom === null || atom === undefined) {
            return '';
        }
        if (atom.value !== undefined) {
            return atom.value;
        }
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
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (ch === '"') {
                inString = !inString;
                continue;
            }
            if (inString) {
                continue;
            }
            if (ch === '(') {
                depth++;
            } else if (ch === ')') {
                depth = Math.max(0, depth - 1);
            }
        }
        return str + ')'.repeat(depth);
    }
}
