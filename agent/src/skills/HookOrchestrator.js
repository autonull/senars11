/**
 * HookOrchestrator.js — Pre/post-skill hook execution engine
 */

import {createSingleton, Logger} from '@senars/core';
import {Parser} from '@senars/metta/Parser.js';
import {isExpression} from '@senars/metta/kernel/Term.js';
import {existsSync, readFileSync} from 'fs';
import {join} from 'path';

export class HookOrchestrator {
    constructor(config, auditSpace) {
        this.config = config;
        this.auditSpace = auditSpace;
        this.hooks = {pre: [], post: []};
        this.parser = new Parser();
        this.loaded = false;
        Logger.info('[HookOrchestrator] Initialized');
    }

    async loadHooksFromFile(path) {
        try {
            if (!existsSync(path)) {
                Logger.warn('[HookOrchestrator] No hooks.metta found at', path);
                return;
            }
            let content = readFileSync(path, 'utf-8');
            // Wrap multiple top-level expressions in (do ...) for the parser
            if (!content.trim().startsWith('(do')) {
                content = `(do ${content})`;
            }
            const atoms = this.parser.parse(content);
            for (const hook of this._extractHooks(atoms)) {
                this.hooks[hook.phase].push({
                    pattern: hook.pattern,
                    body: hook.body,
                    order: this.hooks[hook.phase].length
                });
            }
            this.loaded = true;
            Logger.info('[HookOrchestrator] Loaded hooks', {pre: this.hooks.pre.length, post: this.hooks.post.length});
        } catch (error) {
            Logger.error('[HookOrchestrator] Failed to load hooks:', error);
            throw error;
        }
    }

    async runPreHooks(skillCall) {
        if (!this.config.capabilities?.executionHooks || !this.loaded) {
            return {action: 'allow'};
        }
        const {name, args} = skillCall;

        for (const hook of this.hooks.pre) {
            const match = this._matchPattern(hook.pattern, name, args);
            if (match) {
                try {
                    const result = await this._evaluateHook(hook.body, match);
                    if (result.action === 'deny') {
                        Logger.info('[HookOrchestrator] Pre-hook denied', {skill: name, reason: result.reason});
                        if (this.auditSpace) {
                            await this.auditSpace.emitSkillBlocked(name, args, `hook-deny: ${result.reason}`);
                        }
                        return result;
                    }
                    if (result.action === 'rewrite') {
                        Logger.debug('[HookOrchestrator] Pre-hook rewrote args', {skill: name});
                        return result;
                    }
                } catch (error) {
                    Logger.error('[HookOrchestrator] Pre-hook error:', error);
                }
            }
        }
        return {action: 'allow'};
    }

    async runPostHooks(skillCall, result) {
        if (!this.config.capabilities?.executionHooks || !this.loaded) {
            return;
        }
        const {name, args} = skillCall;

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

    registerHook(phase, pattern, body) {
        if (!['pre', 'post'].includes(phase)) {
            throw new Error(`Invalid hook phase: ${phase}`);
        }
        this.hooks[phase].push({pattern, body, order: this.hooks[phase].length});
        this.loaded = true;
        Logger.debug('[HookOrchestrator] Registered hook', {phase, pattern});
    }

    clearHooks() {
        this.hooks = {pre: [], post: []};
        this.loaded = false;
    }

    _extractHooks(atom) {
        const hooks = [];
        const process = (a) => {
            if (isExpression(a) && a.operator?.name === 'hook') {
                const components = a.components || [];
                if (components.length >= 3) {
                    const phase = components[0]?.name ?? components[0]?.value ?? components[0]?._name;
                    if (phase === 'pre' || phase === 'post') {
                        hooks.push({phase, pattern: components[1], body: components[2]});
                    }
                }
            }
            for (const comp of a.components || []) {
                process(comp);
            }
        };
        process(atom);
        return hooks;
    }

    _matchPattern(pattern, skillName, skillArgs) {
        if (!pattern || (!isExpression(pattern) && !pattern.operator)) {
            return null;
        }
        const patternName = pattern.operator?.name;
        if (patternName !== skillName) {
            return null;
        }

        const patternArgs = pattern.components || [];
        const bindings = {name: skillName, args: skillArgs};
        for (let i = 0; i < patternArgs.length; i++) {
            const patArg = patternArgs[i];
            const actualArg = skillArgs[i];
            if (patArg?.name?.startsWith('$')) {
                bindings[patArg.name.slice(1)] = actualArg;
            } else if (patArg?.name !== actualArg && patArg?.value !== actualArg) {
                return null;
            }
        }
        return bindings;
    }

    async _evaluateHook(body, bindings, result = null) {
        if (!body || (!isExpression(body) && !body.operator)) {
            return {action: 'allow'};
        }
        const op = body.operator?.name;
        const components = body.components || [];

        switch (op) {
            case 'allow':
                return {action: 'allow'};
            case 'deny':
                return {action: 'deny', reason: String(this._resolveArg(components[0], bindings))};
            case 'rewrite': {
                const newExpr = components[0];
                if (newExpr && (isExpression(newExpr) || newExpr.operator)) {
                    return {
                        action: 'rewrite',
                        newArgs: (newExpr.components || []).map(c => this._resolveArg(c, bindings))
                    };
                }
                return {action: 'allow'};
            }
            case 'audit-emit': {
                const event = this._resolveArg(components[0], bindings);
                if (this.auditSpace) {
                    await this.auditSpace.emitEvent(event);
                }
                return {action: 'allow'};
            }
            case 'if': {
                const conditionResult = await this._evaluateCondition(components[0], bindings);
                return this._evaluateHook(conditionResult ? components[1] : components[2], bindings, result);
            }
            default:
                return {action: 'allow'};
        }
    }

    async _evaluateCondition(expr, bindings) {
        if (!isExpression(expr)) {
            return Boolean(this._resolveArg(expr, bindings));
        }
        const op = expr.operator?.name;
        const components = expr.components || [];

        if (op === 'contains-forbidden?') {
            const str = this._resolveArg(components[0], bindings);
            return (this.config.shell?.forbiddenPatterns || []).some(p => String(str).includes(p));
        }
        if (op === 'path-within?') {
            const path = this._resolveArg(components[0], bindings);
            const base = this._resolveArg(components[1], bindings);
            return join(process.cwd(), String(path)).startsWith(join(process.cwd(), String(base)));
        }
        if (op === 'capability-enabled?') {
            return Boolean(this.config.capabilities?.[String(this._resolveArg(components[0], bindings))]);
        }
        return false;
    }

    _resolveArg(atom, bindings) {
        if (!atom) {
            return null;
        }
        if (atom.name?.startsWith('$')) {
            return bindings[atom.name.slice(1)];
        }
        if (atom.value !== undefined) {
            return atom.value;
        }
        if (atom.name) {
            return atom.name.replace(/^"|"$/g, '');
        }
        return String(atom);
    }
}

export const getHookOrchestrator = createSingleton((config, auditSpace) => new HookOrchestrator(config, auditSpace));
export const resetHookOrchestrator = () => getHookOrchestrator.reset();
