/**
 * Unified Planning System
 * Consolidates Planner, HierarchicalPlanner, PathPlanner into a cohesive system
 */
import { mergeConfig } from '../utils/ConfigHelper.js';

const PLANNING_DEFAULTS = {
    planningHorizon: 3,
    cycles: 50,
    defaultCycles: 50,
    maxPathLength: 100,
    timeout: 5000,
    useCache: true,
    fallbackStrategy: 'first-available',
    cacheSize: 1000
};

const formatTerm = (val) => {
    if (Array.isArray(val)) return `(${val.join(',')})`;
    if (typeof val === 'object' && val !== null) return JSON.stringify(val);
    return String(val);
};

const formatAction = (action) => {
    const a = formatTerm(action);
    return a.startsWith('^') || a.startsWith('op_') ? a : `^${a}`;
};

export class PlanningSystem {
    constructor(bridge, config = {}) {
        this.bridge = bridge;
        this.config = mergeConfig(PLANNING_DEFAULTS, config);
        this.pathCache = new Map();
        this.goalCache = new Map();
        this.currentOption = null;
        this.skills = null;
    }

    setSkills(skillLibrary) {
        this.skills = skillLibrary;
        return this;
    }

    async act(obs, goal = null) {
        if (!this.bridge) return null;

        if (goal) {
            if (this.skills) {
                return this._hierarchicalAct(obs, goal);
            }
            return this._goalDirectedAct(obs, goal);
        }

        return this._reactiveAct(obs);
    }

    async _goalDirectedAct(obs, goal) {
        const cacheKey = `${JSON.stringify(obs)}_${JSON.stringify(goal)}`;
        if (this.config.useCache && this.goalCache.has(cacheKey)) {
            return this.goalCache.get(cacheKey);
        }

        const obsTerm = formatTerm(obs);
        const goalTerm = formatTerm(goal);

        await this.bridge.input(`<(*, ${obsTerm}) --> obs>.`);
        const result = await this.bridge.achieve(`<(*, ${goalTerm}) --> obs>!`, {
            cycles: this.config.cycles
        });

        const action = result?.executedOperations?.[0] ?? null;
        if (this.config.useCache && action) {
            this.goalCache.set(cacheKey, action);
            this._maintainCache(this.goalCache, this.config.cacheSize);
        }

        return action;
    }

    async _hierarchicalAct(obs, goal) {
        if (this.currentOption && !this._isTerminated(this.currentOption, obs)) {
            return this.currentOption.act(obs);
        }

        this.currentOption = null;

        const skill = await this._selectSkillForGoal(goal, obs);
        if (skill) {
            this.currentOption = skill;
            return skill.act(obs);
        }

        const available = this.skills.available?.(obs) ?? [];
        if (available.length > 0) {
            this.currentOption = this.skills.get(available[0]);
            return this.currentOption?.act(obs) ?? null;
        }

        return this._goalDirectedAct(obs, goal);
    }

    async _selectSkillForGoal(goal, obs) {
        const goalTerm = formatTerm(goal);
        const query = `<${goalTerm} --> (achieved_by, ?skill)>?`;

        try {
            const result = await this.bridge.ask(query);
            if (result?.substitution?.['?skill']) {
                const skillName = result.substitution['?skill'].toString().replace(/^"|"$/g, '');
                const skill = this.skills.get(skillName);
                if (skill && (!skill.precondition || skill.precondition(obs))) {
                    return skill;
                }
            }
        } catch {
            // Query failed, will use fallback
        }
        return null;
    }

    _isTerminated(skill, obs) {
        return skill.terminated?.(obs) ?? skill.shouldTerminate?.(obs) ?? false;
    }

    async _reactiveAct(obs) {
        return this._goalDirectedAct(obs, 'default_goal');
    }

    async plan(startState, goal) {
        if (!this.bridge) return null;

        const cacheKey = `${startState}_to_${goal}`;
        if (this.config.useCache && this.pathCache.has(cacheKey)) {
            return this.pathCache.get(cacheKey);
        }

        try {
            const result = await this.bridge.ask(`<( ${formatTerm(startState)} ) --> (path-to, ${formatTerm(goal)})>?`);
            const path = result?.answer ? result.term : null;

            if (this.config.useCache && path) {
                this.pathCache.set(cacheKey, path);
                this._maintainCache(this.pathCache, this.config.cacheSize);
            }

            return path;
        } catch {
            return null;
        }
    }

    async induce(trajectories) {
        if (!this.bridge) return;

        const promises = trajectories.map(ep => this._processEpisode(ep));
        await Promise.all(promises);
        await this.bridge.runCycles(this.config.cyclesAfterInduction ?? 100);
    }

    async _processEpisode({ obs, action, nextObs, reward }) {
        if (!this.bridge) return;

        const o = formatTerm(obs);
        const n = formatTerm(nextObs);
        const a = formatAction(action);

        await Promise.all([
            this.bridge.input(`<(*, ${o}) --> obs>.`),
            this.bridge.input(`${a}.`),
            this.bridge.input(`<(*, ${n}) --> obs>.`),
            this.bridge.input(`<(&/, <(*, ${o}) --> obs>, ${a}) ==> <(*, ${n}) --> obs>>.`),
            ...(reward > 0 ? [this.bridge.input(`<(*, ${n}) --> achieved>!`)] : [])
        ]);
    }

    _maintainCache(cache, maxSize) {
        if (cache.size > maxSize) {
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
        }
    }

    clearCache() {
        this.pathCache.clear();
        this.goalCache.clear();
    }

    getCurrentOption() {
        return this.currentOption;
    }

    reset() {
        this.currentOption = null;
        if (this.config.useCache) {
            this.clearCache();
        }
    }
}

export class IntrinsicMotivation {
    constructor(config = {}) {
        this.config = mergeConfig({ intrinsicMode: 'none', intrinsicWeight: 0.1 }, config);
        this.visitCounts = new Map();
    }

    calculate(transition) {
        if (this.config.intrinsicMode === 'none') return 0;

        return this.config.intrinsicMode === 'novelty'
            ? this._calculateNovelty(transition.nextObs)
            : 0;
    }

    _calculateNovelty(obs) {
        const key = Array.isArray(obs)
            ? obs.map(x => Math.floor(x * 10)).join('_')
            : `${obs}`;

        const count = (this.visitCounts.get(key) || 0) + 1;
        this.visitCounts.set(key, count);
        return this.config.intrinsicWeight / Math.sqrt(count);
    }

    reset() {
        this.visitCounts.clear();
    }

    getVisitCount(key) {
        return this.visitCounts.get(key) ?? 0;
    }
}

export { PlanningSystem as Planner };
export { PlanningSystem as HierarchicalPlanner };
export { PlanningSystem as PathPlanner };
export { PlanningSystem as RuleInducer };
