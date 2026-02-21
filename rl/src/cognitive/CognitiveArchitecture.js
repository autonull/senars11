/**
 * Cognitive Architecture Framework
 * Composable cognitive components for emergent general intelligence.
 */
import { compose, pipe, Maybe, Either, Stream, Lazy } from '../functional/FunctionalUtils.js';
import { Component } from '../composable/Component.js';
import { ExperienceStore, ExperienceStream, SkillExtractor, ExperienceLearner } from '../experience/ExperienceSystem.js';
import { StrategyRegistry, StrategyPresets } from '../strategies/StrategyPatterns.js';

/**
 * Cognitive Module Interface
 */
export class CognitiveModule extends Component {
    constructor(config = {}) {
        const name = config.name ?? 'CognitiveModule';
        super({
            name,
            enabled: config.enabled ?? true,
            priority: config.priority ?? 0,
            ...config
        });
        
        this.inputs = new Map();
        this.outputs = new Map();
        this.state = new Map();
    }

    async process(input, context = {}) {
        throw new Error('CognitiveModule must implement process()');
    }

    connectInput(name, source) {
        this.inputs.set(name, source);
        return this;
    }

    connectOutput(name, target) {
        this.outputs.set(name, target);
        return this;
    }

    getState(key) {
        return this.state.get(key);
    }

    setState(key, value) {
        this.state.set(key, value);
        this.emit('stateChange', { key, value });
        return this;
    }

    broadcast(output) {
        for (const target of this.outputs.values()) {
            target.receive(output);
        }
        return this;
    }

    receive(input) {
        // Override to handle incoming data
        return this;
    }
}

/**
 * Perception Module
 */
export class PerceptionModule extends CognitiveModule {
    constructor(config = {}) {
        super({
            ...config,
            featureExtractors: config.featureExtractors ?? [],
            attentionMechanism: config.attentionMechanism ?? null
        });
        
        this.features = new Map();
        this.symbols = new Map();
    }

    async process(observation, context = {}) {
        // Extract features
        const features = await this.extractFeatures(observation);
        
        // Apply attention
        const attended = this.config.attentionMechanism 
            ? await this.config.attentionMechanism.attend(features, observation)
            : features;
        
        // Lift to symbols
        const symbols = await this.liftToSymbols(attended);
        
        this.setState('lastObservation', observation);
        this.setState('lastFeatures', features);
        this.setState('lastSymbols', symbols);
        
        return { features, symbols, attended };
    }

    async extractFeatures(observation) {
        const results = [];
        
        for (const extractor of this.config.featureExtractors) {
            try {
                const features = await extractor(observation);
                results.push(features);
            } catch (e) {
                console.error('Feature extraction error:', e);
            }
        }
        
        return results.length === 1 ? results[0] : results;
    }

    async liftToSymbols(features) {
        // Default: create symbolic annotations for salient features
        const symbols = new Map();
        
        if (Array.isArray(features)) {
            features.forEach((f, i) => {
                if (Math.abs(f) > 0.5) {
                    symbols.set(`f${i}`, { feature: i, value: f, salience: Math.abs(f) });
                }
            });
        }
        
        return symbols;
    }
}

/**
 * Reasoning Module
 */
export class ReasoningModule extends CognitiveModule {
    constructor(config = {}) {
        super({
            ...config,
            reasoningEngine: config.reasoningEngine ?? null,
            inferenceDepth: config.inferenceDepth ?? 3,
            causalReasoning: config.causalReasoning ?? false
        });
        
        this.beliefs = new Map();
        this.inferences = [];
    }

    async process(input, context = {}) {
        const { symbols, features } = input;
        
        // Update beliefs
        this.updateBeliefs(symbols);
        
        // Perform inference
        const inferences = await this.performInference(context);
        
        // Causal reasoning if enabled
        let causalAnalysis = null;
        if (this.config.causalReasoning && this.config.reasoningEngine?.graph) {
            causalAnalysis = this.analyzeCausally(symbols);
        }
        
        this.setState('lastInferences', inferences);
        this.setState('beliefs', new Map(this.beliefs));
        
        return { beliefs: new Map(this.beliefs), inferences, causalAnalysis };
    }

    updateBeliefs(symbols) {
        for (const [key, value] of symbols) {
            const existing = this.beliefs.get(key);
            if (existing) {
                // Belief revision
                existing.confidence = (existing.confidence + value.confidence) / 2;
                existing.timestamp = Date.now();
            } else {
                this.beliefs.set(key, { ...value, timestamp: Date.now() });
            }
        }
        
        // Decay old beliefs
        const now = Date.now();
        for (const [key, belief] of this.beliefs) {
            const age = now - belief.timestamp;
            belief.confidence *= Math.exp(-age / 3600000); // 1 hour decay
            if (belief.confidence < 0.1) {
                this.beliefs.delete(key);
            }
        }
    }

    async performInference(context) {
        const inferences = [];
        
        if (this.config.reasoningEngine) {
            // Use external reasoning engine
            const result = await this.config.reasoningEngine.infer(
                Array.from(this.beliefs.values()),
                { depth: this.config.inferenceDepth, ...context }
            );
            inferences.push(...result);
        }
        
        // Default: simple rule-based inference
        inferences.push(...this.ruleBasedInference());
        
        return inferences;
    }

    ruleBasedInference() {
        const inferences = [];
        
        // Transitive inference
        for (const [key1, belief1] of this.beliefs) {
            for (const [key2, belief2] of this.beliefs) {
                if (key1 !== key2 && this.canCombine(key1, key2)) {
                    inferences.push({
                        type: 'transitive',
                        from: [key1, key2],
                        result: this.combineBeliefs(belief1, belief2)
                    });
                }
            }
        }
        
        return inferences;
    }

    canCombine(key1, key2) {
        // Simple heuristic: can combine if they share structure
        return key1.split('_')[0] === key2.split('_')[0];
    }

    combineBeliefs(b1, b2) {
        return {
            confidence: (b1.confidence + b2.confidence) / 2,
            value: b1.value + b2.value,
            timestamp: Date.now()
        };
    }

    analyzeCausally(symbols) {
        const graph = this.config.reasoningEngine?.graph;
        if (!graph) return null;
        
        const analysis = {};
        for (const [key, symbol] of symbols) {
            const effect = graph.computeCausalEffect?.(key, symbol.value);
            if (effect) {
                analysis[key] = effect;
            }
        }
        
        return analysis;
    }
}

/**
 * Planning Module
 */
export class PlanningModule extends CognitiveModule {
    constructor(config = {}) {
        super({
            ...config,
            planningStrategy: config.planningStrategy ?? null,
            worldModel: config.worldModel ?? null,
            horizon: config.horizon ?? 10
        });
        
        this.currentPlan = null;
        this.planHistory = [];
    }

    async process(input, context = {}) {
        const { goal, state } = context;
        
        if (!goal) {
            return { plan: null, reason: 'No goal specified' };
        }
        
        // Generate plan
        const plan = await this.generatePlan(state, goal);
        
        if (plan) {
            this.currentPlan = plan;
            this.planHistory.push({ plan, timestamp: Date.now() });
            
            // Keep history bounded
            if (this.planHistory.length > 100) {
                this.planHistory.shift();
            }
        }
        
        return { plan, goal };
    }

    async generatePlan(state, goal) {
        // Use planning strategy if available
        if (this.config.planningStrategy && this.config.worldModel) {
            return this.config.planningStrategy.plan(
                state,
                this.config.worldModel,
                this.config.horizon
            );
        }
        
        // Default: greedy planning
        return this.greedyPlan(state, goal);
    }

    async greedyPlan(state, goal) {
        // Simple goal-directed planning
        const plan = [];
        let currentState = state;
        
        for (let i = 0; i < this.config.horizon; i++) {
            const action = await this.selectBestAction(currentState, goal);
            plan.push(action);
            
            // Simulate next state (placeholder)
            currentState = this.simulateStep(currentState, action);
            
            if (this.isGoalAchieved(currentState, goal)) {
                break;
            }
        }
        
        return plan.length > 0 ? plan : null;
    }

    async selectBestAction(state, goal) {
        // Placeholder: random action
        return Math.floor(Math.random() * 4);
    }

    simulateStep(state, action) {
        // Placeholder: return state unchanged
        return state;
    }

    isGoalAchieved(state, goal) {
        // Placeholder: never achieved
        return false;
    }

    getCurrentPlan() {
        return this.currentPlan;
    }

    replan() {
        this.currentPlan = null;
        return this;
    }
}

/**
 * Action Module
 */
export class ActionModule extends CognitiveModule {
    constructor(config = {}) {
        super({
            ...config,
            explorationStrategy: config.explorationStrategy ?? null,
            actionSpace: config.actionSpace ?? null
        });
        
        this.actionHistory = [];
        this.lastAction = null;
    }

    async process(input, context = {}) {
        const { plan, policy, state } = context;
        
        let action;
        
        // Select from plan if available
        if (plan && plan.length > 0) {
            action = plan.shift();
        }
        // Use policy
        else if (policy) {
            action = await this.selectFromPolicy(policy, state);
        }
        // Default: explore
        else {
            action = await this.explore(state);
        }
        
        this.lastAction = action;
        this.actionHistory.push({ action, timestamp: Date.now() });
        
        // Keep history bounded
        if (this.actionHistory.length > 1000) {
            this.actionHistory.shift();
        }
        
        return { action, source: plan ? 'plan' : policy ? 'policy' : 'explore' };
    }

    async selectFromPolicy(policy, state) {
        if (typeof policy.act === 'function') {
            return policy.act(state);
        }
        return policy(state);
    }

    async explore(state) {
        if (this.config.explorationStrategy) {
            // Use exploration strategy
            const actionValues = await this.getActionValues(state);
            return this.config.explorationStrategy.select(actionValues, state);
        }
        
        // Default: random
        return this.randomAction();
    }

    async getActionValues(state) {
        // Placeholder: return uniform values
        const n = this.config.actionSpace?.n ?? 4;
        return Array(n).fill(0);
    }

    randomAction() {
        const n = this.config.actionSpace?.n ?? 4;
        return Math.floor(Math.random() * n);
    }

    getLastAction() {
        return this.lastAction;
    }
}

/**
 * Memory Module
 */
export class MemoryModule extends CognitiveModule {
    constructor(config = {}) {
        super({
            ...config,
            experienceStore: config.experienceStore ?? new ExperienceStore(),
            retrievalStrategy: config.retrievalStrategy ?? null
        });
        
        this.workingMemory = new Map();
        this.retrievalHistory = [];
    }

    async process(input, context = {}) {
        const { query, store = true } = context;
        
        // Store experience
        if (store && input.experience) {
            this.storeExperience(input.experience);
        }
        
        // Retrieve from memory
        let retrieved = null;
        if (query) {
            retrieved = await this.retrieve(query);
        }
        
        return { retrieved, workingMemory: new Map(this.workingMemory) };
    }

    storeExperience(experience) {
        const { state, action, reward, nextState, done } = experience;
        this.config.experienceStore.record(state, action, reward, nextState, done, {
            tags: this.extractTags(experience)
        });
    }

    extractTags(experience) {
        const tags = [];
        if (experience.reward > 0) tags.push('positive');
        if (experience.reward < 0) tags.push('negative');
        if (experience.done) tags.push('terminal');
        return tags;
    }

    async retrieve(query) {
        const options = typeof query === 'string' 
            ? { tags: [query] }
            : query;
        
        const results = this.config.experienceStore.query(options).take(10).collect();
        
        this.retrievalHistory.push({ query, results, timestamp: Date.now() });
        
        // Update working memory
        for (const result of results) {
            this.workingMemory.set(result.id, result);
        }
        
        // Keep working memory bounded
        if (this.workingMemory.size > 50) {
            const firstKey = this.workingMemory.keys().next().value;
            this.workingMemory.delete(firstKey);
        }
        
        return results;
    }

    getExperienceStore() {
        return this.config.experienceStore;
    }

    getStats() {
        return {
            workingMemorySize: this.workingMemory.size,
            retrievalCount: this.retrievalHistory.length,
            storeStats: this.config.experienceStore.getStats()
        };
    }
}

/**
 * Skill Module
 */
export class SkillModule extends CognitiveModule {
    constructor(config = {}) {
        super({
            name: 'SkillModule',
            ...config
        });
        
        this.config.skillExtractor = config.skillExtractor ?? new SkillExtractor();
        this.config.skillLibrary = config.skillLibrary ?? new Map();
        
        this.activeSkill = null;
        this.skillUsage = new Map();
    }

    async process(input, context = {}) {
        const { state, extractSkills = false } = context;
        
        // Extract skills from experience if requested
        if (extractSkills && context.episodes) {
            await this.extractSkills(context.episodes);
        }
        
        // Select skill for current state
        const selectedSkill = this.selectSkill(state);

        if (selectedSkill) {
            this.activeSkill = selectedSkill;
            const usage = this.skillUsage.get(selectedSkill.name) ?? 0;
            this.skillUsage.set(selectedSkill.name, usage + 1);
        }

        const skillLibrary = this.config.skillLibrary ?? new Map();
        return {
            activeSkill: this.activeSkill,
            availableSkills: Array.from(skillLibrary.keys())
        };
    }

    async extractSkills(episodes) {
        const skills = this.config.skillExtractor.extractSkills(episodes);
        const skillLibrary = this.config.skillLibrary ?? new Map();

        for (const skill of skills) {
            skillLibrary.set(skill.name, skill);
            this.emit('skillDiscovered', skill);
        }

        return skills;
    }

    selectSkill(state) {
        // Find applicable skills
        const applicable = [];
        const skillLibrary = this.config.skillLibrary ?? new Map();

        for (const skill of skillLibrary.values()) {
            if (skill.precondition?.(state)) {
                applicable.push(skill);
            }
        }

        if (applicable.length === 0) return null;

        // Select most used skill
        applicable.sort((a, b) =>
            (this.skillUsage.get(b.name) ?? 0) - (this.skillUsage.get(a.name) ?? 0)
        );

        return applicable[0];
    }

    getSkill(name) {
        return (this.config.skillLibrary ?? new Map()).get(name);
    }

    getSkillStats() {
        const skillLibrary = this.config.skillLibrary ?? new Map();
        return {
            totalSkills: skillLibrary.size,
            usage: Object.fromEntries(this.skillUsage)
        };
    }
}

/**
 * Meta-Cognitive Module
 */
export class MetaCognitiveModule extends CognitiveModule {
    constructor(config = {}) {
        super({
            ...config,
            selfModel: config.selfModel ?? null,
            reflectionInterval: config.reflectionInterval ?? 100
        });
        
        this.reflections = [];
        this.selfKnowledge = new Map();
        this.stepCount = 0;
    }

    async process(input, context = {}) {
        this.stepCount++;
        
        // Periodic reflection
        if (this.stepCount % this.config.reflectionInterval === 0) {
            await this.reflect(input, context);
        }
        
        // Self-monitoring
        const selfState = this.monitorSelf();
        
        return { selfState, reflections: this.reflections.slice(-10) };
    }

    async reflect(input, context) {
        const reflection = {
            timestamp: Date.now(),
            step: this.stepCount,
            input: this.summarize(input),
            context: this.summarize(context),
            insights: await this.generateInsights(input, context)
        };
        
        this.reflections.push(reflection);
        
        // Update self-knowledge
        this.updateSelfKnowledge(reflection);
        
        this.emit('reflection', reflection);
        
        return reflection;
    }

    summarize(obj) {
        if (typeof obj !== 'object' || obj === null) return String(obj);
        return JSON.stringify(obj).slice(0, 100);
    }

    async generateInsights(input, context) {
        const insights = [];
        
        // Pattern detection
        if (context.performance?.trend === 'declining') {
            insights.push({
                type: 'warning',
                message: 'Performance declining, consider strategy change',
                confidence: 0.7
            });
        }
        
        // Success analysis
        if (context.lastResult?.success) {
            insights.push({
                type: 'success',
                message: 'Successful episode, analyze contributing factors',
                confidence: 0.8
            });
        }
        
        return insights;
    }

    updateSelfKnowledge(reflection) {
        for (const insight of reflection.insights) {
            const key = insight.type;
            const existing = this.selfKnowledge.get(key);
            
            if (existing) {
                existing.count++;
                existing.lastSeen = reflection.timestamp;
            } else {
                this.selfKnowledge.set(key, {
                    ...insight,
                    count: 1,
                    firstSeen: reflection.timestamp,
                    lastSeen: reflection.timestamp
                });
            }
        }
    }

    monitorSelf() {
        return {
            stepCount: this.stepCount,
            reflectionCount: this.reflections.length,
            selfKnowledgeSize: this.selfKnowledge.size,
            recentInsights: this.reflections.slice(-5).flatMap(r => r.insights)
        };
    }

    getSelfKnowledge() {
        return Object.fromEntries(this.selfKnowledge);
    }
}

/**
 * Cognitive Architecture
 * Composes all cognitive modules into unified architecture
 */
export class CognitiveArchitecture extends Component {
    constructor(config = {}) {
        super({
            name: config.name ?? 'CognitiveArchitecture',
            modules: config.modules ?? [],
            integrationStrategy: config.integrationStrategy ?? 'sequential',
            ...config
        });
        
        this.modules = new Map();
        this.connections = [];
        this.globalState = new Map();
        
        // Initialize default modules
        this.addModule('perception', new PerceptionModule());
        this.addModule('reasoning', new ReasoningModule());
        this.addModule('planning', new PlanningModule());
        this.addModule('action', new ActionModule());
        this.addModule('memory', new MemoryModule());
        this.addModule('skills', new SkillModule());
        this.addModule('meta', new MetaCognitiveModule());
    }

    addModule(name, module) {
        this.modules.set(name, module);
        module.parent = this;
        this.emit('moduleAdded', { name, module });
        return this;
    }

    getModule(name) {
        return this.modules.get(name);
    }

    connect(from, to, transform = null) {
        this.connections.push({ from, to, transform });
        
        const fromModule = this.modules.get(from);
        const toModule = this.modules.get(to);
        
        if (fromModule && toModule) {
            fromModule.connectOutput(to, toModule);
            toModule.connectInput(from, fromModule);
        }
        
        return this;
    }

    async process(input, context = {}) {
        const results = {};
        let current = input;
        
        switch (this.config.integrationStrategy) {
            case 'sequential':
                current = await this.processSequential(current, context, results);
                break;
            case 'parallel':
                current = await this.processParallel(current, context, results);
                break;
            case 'hierarchical':
                current = await this.processHierarchical(current, context, results);
                break;
            default:
                current = await this.processSequential(current, context, results);
        }
        
        // Meta-cognitive processing
        const metaModule = this.modules.get('meta');
        if (metaModule) {
            const metaResult = await metaModule.process({ ...results, input }, context);
            results.meta = metaResult;
        }
        
        this.globalState.set('lastInput', input);
        this.globalState.set('lastResults', results);
        this.globalState.set('lastContext', context);
        
        return { output: current, results, state: Object.fromEntries(this.globalState) };
    }

    async processSequential(input, context, results) {
        const order = ['perception', 'reasoning', 'planning', 'memory', 'skills', 'action'];
        let current = input;
        
        for (const name of order) {
            const module = this.modules.get(name);
            if (!module || !module.config.enabled) continue;
            
            const result = await module.process(current, {
                ...context,
                ...results
            });
            
            results[name] = result;
            current = { ...current, ...result };
        }
        
        return current;
    }

    async processParallel(input, context, results) {
        const moduleNames = Array.from(this.modules.keys());
        
        const moduleResults = await Promise.all(
            moduleNames.map(async (name) => {
                const module = this.modules.get(name);
                if (!module || !module.config.enabled) return [name, null];
                
                const result = await module.process(input, context);
                return [name, result];
            })
        );
        
        for (const [name, result] of moduleResults) {
            if (result) {
                results[name] = result;
            }
        }
        
        return { ...input, ...results };
    }

    async processHierarchical(input, context, results) {
        // High-level: perception -> reasoning -> planning
        const highLevel = ['perception', 'reasoning', 'planning'];
        let current = input;
        
        for (const name of highLevel) {
            const module = this.modules.get(name);
            if (!module || !module.config.enabled) continue;
            
            const result = await module.process(current, context);
            results[name] = result;
            current = { ...current, ...result };
        }
        
        // Low-level: memory -> skills -> action (conditioned on high-level)
        const lowLevel = ['memory', 'skills', 'action'];
        for (const name of lowLevel) {
            const module = this.modules.get(name);
            if (!module || !module.config.enabled) continue;
            
            const result = await module.process(current, {
                ...context,
                highLevel: results
            });
            
            results[name] = result;
            current = { ...current, ...result };
        }
        
        return current;
    }

    async act(observation, goal = null) {
        const result = await this.process(observation, { goal });
        
        // Extract action from results
        const actionResult = result.results.action;
        return actionResult?.action ?? 0;
    }

    async learn(transition, reward) {
        const memoryModule = this.modules.get('memory');
        if (memoryModule) {
            memoryModule.process({ experience: { ...transition, reward } }, { store: true });
        }
        
        // Trigger skill extraction periodically
        const skillModule = this.modules.get('skills');
        if (skillModule && Math.random() < 0.01) {
            const episodes = memoryModule?.getExperienceStore().getRecentEpisodes(10);
            if (episodes) {
                skillModule.process({}, { episodes, extractSkills: true });
            }
        }
    }

    getState() {
        return Object.fromEntries(this.globalState);
    }

    getModuleStates() {
        const states = {};
        for (const [name, module] of this.modules) {
            states[name] = {
                enabled: module.config.enabled,
                stateCount: module.state.size
            };
        }
        return states;
    }

    async shutdown() {
        for (const module of this.modules.values()) {
            await module.shutdown();
        }
        await super.shutdown();
    }
}

/**
 * Architecture Presets (factory functions)
 */
export const ArchitecturePresets = {
    minimal: () => new CognitiveArchitecture({
        name: 'MinimalCognition',
        integrationStrategy: 'sequential'
    }),

    standard: () => new CognitiveArchitecture({
        name: 'StandardCognition',
        integrationStrategy: 'sequential'
    }),

    reflective: () => new CognitiveArchitecture({
        name: 'ReflectiveCognition',
        integrationStrategy: 'hierarchical',
        modules: {
            meta: new MetaCognitiveModule({ reflectionInterval: 50 })
        }
    }),

    skillBased: () => new CognitiveArchitecture({
        name: 'SkillBasedCognition',
        integrationStrategy: 'hierarchical',
        modules: {
            skills: new SkillModule({
                skillExtractor: new SkillExtractor({ minSupport: 2 })
            })
        }
    })
};
