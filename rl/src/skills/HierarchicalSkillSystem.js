/**
 * Hierarchical Skill Discovery and Composition System
 * Enables automatic discovery, learning, and composition of skills.
 */
import { Component } from '../composable/Component.js';
import { SymbolicTensor, TensorLogicBridge } from '../neurosymbolic/TensorLogicBridge.js';

/**
 * Skill representation with preconditions, termination, and policy.
 */
export class Skill extends Component {
    constructor(name, config = {}) {
        super({
            name,
            precondition: config.precondition || null,
            termination: config.termination || null,
            policy: config.policy || null,
            initiationSet: config.initiationSet || null,
            terminalSet: config.terminalSet || null,
            subSkills: config.subSkills || [],
            abstractionLevel: config.abstractionLevel || 0,
            ...config
        });
        
        this.experience = [];
        this.successRate = 0;
        this.usageCount = 0;
        this.discoverySource = config.discoverySource || 'manual';
        this.parent = null;
        this.children = new Map();
    }

    async onInitialize() {
        // Initialize sub-skills
        for (const [name, skill] of this.children) {
            await skill.initialize();
        }
        
        this.setState('active', false);
        this.setState('currentStep', 0);
    }

    /**
     * Check if skill can be initiated in current state.
     */
    canInitiate(observation, context = {}) {
        if (this.config.initiationSet) {
            return this.config.initiationSet(observation, context);
        }
        
        if (this.config.precondition) {
            return this.config.precondition(observation, context);
        }
        
        return true;
    }

    /**
     * Check if skill should terminate in current state.
     */
    shouldTerminate(observation, context = {}) {
        if (this.config.termination) {
            return this.config.termination(observation, context);
        }
        
        if (this.config.terminalSet) {
            return this.config.terminalSet(observation, context);
        }
        
        return false;
    }

    /**
     * Execute skill policy.
     */
    async act(observation, context = {}) {
        this.setState('active', true);
        this.setState('currentStep', this.getState('currentStep') + 1);
        this.usageCount++;
        
        let action;
        
        if (this.config.policy) {
            action = await this.config.policy(observation, context, this);
        } else if (this.children.size > 0) {
            // Hierarchical execution
            action = await this.executeHierarchical(observation, context);
        } else {
            action = this.defaultPolicy(observation, context);
        }
        
        // Store experience
        this.experience.push({
            observation,
            action,
            context: { ...context },
            step: this.getState('currentStep'),
            timestamp: Date.now()
        });
        
        // Check termination
        if (this.shouldTerminate(observation, context)) {
            this.setState('active', false);
            this.setState('currentStep', 0);
        }
        
        return action;
    }

    /**
     * Execute hierarchical skill composition.
     */
    async executeHierarchical(observation, context) {
        // Select sub-skill
        const selectedSkill = this.selectSubSkill(observation, context);
        
        if (selectedSkill) {
            return selectedSkill.act(observation, context);
        }
        
        return this.defaultPolicy(observation, context);
    }

    /**
     * Select appropriate sub-skill.
     */
    selectSubSkill(observation, context) {
        for (const skill of this.children.values()) {
            if (skill.canInitiate(observation, context)) {
                return skill;
            }
        }
        return null;
    }

    /**
     * Default policy (random/placeholder).
     */
    defaultPolicy(observation, context) {
        const actionSpace = context.actionSpace || 2;
        return Math.floor(Math.random() * actionSpace);
    }

    /**
     * Update skill from experience.
     */
    async learn(reward, done = false) {
        if (done) {
            // Update success rate
            const success = reward > 0;
            this.successRate = (this.successRate * this.usageCount + (success ? 1 : 0)) / (this.usageCount + 1);
        }
        
        // Learn policy if trainable
        if (this.config.policy && typeof this.config.policy.update === 'function') {
            const lastExperience = this.experience[this.experience.length - 1];
            if (lastExperience) {
                await this.config.policy.update(lastExperience, reward, done);
            }
        }
        
        // Prune old experience
        if (this.experience.length > 1000) {
            this.experience = this.experience.slice(-500);
        }
    }

    /**
     * Add sub-skill.
     */
    addSubSkill(name, skill) {
        skill.parent = this;
        this.children.set(name, skill);
        return this;
    }

    /**
     * Remove sub-skill.
     */
    removeSubSkill(name) {
        const skill = this.children.get(name);
        if (skill) {
            skill.parent = null;
            this.children.delete(name);
        }
        return this;
    }

    /**
     * Get skill as symbolic term.
     */
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

    /**
     * Serialize skill.
     */
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

/**
 * Skill Library for storing and retrieving skills.
 */
export class SkillLibrary extends Component {
    constructor(config = {}) {
        super({
            capacity: 100,
            similarityThreshold: 0.8,
            retrievalStrategy: 'relevance',
            ...config
        });
        
        this.skills = new Map();
        this.skillGraph = new Map();
        this.usageStats = new Map();
        this.discoveryLog = [];
    }

    /**
     * Register a skill.
     */
    register(name, skill) {
        if (this.skills.size >= this.capacity) {
            this.pruneLeastUsed();
        }
        
        this.skills.set(name, skill);
        this.usageStats.set(name, { count: 0, success: 0, lastUsed: Date.now() });
        
        // Update skill graph
        this.updateSkillGraph(name, skill);
        
        this.emit('skillRegistered', { name, skill });
        return this;
    }

    /**
     * Get a skill by name.
     */
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

    /**
     * Find skills applicable to current situation.
     */
    retrieve(context, options = {}) {
        const {
            maxResults = 5,
            minSuccessRate = 0,
            abstractionLevel = null
        } = options;
        
        const candidates = [];
        
        for (const [name, skill] of this.skills) {
            // Filter by abstraction level
            if (abstractionLevel !== null && skill.config.abstractionLevel !== abstractionLevel) {
                continue;
            }
            
            // Filter by success rate
            const stats = this.usageStats.get(name);
            if (stats && stats.count > 0) {
                const successRate = stats.success / stats.count;
                if (successRate < minSuccessRate) continue;
            }
            
            // Check applicability
            if (skill.canInitiate(context.observation, context)) {
                candidates.push({
                    name,
                    skill,
                    relevance: this.computeRelevance(skill, context),
                    successRate: stats ? stats.success / stats.count : 0.5
                });
            }
        }
        
        // Sort by relevance and success rate
        candidates.sort((a, b) => {
            const scoreA = a.relevance * 0.6 + a.successRate * 0.4;
            const scoreB = b.relevance * 0.6 + b.successRate * 0.4;
            return scoreB - scoreA;
        });
        
        return candidates.slice(0, maxResults);
    }

    /**
     * Compute relevance of skill to context.
     */
    computeRelevance(skill, context) {
        // Simple relevance based on precondition match
        if (skill.config.precondition) {
            try {
                return skill.config.precondition(context.observation, context) ? 0.8 : 0.2;
            } catch {
                return 0.5;
            }
        }
        return 0.5;
    }

    /**
     * Update skill graph with dependencies.
     */
    updateSkillGraph(name, skill) {
        if (!this.skillGraph.has(name)) {
            this.skillGraph.set(name, new Set());
        }
        
        // Add edges to sub-skills
        for (const [subName] of skill.children) {
            if (!this.skillGraph.has(subName)) {
                this.skillGraph.set(subName, new Set());
            }
            this.skillGraph.get(subName).add(name);
        }
    }

    /**
     * Prune least used skills.
     */
    pruneLeastUsed() {
        const usageList = Array.from(this.usageStats.entries())
            .sort((a, b) => a[1].count - b[1].count);
        
        const toRemove = usageList.slice(0, Math.floor(this.capacity * 0.2));
        
        for (const [name] of toRemove) {
            this.skills.delete(name);
            this.usageStats.delete(name);
            this.emit('skillPruned', { name });
        }
    }

    /**
     * Get skill statistics.
     */
    getStats(name) {
        return this.usageStats.get(name) || null;
    }

    /**
     * Update skill success statistics.
     */
    recordSuccess(name, success) {
        const stats = this.usageStats.get(name);
        if (stats) {
            stats.success += success ? 1 : 0;
        }
    }

    /**
     * List all skills.
     */
    list() {
        return Array.from(this.skills.entries()).map(([name, skill]) => ({
            name,
            abstractionLevel: skill.config.abstractionLevel,
            usageCount: this.usageStats.get(name)?.count || 0,
            successRate: this.getSuccessRate(name)
        }));
    }

    getSuccessRate(name) {
        const stats = this.usageStats.get(name);
        if (!stats || stats.count === 0) return 0.5;
        return stats.success / stats.count;
    }

    /**
     * Get skill graph.
     */
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

/**
 * Skill Discovery Engine for automatic skill learning.
 */
export class SkillDiscoveryEngine extends Component {
    constructor(config = {}) {
        super({
            discoveryMode: 'online', // 'online', 'batch', 'curiosity'
            minUsageCount: 10,
            bottleneckThreshold: 0.3,
            noveltyThreshold: 0.5,
            graphClustering: 'louvain',
            ...config
        });
        
        this.library = config.library || new SkillLibrary();
        this.stateVisits = new Map();
        this.transitionGraph = new Map();
        this.bottlenecks = [];
        this.candidateSkills = [];
    }

    /**
     * Process transition for skill discovery.
     */
    processTransition(transition) {
        const { state, action, nextState, reward, done } = transition;
        
        // Update state visit counts
        const stateKey = this.stateToKey(state);
        const nextStateKey = this.stateToKey(nextState);
        
        this.stateVisits.set(stateKey, (this.stateVisits.get(stateKey) || 0) + 1);
        
        // Update transition graph
        if (!this.transitionGraph.has(stateKey)) {
            this.transitionGraph.set(stateKey, new Map());
        }
        
        const transitions = this.transitionGraph.get(stateKey);
        transitions.set(nextStateKey, (transitions.get(nextStateKey) || 0) + 1);
        
        // Detect bottlenecks
        if (this.isBottleneck(stateKey)) {
            this.bottlenecks.push(stateKey);
            this.emit('bottleneckDetected', { state: stateKey });
        }
        
        // Detect novel states
        if (this.isNovelState(nextStateKey)) {
            this.emit('novelStateDetected', { state: nextStateKey });
        }
        
        // Periodically discover skills
        if (this.shouldDiscoverSkills()) {
            this.discoverSkills();
        }
    }

    /**
     * Convert state to hashable key.
     */
    stateToKey(state) {
        if (Array.isArray(state)) {
            return state.map(x => Math.round(x * 10)).join('_');
        }
        if (state instanceof SymbolicTensor) {
            return state.toNarseseTerm('s');
        }
        return String(state);
    }

    /**
     * Check if state is a bottleneck.
     */
    isBottleneck(stateKey) {
        const visits = this.stateVisits.get(stateKey) || 0;
        const transitions = this.transitionGraph.get(stateKey);
        
        if (!transitions || visits < this.config.minUsageCount) {
            return false;
        }
        
        // Bottleneck: high in-degree, low out-degree
        let inDegree = 0;
        for (const [, trans] of this.transitionGraph) {
            if (trans.has(stateKey)) {
                inDegree += trans.get(stateKey);
            }
        }
        
        const outDegree = Array.from(transitions.values()).reduce((a, b) => a + b, 0);
        
        return inDegree > outDegree * this.config.bottleneckThreshold;
    }

    /**
     * Check if state is novel.
     */
    isNovelState(stateKey) {
        const visits = this.stateVisits.get(stateKey) || 0;
        return visits === 1; // First visit
    }

    /**
     * Check if it's time to discover skills.
     */
    shouldDiscoverSkills() {
        const totalVisits = Array.from(this.stateVisits.values()).reduce((a, b) => a + b, 0);
        return totalVisits % 100 === 0;
    }

    /**
     * Discover skills from experience.
     */
    discoverSkills() {
        switch (this.config.discoveryMode) {
            case 'bottleneck':
                this.discoverBottleneckSkills();
                break;
            case 'curiosity':
                this.discoverNoveltySkills();
                break;
            case 'graph':
                this.discoverGraphSkills();
                break;
            default:
                this.discoverBottleneckSkills();
        }
    }

    /**
     * Discover skills from bottleneck states.
     */
    discoverBottleneckSkills() {
        for (const bottleneck of this.bottlenecks) {
            const skill = this.createBottleneckSkill(bottleneck);
            this.candidateSkills.push(skill);
            
            this.emit('skillDiscovered', {
                skill,
                source: 'bottleneck',
                state: bottleneck
            });
        }
        
        this.discoveryLog.push({
            type: 'bottleneck',
            count: this.bottlenecks.length,
            timestamp: Date.now()
        });
    }

    /**
     * Discover skills from novel states.
     */
    discoverNoveltySkills() {
        // Find states with high prediction error (novelty)
        const novelStates = Array.from(this.stateVisits.entries())
            .filter(([_, count]) => count === 1)
            .map(([state]) => state);
        
        for (const state of novelStates) {
            const skill = this.createNoveltySkill(state);
            this.candidateSkills.push(skill);
        }
    }

    /**
     * Discover skills from graph clustering.
     */
    discoverGraphSkills() {
        // Simple community detection (placeholder for Louvain algorithm)
        const communities = this.detectCommunities();
        
        for (const community of communities) {
            const skill = this.createCommunitySkill(community);
            this.candidateSkills.push(skill);
        }
    }

    /**
     * Detect communities in transition graph.
     */
    detectCommunities() {
        // Simplified community detection
        const communities = [];
        const visited = new Set();
        
        for (const [state] of this.transitionGraph) {
            if (visited.has(state)) continue;
            
            const community = [state];
            visited.add(state);
            
            // BFS to find connected states
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
            
            if (community.length > 1) {
                communities.push(community);
            }
        }
        
        return communities;
    }

    /**
     * Create skill from bottleneck.
     */
    createBottleneckSkill(bottleneck) {
        const name = `bottleneck_${bottleneck.slice(0, 10)}`;
        
        return new Skill(name, {
            abstractionLevel: 1,
            discoverySource: 'bottleneck',
            precondition: (obs) => this.stateToKey(obs) === bottleneck,
            termination: (obs, ctx) => ctx.stepsInSkill > 10,
            policy: this.createDefaultPolicy(bottleneck)
        });
    }

    /**
     * Create skill from novel state.
     */
    createNoveltySkill(state) {
        const name = `novelty_${state.slice(0, 10)}`;
        
        return new Skill(name, {
            abstractionLevel: 1,
            discoverySource: 'novelty',
            precondition: (obs) => this.stateToKey(obs).startsWith(state.split('_').slice(0, 2).join('_')),
            termination: (obs, ctx) => ctx.stepsInSkill > 5
        });
    }

    /**
     * Create skill from community.
     */
    createCommunitySkill(community) {
        const name = `community_${community.length}`;
        const states = new Set(community);
        
        return new Skill(name, {
            abstractionLevel: 1,
            discoverySource: 'graph',
            precondition: (obs) => states.has(this.stateToKey(obs)),
            termination: (obs, ctx) => !states.has(this.stateToKey(obs))
        });
    }

    /**
     * Create default policy for skill.
     */
    createDefaultPolicy(targetState) {
        return async (obs, ctx) => {
            // Random exploration (placeholder for learned policy)
            return Math.floor(Math.random() * (ctx.actionSpace || 2));
        };
    }

    /**
     * Get discovered skills.
     */
    getCandidateSkills() {
        return this.candidateSkills;
    }

    /**
     * Promote candidate skill to library.
     */
    promoteSkill(skillName) {
        const skill = this.candidateSkills.find(s => s.config.name === skillName);
        if (skill) {
            this.library.register(skillName, skill);
            this.candidateSkills = this.candidateSkills.filter(s => s !== skill);
            return true;
        }
        return false;
    }

    serialize() {
        return {
            stateVisits: Array.from(this.stateVisits.entries()).slice(-1000),
            bottlenecks: this.bottlenecks,
            candidateSkills: this.candidateSkills.map(s => s.config.name),
            discoveryLog: this.discoveryLog.slice(-100)
        };
    }
}
