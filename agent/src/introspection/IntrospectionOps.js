/**
 * IntrospectionOps.js — Runtime self-description primitives
 */

import {Logger} from '@senars/core';

export class IntrospectionOps {
    constructor(config, skillDispatcher, embodimentBus, modelRouter, loopState) {
        this.config = config;
        this.skillDispatcher = skillDispatcher;
        this.embodimentBus = embodimentBus;
        this.modelRouter = modelRouter;
        this.loopState = loopState;
        this.manifestCache = null;
        this.manifestCacheExpiry = 0;
        Logger.info('[IntrospectionOps] Initialized');
    }

    generateManifest() {
        if (!this.config.capabilities?.runtimeIntrospection) {
            return '(manifest :restricted true)';
        }

        const currentCycle = this.loopState?.cycleCount ?? 0;
        if (this.manifestCache && currentCycle < this.manifestCacheExpiry) {
            return this.manifestCache;
        }

        const manifest = {
            version: '0.2.0',
            profile: this.config.profile ?? 'parity',
            capabilities: this._getCapabilityState(),
            activeSkills: this._getActiveSkills(),
            embodiments: this._getEmbodiments(),
            modelScores: this._getModelScores(),
            cycleCount: currentCycle,
            wmEntriesCount: this.loopState?.wm?.length ?? 0,
            budget: this.loopState?.budget ?? 0,
            historyLength: this.loopState?.historyBuffer?.length ?? 0
        };

        this.manifestCache = this._toMeTTaAtom('agent-manifest', manifest);
        this.manifestCacheExpiry = currentCycle + 5;
        return this.manifestCache;
    }

    listSkills() {
        if (!this.config.capabilities?.runtimeIntrospection) {
            return '(skill-inventory :restricted true)';
        }
        const skillDefs = this.skillDispatcher?.getActiveSkillDefs() ?? '(no skills)';
        const skills = skillDefs.split('\n').filter(s => s.trim());
        const entries = skills.map(s => {
            const match = s.match(/\((\w+)/);
            const name = match ? match[1] : 'unknown';
            return `(skill-entry :name "${name}" :enabled true)`;
        }).join(' ');
        return `(skill-inventory ${entries})`;
    }

    describeSubsystems() {
        const subsystems = {
            channels: !!this.embodimentBus,
            embodiments: this._getEmbodimentList(),
            ai: true,
            toolInstances: ['websearch', 'file'],
            mettaControlPlane: this.config.capabilities?.mettaControlPlane ?? false,
            semanticMemory: this.config.capabilities?.semanticMemory ?? false,
            safetyLayer: this.config.capabilities?.safetyLayer ?? false,
            auditLog: this.config.capabilities?.auditLog ?? false,
            executionHooks: this.config.capabilities?.executionHooks ?? false,
            harnessOptimization: this.config.capabilities?.harnessOptimization ?? false
        };
        return this._toMeTTaAtom('subsystems', subsystems);
    }

    getState(key) {
        if (!this.loopState) {
            return `(agent-state :error "loop-state-not-available")`;
        }

        const escape = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
        const fmt = (v) => v ? `"${escape(v)}"` : '()';

        switch (key) {
            case '&wm':
            case 'wm': {
                const wmEntries = (this.loopState.wm || []).map(e =>
                    `(wm-entry :content "${escape(e.content)}" :priority ${e.priority ?? 0.5} :ttl ${e.ttl ?? 0})`
                ).join(' ');
                return `(agent-state "&wm" (${wmEntries}))`;
            }
            case '&budget':
            case 'budget':
                return `(agent-state "&budget" ${this.loopState.budget ?? 0})`;
            case '&cycle-count':
            case 'cycle-count':
                return `(agent-state "&cycle-count" ${this.loopState.cycleCount ?? 0})`;
            case '&error':
            case 'error':
                return `(agent-state "&error" ${fmt(this.loopState.error)})`;
            case '&prevmsg':
            case 'prevmsg':
                return `(agent-state "&prevmsg" ${fmt(this.loopState.prevmsg)})`;
            case '&lastresults':
            case 'lastresults': {
                const results = (this.loopState.lastresults ?? []).map(r =>
                    `(result :skill "${r.skill ?? 'unknown'}" :error "${r.error ?? 'none'}")`
                ).join(' ');
                return `(agent-state "&lastresults" (${results}))`;
            }
            case '&lastsend':
            case 'lastsend':
                return `(agent-state "&lastsend" "${escape(this.loopState.lastsend ?? '')}")`;
            case '&model-override':
            case 'model-override':
                return `(agent-state "&model-override" :model "${this.loopState.modelOverride ?? 'auto'}" :cycles ${this.loopState.modelOverrideCycles ?? 0})`;
            default:
                return `(agent-state :unknown-key "${key}")`;
        }
    }

    _getCapabilityState() {
        const caps = this.config.capabilities || {};
        const result = {};
        for (const [key, value] of Object.entries(caps)) {
            result[key] = Boolean(value);
        }
        return result;
    }

    _getActiveSkills() {
        if (!this.skillDispatcher) {
            return [];
        }
        return this.skillDispatcher.getActiveSkillDefs().split('\n').filter(s => s.trim());
    }

    _getEmbodiments() {
        if (!this.embodimentBus) {
            return [];
        }
        return this.embodimentBus.getAll?.().map(e => ({
            id: e.id, type: e.type, status: e.status, active: e.status === 'connected'
        })) ?? [];
    }

    _getEmbodimentList() {
        return this.embodimentBus?.getAll?.()?.map(e => e.id) ?? [];
    }

    _getModelScores() {
        return this.modelRouter?.getScores?.() ?? [];
    }

    _toMeTTaAtom(name, obj) {
        const parts = Object.entries(obj).map(([key, value]) => {
            const formattedKey = `:${key}`;
            let formattedValue;
            if (typeof value === 'boolean') {
                formattedValue = value ? 'true' : 'false';
            } else if (typeof value === 'number') {
                formattedValue = String(value);
            } else if (typeof value === 'string') {
                formattedValue = `"${value}"`;
            } else if (Array.isArray(value)) {
                formattedValue = `(${value.map(v => typeof v === 'object' ? this._objToSExpr(v) : String(v)).join(' ')})`;
            } else if (typeof value === 'object' && value !== null) {
                formattedValue = this._objToSExpr(value);
            } else {
                formattedValue = `"${value}"`;
            }
            return `${formattedKey} ${formattedValue}`;
        });
        return `(${name} ${parts.join(' ')})`;
    }

    _objToSExpr(obj) {
        if (!obj || typeof obj !== 'object') {
            return String(obj);
        }
        return `(${Object.entries(obj).map(([key, value]) => {
            const formattedKey = `:${key}`;
            let formattedValue;
            if (typeof value === 'boolean') {
                formattedValue = value ? 'true' : 'false';
            } else if (typeof value === 'number') {
                formattedValue = String(value);
            } else if (typeof value === 'string') {
                formattedValue = `"${value}"`;
            } else if (Array.isArray(value)) {
                formattedValue = `(${value.join(' ')})`;
            } else if (typeof value === 'object') {
                formattedValue = this._objToSExpr(value);
            } else {
                formattedValue = `"${value}"`;
            }
            return `${formattedKey} ${formattedValue}`;
        }).join(' ')})`;
    }
}

// Static convenience methods
IntrospectionOps.generateManifest = (config, loopState, skillDispatcher, embodimentBus, modelRouter) =>
    new IntrospectionOps(config, skillDispatcher, embodimentBus, modelRouter, loopState).generateManifest();

IntrospectionOps.listSkills = (config, skillDispatcher) =>
    new IntrospectionOps(config, skillDispatcher, null, null, null).listSkills();

IntrospectionOps.describeSubsystems = (config, embodimentBus) =>
    new IntrospectionOps(config, null, embodimentBus, null, null).describeSubsystems();

IntrospectionOps.getState = (key, loopState) =>
    new IntrospectionOps({}, null, null, null, loopState).getState(key);
