/**
 * NarsExtension.js — Neuro-Symbolic Bridge
 * Exposes NARS cognition through MeTTa grounded operations.
 */
import { Term } from '../kernel/Term.js';
import { Logger } from '@senars/core';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve } from 'path';

export class NarsExtension {
    constructor(interp, agent) {
        this.interp = interp;
        this.agent = agent;
        this.ground = interp.ground;
        this.nar = agent._nar || null;
    }

    register() {
        if (!this.nar) {
            Logger.warn('[NarsExtension] NAR instance not available, registering stubs');
            this._registerStubs();
            return;
        }
        this._registerGoalOps();
        this._registerBeliefOps();
        this._registerStateOps();
        this._registerFocusOps();
        this._registerDerivationOps();
        this._registerRevisionOps();
        this._registerStatsOps();
        Logger.info('[NarsExtension] Registered', this._opCount(), 'grounded ops');
    }

    _opCount() {
        return this.ground._ops?.size ?? 'unknown';
    }

    _registerStubs() {
        const stub = (name) => () => Term.grounded(`(${name} :nar-not-available)`);
        ['nar-goals', 'nar-beliefs', 'nar-goal-add', 'nar-goal-complete', 'nar-goal-status',
         'nar-serialize', 'nar-deserialize', 'nar-snapshot', 'nar-snapshot-compare',
         'nar-stamps', 'nar-recent-derivations', 'nar-focus-sets', 'nar-focus-create',
         'nar-focus-switch', 'nar-revision', 'nar-stats', 'nar-latest-session'].forEach(n => {
            this.ground.add(n, stub(n));
        });
    }

    _registerGoalOps() {
        this.ground.add('nar-goals', (statusAtom) => {
            const status = statusAtom?.name ?? 'all';
            const goals = this.nar.taskManager.findTasksByType('GOAL');
            const filtered = status === 'active'
                ? goals.filter(g => g.budget?.priority >= 0.5)
                : status === 'pending'
                    ? goals.filter(g => g.budget?.priority < 0.5)
                    : goals;
            return Term.grounded(filtered.map(g => this._goalStr(g)).join('\n'));
        });

        this.ground.add('nar-goal-add', (descAtom, priAtom) => {
            const desc = descAtom?.value ?? descAtom?.name ?? String(descAtom ?? '');
            const pri = parseFloat(priAtom?.value ?? priAtom?.name ?? '0.5') || 0.5;
            try {
                this.nar.input(`${desc}!`);
                return Term.grounded(`(goal-added "${desc}")`);
            } catch (err) {
                return Term.grounded(`(goal-add-error "${err.message}")`);
            }
        });

        this.ground.add('nar-goal-complete', (termAtom) => {
            const term = termAtom?.value ?? termAtom?.name ?? String(termAtom ?? '');
            const goals = this.nar.taskManager.findTasksByType('GOAL');
            const match = goals.find(g => g.term?.toString?.().includes(term));
            if (match) {
                this.nar.taskManager.removeTask(match);
                return Term.grounded(`(goal-removed "${term}")`);
            }
            return Term.grounded(`(goal-not-found "${term}")`);
        });

        this.ground.add('nar-goal-status', (termAtom) => {
            const term = termAtom?.value ?? termAtom?.name ?? String(termAtom ?? '');
            const goals = this.nar.taskManager.findTasksByType('GOAL');
            const match = goals.find(g => g.term?.toString?.().includes(term));
            if (!match) return Term.grounded(`(goal-status :not-found "${term}")`);
            return Term.grounded(`(goal-status :${match.budget?.priority >= 0.5 ? 'active' : 'pending'} "${term}" :priority ${match.budget?.priority?.toFixed(2) ?? '?'} )`);
        });
    }

    _registerBeliefOps() {
        this.ground.add('nar-beliefs', (queryAtom) => {
            const query = queryAtom?.value ?? queryAtom?.name ?? null;
            const beliefs = query ? this.nar.getBeliefs(query) : this.nar.getBeliefs();
            const items = beliefs.slice(0, 20).map(b => {
                const term = b.term?.toString?.() ?? String(b);
                const tv = b.truth ? `f:${b.truth.frequency.toFixed(2)} c:${b.truth.confidence.toFixed(2)}` : '';
                return `[${tv}] ${term}`;
            });
            return Term.grounded(items.join('\n'));
        });
    }

    _registerStateOps() {
        this.ground.add('nar-serialize', () => {
            try {
                const state = this.nar.serialize();
                const sessionsDir = resolve(process.cwd(), 'memory/sessions');
                if (!existsSync(sessionsDir)) mkdirSync(sessionsDir, { recursive: true });
                const path = resolve(sessionsDir, `session_${Date.now()}.json`);
                writeFileSync(path, JSON.stringify(state, null, 2));
                return Term.grounded(`(serialized "${path}")`);
            } catch (err) {
                return Term.grounded(`(serialize-error "${err.message}")`);
            }
        });

        this.ground.add('nar-deserialize', (pathAtom) => {
            try {
                const path = pathAtom?.value ?? pathAtom?.name;
                if (!path || !existsSync(path)) return Term.grounded('(deserialize-error "file-not-found")');
                const state = JSON.parse(readFileSync(path, 'utf8'));
                this.nar.deserialize(state);
                return Term.grounded('(deserialized ok)');
            } catch (err) {
                return Term.grounded(`(deserialize-error "${err.message}")`);
            }
        });

        this.ground.add('nar-latest-session', () => {
            const sessionsDir = resolve(process.cwd(), 'memory/sessions');
            if (!existsSync(sessionsDir)) return Term.sym('()');
            const files = readdirSync(sessionsDir).filter(f => f.endsWith('.json')).sort();
            return files.length > 0 ? Term.grounded(files[files.length - 1]) : Term.sym('()');
        });

        this.ground.add('nar-snapshot', (labelAtom) => {
            const label = labelAtom?.name ?? `snap_${Date.now()}`;
            try {
                const beliefs = this.nar.getBeliefs();
                const goals = this.nar.getGoals();
                const data = {
                    label, timestamp: Date.now(),
                    beliefs: beliefs.map(b => ({ term: b.term?.toString?.(), truth: b.truth })),
                    goals: goals.map(g => ({ term: g.term?.toString?.(), priority: g.budget?.priority }))
                };
                const snapsDir = resolve(process.cwd(), 'memory/snapshots');
                if (!existsSync(snapsDir)) mkdirSync(snapsDir, { recursive: true });
                const path = resolve(snapsDir, `${label}.json`);
                writeFileSync(path, JSON.stringify(data, null, 2));
                return Term.grounded(`(snapshot "${label}" "${path}")`);
            } catch (err) {
                return Term.grounded(`(snapshot-error "${err.message}")`);
            }
        });

        this.ground.add('nar-snapshot-compare', (labelA, labelB, thresholdAtom) => {
            const threshold = parseFloat(thresholdAtom?.value ?? thresholdAtom?.name ?? '0.1') || 0.1;
            const snapsDir = resolve(process.cwd(), 'memory/snapshots');
            try {
                const a = JSON.parse(readFileSync(resolve(snapsDir, `${labelA}.json`), 'utf8'));
                const b = JSON.parse(readFileSync(resolve(snapsDir, `${labelB}.json`), 'utf8'));
                const shifts = [];
                const aMap = new Map(a.beliefs.map(b => [b.term, b.truth]));
                for (const belief of b.beliefs) {
                    const prev = aMap.get(belief.term);
                    if (prev) {
                        const freqShift = Math.abs(belief.truth.frequency - prev.frequency);
                        const confShift = Math.abs(belief.truth.confidence - prev.confidence);
                        if (freqShift > threshold || confShift > threshold) {
                            shifts.push(`${belief.term}: f ${prev.frequency.toFixed(2)}→${belief.truth.frequency.toFixed(2)}, c ${prev.confidence.toFixed(2)}→${belief.truth.confidence.toFixed(2)}`);
                        }
                    }
                }
                return Term.grounded(shifts.length ? shifts.join('\n') : '(no-significant-shifts)');
            } catch (err) {
                return Term.grounded(`(compare-error "${err.message}")`);
            }
        });
    }

    _registerFocusOps() {
        this.ground.add('nar-focus-sets', () => {
            const stats = this.nar.focus.getStats();
            const sets = Object.entries(stats.focusSets || {}).map(([name, s]) => `${name}: ${s.size ?? '?'} tasks`);
            return Term.grounded(`current: ${stats.currentFocus}\n${sets.join('\n')}`);
        });

        this.ground.add('nar-focus-create', (nameAtom) => {
            const name = nameAtom?.value ?? nameAtom?.name ?? String(nameAtom ?? '');
            const ok = this.nar.focus.createFocusSet(name);
            return Term.grounded(ok ? `(focus-created "${name}")` : `(focus-create-failed "${name}")`);
        });

        this.ground.add('nar-focus-switch', (nameAtom) => {
            const name = nameAtom?.value ?? nameAtom?.name ?? String(nameAtom ?? '');
            const ok = this.nar.focus.setFocus(name);
            return Term.grounded(ok ? `(focus-switched "${name}")` : `(focus-switch-failed "${name}")`);
        });
    }

    _registerDerivationOps() {
        this.ground.add('nar-stamps', (termAtom) => {
            const term = termAtom?.value ?? termAtom?.name ?? String(termAtom ?? '');
            const tasks = this.nar.taskManager.findTasksByTerm(term);
            if (!tasks.length) return Term.grounded(`(no-tasks-for "${term}")`);
            const stamps = tasks.map(t => {
                const s = t.stamp;
                return `id:${s.id} depth:${s.depth} source:${s.source} derivations:[${(s.derivations || []).slice(0, 5).join(',')}]`;
            });
            return Term.grounded(stamps.join('\n'));
        });

        this.ground.add('nar-recent-derivations', (countAtom) => {
            const count = parseInt(countAtom?.value ?? countAtom?.name ?? '5') || 5;
            const metrics = this.nar._streamReasoner?.metrics ?? {};
            const recent = metrics.recentDerivations ?? [];
            return Term.grounded(recent.slice(-count).map(d => JSON.stringify(d)).join('\n') || '(no-recent-derivations)');
        });
    }

    _registerRevisionOps() {
        this.ground.add('nar-revision', (termAtom, evidenceAtom) => {
            const term = termAtom?.value ?? termAtom?.name ?? String(termAtom ?? '');
            const evidence = evidenceAtom?.value ?? evidenceAtom?.name ?? String(evidenceAtom ?? '');
            try {
                this.nar.input(evidence);
                return Term.grounded(`(revision-input "${term}")`);
            } catch (err) {
                return Term.grounded(`(revision-error "${err.message}")`);
            }
        });
    }

    _registerStatsOps() {
        this.ground.add('nar-stats', () => {
            const stats = this.nar.getStats();
            const parts = [];
            if (stats.memoryStats) parts.push(`memory: ${stats.memoryStats.totalConcepts ?? '?'} concepts`);
            if (stats.taskManagerStats) parts.push(`tasks: ${stats.taskManagerStats.totalTasksCreated ?? '?'} created`);
            const goals = this.nar.getGoals();
            parts.push(`goals: ${goals.length} (${goals.filter(g => g.budget?.priority >= 0.5).length} active)`);
            const focusStats = this.nar.focus.getStats();
            parts.push(`focus: ${focusStats.currentFocus} (${Object.keys(focusStats.focusSets || {}).length} sets)`);
            return Term.grounded(parts.join('\n'));
        });
    }

    _goalStr(g) {
        const term = g.term?.toString?.() ?? String(g);
        const pri = g.budget?.priority?.toFixed(2) ?? '?';
        return `[${g.budget?.priority >= 0.5 ? 'active' : 'pending'}] ${term} (pri:${pri})`;
    }
}
