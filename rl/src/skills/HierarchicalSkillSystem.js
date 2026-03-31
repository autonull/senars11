/**
 * Hierarchical Skill Discovery and Composition System
 * Enables automatic discovery, learning, and composition of skills.
 */
import { Component } from '../composable/Component.js';
import { SymbolicTensor, TensorLogicBridge } from '@senars/tensor';

const SKILL_DEFAULTS = {
    precondition: null,
    termination: null,
    policy: null,
    initiationSet: null,
    terminalSet: null,
    subSkills: [],
    abstractionLevel: 0,
    discoverySource: 'manual',
    experienceCapacity: 1000,
    experiencePruneThreshold: 500
};

const mergeConfig = (defaults, config) => ({ ...defaults, ...config });

export class Skill extends Component {
    constructor(name, config = {}) {
        const mergedConfig = mergeConfig(SKILL_DEFAULTS, { name, ...config });
        super({
            name: mergedConfig.name,
            precondition: mergedConfig.precondition,
            termination: mergedConfig.termination,
            policy: mergedConfig.policy,
            initiationSet: mergedConfig.initiationSet,
            terminalSet: mergedConfig.terminalSet,
            subSkills: mergedConfig.subSkills,
            abstractionLevel: mergedConfig.abstractionLevel,
            discoverySource: mergedConfig.discoverySource,
            ...config
        });

        this.experience = [];
        this.successRate = 0;
        this.usageCount = 0;
        this.discoverySource = mergedConfig.discoverySource;
        this.parent = null;
        this.children = new Map();
        this._capacity = mergedConfig.experienceCapacity;
        this._pruneThreshold = mergedConfig.experiencePruneThreshold;
    }

    async onInitialize() {
        this.children.forEach(skill => skill.initialize());
        this.setState('active', false);
        this.setState('currentStep', 0);
    }

    canInitiate(observation, context = {}) {
        return this.config.initiationSet?.(observation, context)
            ?? this.config.precondition?.(observation, context)
            ?? true;
    }

    shouldTerminate(observation, context = {}) {
        return this.config.termination?.(observation, context)
            ?? this.config.terminalSet?.(observation, context)
            ?? false;
    }

    async act(observation, context = {}) {
        this.setState('active', true);
        this.setState('currentStep', this.getState('currentStep') + 1);
        this.usageCount++;

        const action = this.config.policy
            ? await this.config.policy(observation, context, this)
            : this.children.size > 0
                ? await this.executeHierarchical(observation, context)
                : this.defaultPolicy(observation, context);

        this.experience.push({
            observation,
            action,
            context: { ...context },
            step: this.getState('currentStep'),
            timestamp: Date.now()
        });

        if (this.shouldTerminate(observation, context)) {
            this.setState('active', false);
            this.setState('currentStep', 0);
        }

        return action;
    }

    async executeHierarchical(observation, context) {
        const selectedSkill = this.selectSubSkill(observation, context);
        return selectedSkill?.act(observation, context) ?? this.defaultPolicy(observation, context);
    }

    selectSubSkill(observation, context) {
        for (const skill of this.children.values()) {
            if (skill.canInitiate(observation, context)) return skill;
        }
        return null;
    }

    defaultPolicy(observation, context) {
        return Math.floor(Math.random() * (context.actionSpace ?? 2));
    }

    async learn(reward, done = false) {
        if (done) {
            const success = reward > 0;
            this.successRate = (this.successRate * this.usageCount + (success ? 1 : 0)) / (this.usageCount + 1);
        }

        if (this.config.policy?.update) {
            const lastExperience = this.experience.at(-1);
            if (lastExperience) await this.config.policy.update(lastExperience, reward, done);
        }

        if (this.experience.length > this._capacity) {
            this.experience = this.experience.slice(-this._pruneThreshold);
        }
    }

    addSubSkill(name, skill) {
        skill.parent = this;
        this.children.set(name, skill);
        return this;
    }

    removeSubSkill(name) {
        const skill = this.children.get(name);
        if (skill) {
            skill.parent = null;
            this.children.delete(name);
        }
        return this;
    }

    toSymbolicTerm() {
        return {
            type: 'Skill',
            name: this.config.name,
            abstractionLevel: this.config.abstractionLevel,
            successRate: this.successRate,
            usageCount: this.usageCount,
            subSkills: Array.from(this.children.keys())
        };
    }

    serialize() {
        return {
            ...super.serialize(),
            experience: this.experience.slice(-100),
            successRate: this.successRate,
            usageCount: this.usageCount,
            discoverySource: this.discoverySource
        };
    }
}

const SKILL_LIBRARY_DEFAULTS = {
    capacity: 100,
    similarityThreshold: 0.8,
    retrievalStrategy: 'relevance',
    pruneRatio: 0.2,
    experienceCapacity: 100
};

export class SkillLibrary extends Component {
    constructor(config = {}) {
        super(mergeConfig(SKILL_LIBRARY_DEFAULTS, config));
        this.skills = new Map();
        this.skillGraph = new Map();
        this.usageStats = new Map();
        this.discoveryLog = [];
    }

    register(name, skill) {
        if (this.skills.size >= this.config.capacity) {
            this.pruneLeastUsed();
        }

        this.skills.set(name, skill);
        this.usageStats.set(name, { count: 0, success: 0, lastUsed: Date.now() });
        this.updateSkillGraph(name, skill);
        this.emit('skillRegistered', { name, skill });
        return this;
    }

    get(name) {
        const skill = this.skills.get(name);
        if (skill) {
            const stats = this.usageStats.get(name);
            if (stats) {
                stats.count++;
                stats.lastUsed = Date.now();
            }
        }
        return skill;
    }

    retrieve(context, options = {}) {
        const { maxResults = 5, minSuccessRate = 0, abstractionLevel = null } = options;

        const candidates = Array.from(this.skills.entries())
            .filter(([name, skill]) => {
                if (abstractionLevel !== null && skill.config.abstractionLevel !== abstractionLevel) return false;
                const stats = this.usageStats.get(name);
                if (stats && stats.count > 0) {
                    const successRate = stats.success / stats.count;
                    if (successRate < minSuccessRate) return false;
                }
                return skill.canInitiate(context.observation, context);
            })
            .map(([name, skill]) => ({
                name,
                skill,
                relevance: this.computeRelevance(skill, context),
                successRate: this.getSuccessRate(name)
            }))
            .sort((a, b) => {
                const scoreA = a.relevance * 0.6 + a.successRate * 0.4;
                const scoreB = b.relevance * 0.6 + b.successRate * 0.4;
                return scoreB - scoreA;
            })
            .slice(0, maxResults);

        return candidates;
    }

    computeRelevance(skill, context) {
        if (!skill.config.precondition) return 0.5;
        try {
            return skill.config.precondition(context.observation, context) ? 0.8 : 0.2;
        } catch {
            return 0.5;
        }
    }

    updateSkillGraph(name, skill) {
        if (!this.skillGraph.has(name)) {
            this.skillGraph.set(name, new Set());
        }

        skill.children.forEach((_, subName) => {
            if (!this.skillGraph.has(subName)) {
                this.skillGraph.set(subName, new Set());
            }
            this.skillGraph.get(subName).add(name);
        });
    }

    pruneLeastUsed() {
        const usageList = Array.from(this.usageStats.entries())
            .sort((a, b) => a[1].count - b[1].count);

        const toRemove = usageList.slice(0, Math.floor(this.config.capacity * this.config.pruneRatio));

        toRemove.forEach(([name]) => {
            this.skills.delete(name);
            this.usageStats.delete(name);
            this.emit('skillPruned', { name });
        });
    }

    getStats(name) {
        return this.usageStats.get(name) ?? null;
    }

    recordSuccess(name, success) {
        const stats = this.usageStats.get(name);
        if (stats) stats.success += success ? 1 : 0;
    }

    list() {
        return Array.from(this.skills.entries()).map(([name, skill]) => ({
            name,
            abstractionLevel: skill.config.abstractionLevel,
            usageCount: this.usageStats.get(name)?.count ?? 0,
            successRate: this.getSuccessRate(name)
        }));
    }

    getSuccessRate(name) {
        const stats = this.usageStats.get(name);
        if (!stats || stats.count === 0) return 0.5;
        return stats.success / stats.count;
    }

    getGraph() {
        return Array.from(this.skillGraph.entries()).map(([name, deps]) => ({
            name,
            dependencies: Array.from(deps)
        }));
    }

    serialize() {
        return {
            skills: Array.from(this.skills.entries()).map(([name, skill]) => ({
                name,
                data: skill.serialize()
            })),
            usageStats: Array.from(this.usageStats.entries()),
            skillGraph: this.getGraph()
        };
    }
}

const SKILL_DISCOVERY_DEFAULTS = {
    discoveryMode: 'online',
    minUsageCount: 10,
    bottleneckThreshold: 0.3,
    noveltyThreshold: 0.5,
    graphClustering: 'louvain',
    stateHistoryLimit: 1000,
    discoveryLogLimit: 100
};

export class SkillDiscoveryEngine extends Component {
    constructor(config = {}) {
        super(mergeConfig(SKILL_DISCOVERY_DEFAULTS, config));
        this.library = config.library ?? new SkillLibrary();
        this.stateVisits = new Map();
        this.transitionGraph = new Map();
        this.bottlenecks = [];
        this.candidateSkills = [];
    }

    processTransition(transition) {
        const { state, nextState } = transition;
        const stateKey = this.stateToKey(state);
        const nextStateKey = this.stateToKey(nextState);

        this.stateVisits.set(stateKey, (this.stateVisits.get(stateKey) ?? 0) + 1);

        if (!this.transitionGraph.has(stateKey)) {
            this.transitionGraph.set(stateKey, new Map());
        }
        const transitions = this.transitionGraph.get(stateKey);
        transitions.set(nextStateKey, (transitions.get(nextStateKey) ?? 0) + 1);

        if (this.isBottleneck(stateKey)) {
            this.bottlenecks.push(stateKey);
            this.emit('bottleneckDetected', { state: stateKey });
        }

        if (this.isNovelState(nextStateKey)) {
            this.emit('novelStateDetected', { state: nextStateKey });
        }

        if (this.shouldDiscoverSkills()) {
            this.discoverSkills();
        }
    }

    stateToKey(state) {
        if (Array.isArray(state)) return state.map(x => Math.round(x * 10)).join('_');
        if (state instanceof SymbolicTensor) return state.toNarseseTerm('s');
        return String(state);
    }

    isBottleneck(stateKey) {
        const visits = this.stateVisits.get(stateKey) ?? 0;
        const transitions = this.transitionGraph.get(stateKey);

        if (!transitions || visits < this.config.minUsageCount) return false;

        let inDegree = 0;
        for (const [, trans] of this.transitionGraph) {
            if (trans.has(stateKey)) inDegree += trans.get(stateKey);
        }

        const outDegree = Array.from(transitions.values()).reduce((a, b) => a + b, 0);
        return inDegree > outDegree * this.config.bottleneckThreshold;
    }

    isNovelState(stateKey) {
        return (this.stateVisits.get(stateKey) ?? 0) === 1;
    }

    shouldDiscoverSkills() {
        const totalVisits = Array.from(this.stateVisits.values()).reduce((a, b) => a + b, 0);
        return totalVisits % 100 === 0;
    }

    discoverSkills() {
        switch (this.config.discoveryMode) {
            case 'bottleneck': this.discoverBottleneckSkills(); break;
            case 'curiosity': this.discoverNoveltySkills(); break;
            case 'graph': this.discoverGraphSkills(); break;
            default: this.discoverBottleneckSkills();
        }
    }

    discoverBottleneckSkills() {
        this.bottlenecks.forEach(bottleneck => {
            const skill = this.createBottleneckSkill(bottleneck);
            this.candidateSkills.push(skill);
            this.emit('skillDiscovered', { skill, source: 'bottleneck', state: bottleneck });
        });

        this.discoveryLog.push({
            type: 'bottleneck',
            count: this.bottlenecks.length,
            timestamp: Date.now()
        });
    }

    discoverNoveltySkills() {
        const novelStates = Array.from(this.stateVisits.entries())
            .filter(([, count]) => count === 1)
            .map(([state]) => state);

        novelStates.forEach(state => {
            this.candidateSkills.push(this.createNoveltySkill(state));
        });
    }

    discoverGraphSkills() {
        const communities = this.detectCommunities();
        communities.forEach(community => {
            this.candidateSkills.push(this.createCommunitySkill(community));
        });
    }

    detectCommunities() {
        const communities = [];
        const visited = new Set();

        for (const [state] of this.transitionGraph) {
            if (visited.has(state)) continue;

            const community = [state];
            visited.add(state);

            const queue = [state];
            while (queue.length > 0 && community.length < 10) {
                const current = queue.shift();
                const transitions = this.transitionGraph.get(current);

                if (transitions) {
                    for (const [next] of transitions) {
                        if (!visited.has(next)) {
                            visited.add(next);
                            community.push(next);
                            queue.push(next);
                        }
                    }
                }
            }

            if (community.length > 1) communities.push(community);
        }

        return communities;
    }

    createBottleneckSkill(bottleneck) {
        return new Skill(`bottleneck_${bottleneck.slice(0, 10)}`, {
            abstractionLevel: 1,
            discoverySource: 'bottleneck',
            precondition: (obs) => this.stateToKey(obs) === bottleneck,
            termination: (obs, ctx) => ctx.stepsInSkill > 10,
            policy: this.createDefaultPolicy(bottleneck)
        });
    }

    createNoveltySkill(state) {
        const prefix = state.split('_').slice(0, 2).join('_');
        return new Skill(`novelty_${state.slice(0, 10)}`, {
            abstractionLevel: 1,
            discoverySource: 'novelty',
            precondition: (obs) => this.stateToKey(obs).startsWith(prefix),
            termination: (obs, ctx) => ctx.stepsInSkill > 5
        });
    }

    createCommunitySkill(community) {
        const states = new Set(community);
        return new Skill(`community_${community.length}`, {
            abstractionLevel: 1,
            discoverySource: 'graph',
            precondition: (obs) => states.has(this.stateToKey(obs)),
            termination: (obs, ctx) => !states.has(this.stateToKey(obs))
        });
    }

    createDefaultPolicy(targetState) {
        return async (obs, ctx) => Math.floor(Math.random() * (ctx.actionSpace ?? 2));
    }

    getCandidateSkills() {
        return this.candidateSkills;
    }

    promoteSkill(skillName) {
        const idx = this.candidateSkills.findIndex(s => s.config.name === skillName);
        if (idx === -1) return false;
        const skill = this.candidateSkills[idx];
        this.library.register(skillName, skill);
        this.candidateSkills.splice(idx, 1);
        return true;
    }

    serialize() {
        return {
            stateVisits: Array.from(this.stateVisits.entries()).slice(-this.config.stateHistoryLimit),
            bottlenecks: this.bottlenecks,
            candidateSkills: this.candidateSkills.map(s => s.config.name),
            discoveryLog: this.discoveryLog.slice(-this.config.discoveryLogLimit)
        };
    }
}
