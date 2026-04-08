/**
 * IntrospectionOps.js — Runtime self-description primitives
 *
 * Governed by: runtimeIntrospection capability flag
 *
 * Provides always-available grounded ops that generate structured
 * self-descriptions for agent self-query and external tooling.
 *
 * Registered grounded ops:
 * - (manifest) — Generate agent manifest with capabilities, skills, state
 * - (skill-inventory) — List all registered skills
 * - (subsystems) — Describe active subsystems
 * - (agent-state key) — Query loop state variables
 */

import { Logger } from '@senars/core';

export class IntrospectionOps {
  constructor(config, skillDispatcher, embodimentBus, modelRouter, loopState) {
    this.config = config;
    this.skillDispatcher = skillDispatcher;
    this.embodimentBus = embodimentBus;
    this.modelRouter = modelRouter;
    this.loopState = loopState;
    
    // Cache for manifest (5-cycle validity)
    this.manifestCache = null;
    this.manifestCacheExpiry = 0;
    this.cacheValidity = 5;
    
    Logger.info('[IntrospectionOps] Initialized');
  }

  /**
   * Generate full agent manifest.
   * Returns MeTTa atom string.
   */
  generateManifest() {
    if (!this.config.capabilities?.runtimeIntrospection) {
      return '(manifest :restricted true)';
    }

    // Check cache
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

    const atom = this._toMeTTaAtom('agent-manifest', manifest);
    
    // Cache for remaining cycles
    this.manifestCache = atom;
    this.manifestCacheExpiry = currentCycle + this.cacheValidity;
    
    return atom;
  }

  /**
   * List all registered skills.
   * Returns MeTTa atom string.
   */
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

  /**
   * Describe active subsystems.
   * Returns MeTTa atom string.
   */
  describeSubsystems() {
    const subsystems = {
      channelManager: !!this.embodimentBus,
      embodiments: this._getEmbodimentList(),
      ai: true,
      toolInstances: this._getToolList(),
      mettaControlPlane: this.config.capabilities?.mettaControlPlane ?? false,
      semanticMemory: this.config.capabilities?.semanticMemory ?? false,
      safetyLayer: this.config.capabilities?.safetyLayer ?? false,
      auditLog: this.config.capabilities?.auditLog ?? false,
      executionHooks: this.config.capabilities?.executionHooks ?? false,
      harnessOptimization: this.config.capabilities?.harnessOptimization ?? false
    };
    
    return this._toMeTTaAtom('subsystems', subsystems);
  }

  /**
   * Query agent state by key.
   * Returns MeTTa atom string.
   */
  getState(key) {
    if (!this.loopState) {
      return `(agent-state :error "loop-state-not-available")`;
    }

    switch (key) {
      case '&wm':
      case 'wm':
        const wmEntries = (this.loopState.wm || []).map(e => 
          `(wm-entry :content "${this._escape(e.content)}" :priority ${e.priority ?? 0.5} :ttl ${e.ttl ?? 0})`
        ).join(' ');
        return `(agent-state "&wm" (${wmEntries}))`;
      
      case '&budget':
      case 'budget':
        return `(agent-state "&budget" ${this.loopState.budget ?? 0})`;
      
      case '&cycle-count':
      case 'cycle-count':
        return `(agent-state "&cycle-count" ${this.loopState.cycleCount ?? 0})`;
      
      case '&error':
      case 'error':
        const error = this.loopState.error ?? '()';
        return `(agent-state "&error" ${error ? `"${this._escape(error)}"` : '()'})`;
      
      case '&prevmsg':
      case 'prevmsg':
        const prevmsg = this.loopState.prevmsg ?? '()';
        return `(agent-state "&prevmsg" ${prevmsg ? `"${this._escape(prevmsg)}"` : '()'})`;
      
      case '&lastresults':
      case 'lastresults':
        const results = this.loopState.lastresults ?? [];
        const resultStr = results.map(r => 
          `(result :skill "${r.skill ?? 'unknown'}" :error "${r.error ?? 'none'}")`
        ).join(' ');
        return `(agent-state "&lastresults" (${resultStr}))`;
      
      case '&lastsend':
      case 'lastsend':
        const lastsend = this.loopState.lastsend ?? '';
        return `(agent-state "&lastsend" "${this._escape(lastsend)}")`;
      
      case '&model-override':
      case 'model-override':
        const override = this.loopState.modelOverride ?? 'auto';
        const cycles = this.loopState.modelOverrideCycles ?? 0;
        return `(agent-state "&model-override" :model "${override}" :cycles ${cycles})`;
      
      default:
        return `(agent-state :unknown-key "${key}")`;
    }
  }

  // ── Private ──────────────────────────────────────────────────────

  /**
   * Get capability state as object.
   */
  _getCapabilityState() {
    const caps = this.config.capabilities || {};
    const result = {};
    
    for (const [key, value] of Object.entries(caps)) {
      result[key] = Boolean(value);
    }
    
    return result;
  }

  /**
   * Get active skills list.
   */
  _getActiveSkills() {
    if (!this.skillDispatcher) return [];
    
    const defs = this.skillDispatcher.getActiveSkillDefs();
    return defs.split('\n').filter(s => s.trim());
  }

  /**
   * Get embodiment list.
   */
  _getEmbodiments() {
    if (!this.embodimentBus) return [];
    
    const embodiments = this.embodimentBus.getAll?.() || [];
    return embodiments.map(e => ({
      id: e.id,
      type: e.type,
      status: e.status,
      active: e.status === 'connected'
    }));
  }

  /**
   * Get embodiment list (simple format).
   */
  _getEmbodimentList() {
    if (!this.embodimentBus) return [];
    
    const embodiments = this.embodimentBus.getAll?.() || [];
    return embodiments.map(e => e.id);
  }

  /**
   * Get model scores.
   */
  _getModelScores() {
    if (!this.modelRouter) return [];
    
    // Get scores from model router (returns array of { modelId, truth: { f, c } })
    const scores = this.modelRouter.getScores?.() || [];
    return scores.map(s => ({
      model: s.modelId,
      truth: s.truth
    }));
  }

  /**
   * Get tool instance list.
   */
  _getToolList() {
    // Tools are typically on the Agent instance
    return ['websearch', 'file'];
  }

  /**
   * Convert object to MeTTa atom string.
   */
  _toMeTTaAtom(name, obj) {
    const parts = [];
    
    for (const [key, value] of Object.entries(obj)) {
      const formattedKey = `:${key}`;
      let formattedValue;
      
      if (typeof value === 'boolean') {
        formattedValue = value ? 'true' : 'false';
      } else if (typeof value === 'number') {
        formattedValue = String(value);
      } else if (typeof value === 'string') {
        formattedValue = `"${value}"`;
      } else if (Array.isArray(value)) {
        formattedValue = `(${value.map(v => {
          if (typeof v === 'object') {
            return this._objToSExpr(v);
          }
          return String(v);
        }).join(' ')})`;
      } else if (typeof value === 'object' && value !== null) {
        formattedValue = this._objToSExpr(value);
      } else {
        formattedValue = `"${value}"`;
      }
      
      parts.push(`${formattedKey} ${formattedValue}`);
    }
    
    return `(${name} ${parts.join(' ')})`;
  }

  /**
   * Convert object to S-expression string.
   */
  _objToSExpr(obj) {
    if (!obj || typeof obj !== 'object') {
      return String(obj);
    }
    
    const parts = [];
    for (const [key, value] of Object.entries(obj)) {
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
      
      parts.push(`${formattedKey} ${formattedValue}`);
    }
    
    return `(${parts.join(' ')})`;
  }

  /**
   * Escape special characters for MeTTa strings.
   */
  _escape(str) {
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }
}

// Static methods for simple usage without instantiation
IntrospectionOps.generateManifest = function(config, loopState, skillDispatcher, embodimentBus, modelRouter) {
  const ops = new IntrospectionOps(config, skillDispatcher, embodimentBus, modelRouter, loopState);
  return ops.generateManifest();
};

IntrospectionOps.listSkills = function(config, skillDispatcher) {
  const ops = new IntrospectionOps(config, skillDispatcher, null, null, null);
  return ops.listSkills();
};

IntrospectionOps.describeSubsystems = function(config, embodimentBus) {
  const ops = new IntrospectionOps(config, null, embodimentBus, null, null);
  return ops.describeSubsystems();
};

IntrospectionOps.getState = function(key, loopState) {
  const ops = new IntrospectionOps({}, null, null, null, loopState);
  return ops.getState(key);
};
