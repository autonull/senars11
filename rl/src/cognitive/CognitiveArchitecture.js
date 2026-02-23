import { Component } from '../composable/Component.js';
import { ExperienceStore, SkillExtractor } from '../experience/ExperienceSystem.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

const MODULE_DEFAULTS = {
    name: 'CognitiveModule',
    enabled: true,
    priority: 0
};

const PERCEPTION_DEFAULTS = {
    featureExtractors: [],
    attentionMechanism: null
};

const REASONING_DEFAULTS = {
    reasoningEngine: null,
    inferenceDepth: 3,
    causalReasoning: false
};

const PLANNING_DEFAULTS = {
    planningStrategy: null,
    worldModel: null,
    horizon: 10,
    planHistoryLimit: 100
};

const ACTION_DEFAULTS = {
    explorationStrategy: null,
    actionSpace: null,
    actionHistoryLimit: 1000
};

const MEMORY_DEFAULTS = {
    experienceStore: null,
    retrievalStrategy: null,
    workingMemoryLimit: 50
};

const SKILL_DEFAULTS = {
    skillExtractor: null,
    skillLibrary: null
};

const METACOGNITIVE_DEFAULTS = {
    selfModel: null,
    reflectionInterval: 100,
    reflectionsLimit: 10,
    recentInsightsLimit: 5
};

const ARCHITECTURE_DEFAULTS = {
    name: 'CognitiveArchitecture',
    modules: [],
    integrationStrategy: 'sequential'
};

const PROCESSING_ORDER = ['perception', 'reasoning', 'planning', 'memory', 'skills', 'action'];
const HIGH_LEVEL_MODULES = ['perception', 'reasoning', 'planning'];
const LOW_LEVEL_MODULES = ['memory', 'skills', 'action'];

export class CognitiveModule extends Component {
    constructor(config = {}) {
        super(mergeConfig(MODULE_DEFAULTS, config));
        this.inputs = new Map();
        this.outputs = new Map();
        this.state = new Map();
    }

    async process(input, context = {}) {
        throw new Error('CognitiveModule must implement process()');
    }

    connectInput(name, source) { this.inputs.set(name, source); return this; }
    connectOutput(name, target) { this.outputs.set(name, target); return this; }
    getState(key) { return this.state.get(key); }

    setState(key, value) {
        this.state.set(key, value);
        this.emit('stateChange', { key, value });
        return this;
    }

    broadcast(output) {
        this.outputs.forEach(target => target.receive(output));
        return this;
    }

    receive(input) { return this; }
}

export class PerceptionModule extends CognitiveModule {
    constructor(config = {}) {
        super(mergeConfig(PERCEPTION_DEFAULTS, config));
        this.features = new Map();
        this.symbols = new Map();
    }

    async process(observation, context = {}) {
        const features = await this.extractFeatures(observation);
        const attended = this.config.attentionMechanism
            ? await this.config.attentionMechanism.attend(features, observation)
            : features;
        const symbols = await this.liftToSymbols(attended);

        this.setState('lastObservation', observation);
        this.setState('lastFeatures', features);
        this.setState('lastSymbols', symbols);

        return { features, symbols, attended };
    }

    async extractFeatures(observation) {
        const results = await Promise.all(
            this.config.featureExtractors.map(async extractor => {
                try { return await extractor(observation); }
                catch { return null; }
            })
        );
        const filtered = results.filter(r => r !== null);
        return filtered.length === 1 ? filtered[0] : filtered;
    }

    async liftToSymbols(features) {
        if (!Array.isArray(features)) return new Map();
        const symbols = new Map();
        features.forEach((f, i) => {
            if (Math.abs(f) > 0.5) {
                symbols.set(`f${i}`, { feature: i, value: f, salience: Math.abs(f) });
            }
        });
        return symbols;
    }
}

export class ReasoningModule extends CognitiveModule {
    constructor(config = {}) {
        super(mergeConfig(REASONING_DEFAULTS, config));
        this.beliefs = new Map();
        this.inferences = [];
    }

    async process(input, context = {}) {
        const { symbols } = input;
        this.updateBeliefs(symbols);
        const inferences = await this.performInference(context);

        const causalAnalysis = this.config.causalReasoning && this.config.reasoningEngine?.graph
            ? this.analyzeCausally(symbols)
            : null;

        this.setState('lastInferences', inferences);
        this.setState('beliefs', new Map(this.beliefs));

        return { beliefs: new Map(this.beliefs), inferences, causalAnalysis };
    }

    updateBeliefs(symbols) {
        const now = Date.now();
        symbols.forEach((value, key) => {
            const existing = this.beliefs.get(key);
            if (existing) {
                existing.confidence = (existing.confidence + value.confidence) / 2;
                existing.timestamp = now;
            } else {
                this.beliefs.set(key, { ...value, timestamp: now });
            }
        });

        this.beliefs.forEach((belief, key) => {
            const age = now - belief.timestamp;
            belief.confidence *= Math.exp(-age / 3600000);
            if (belief.confidence < 0.1) this.beliefs.delete(key);
        });
    }

    async performInference(context) {
        const inferences = [];

        if (this.config.reasoningEngine) {
            const result = await this.config.reasoningEngine.infer(
                Array.from(this.beliefs.values()),
                { depth: this.config.inferenceDepth, ...context }
            );
            inferences.push(...result);
        }

        inferences.push(...this.ruleBasedInference());
        return inferences;
    }

    ruleBasedInference() {
        const inferences = [];
        const beliefs = Array.from(this.beliefs.entries());

        for (let i = 0; i < beliefs.length; i++) {
            for (let j = i + 1; j < beliefs.length; j++) {
                const [key1, belief1] = beliefs[i];
                const [key2, belief2] = beliefs[j];
                if (this.canCombine(key1, key2)) {
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
        return key1.split('_')[0] === key2.split('_')[0];
    }

    combineBeliefs(b1, b2) {
        return { confidence: (b1.confidence + b2.confidence) / 2, value: b1.value + b2.value, timestamp: Date.now() };
    }

    analyzeCausally(symbols) {
        const graph = this.config.reasoningEngine?.graph;
        if (!graph) return null;

        const analysis = {};
        symbols.forEach((symbol, key) => {
            const effect = graph.computeCausalEffect?.(key, symbol.value);
            if (effect) analysis[key] = effect;
        });
        return analysis;
    }
}

export class PlanningModule extends CognitiveModule {
    constructor(config = {}) {
        super(mergeConfig(PLANNING_DEFAULTS, config));
        this.currentPlan = null;
        this.planHistory = [];
    }

    async process(input, context = {}) {
        const { goal, state } = context;
        if (!goal) return { plan: null, reason: 'No goal specified' };

        const plan = await this.generatePlan(state, goal);
        if (plan) {
            this.currentPlan = plan;
            this.planHistory.push({ plan, timestamp: Date.now() });
            if (this.planHistory.length > this.config.planHistoryLimit) this.planHistory.shift();
        }
        return { plan, goal };
    }

    async generatePlan(state, goal) {
        if (this.config.planningStrategy && this.config.worldModel) {
            return this.config.planningStrategy.plan(state, this.config.worldModel, this.config.horizon);
        }
        return this.greedyPlan(state, goal);
    }

    async greedyPlan(state, goal) {
        const plan = [];
        let currentState = state;

        for (let i = 0; i < this.config.horizon; i++) {
            const action = await this.selectBestAction(currentState, goal);
            plan.push(action);
            currentState = this.simulateStep(currentState, action);
            if (this.isGoalAchieved(currentState, goal)) break;
        }

        return plan.length > 0 ? plan : null;
    }

    async selectBestAction(state, goal) { return Math.floor(Math.random() * 4); }
    simulateStep(state, action) { return state; }
    isGoalAchieved(state, goal) { return false; }
    getCurrentPlan() { return this.currentPlan; }
    replan() { this.currentPlan = null; return this; }
}

export class ActionModule extends CognitiveModule {
    constructor(config = {}) {
        super(mergeConfig(ACTION_DEFAULTS, config));
        this.actionHistory = [];
        this.lastAction = null;
    }

    async process(input, context = {}) {
        const { plan, policy, state } = context;
        let action, source;

        if (plan?.length > 0) {
            action = plan.shift();
            source = 'plan';
        } else if (policy) {
            action = await this.selectFromPolicy(policy, state);
            source = 'policy';
        } else {
            action = await this.explore(state);
            source = 'explore';
        }

        this.lastAction = action;
        this.actionHistory.push({ action, timestamp: Date.now() });
        if (this.actionHistory.length > this.config.actionHistoryLimit) this.actionHistory.shift();

        return { action, source };
    }

    async selectFromPolicy(policy, state) {
        return typeof policy.act === 'function' ? policy.act(state) : policy(state);
    }

    async explore(state) {
        if (this.config.explorationStrategy) {
            const actionValues = await this.getActionValues(state);
            return this.config.explorationStrategy.select(actionValues, state);
        }
        return this.randomAction();
    }

    async getActionValues(state) {
        const n = this.config.actionSpace?.n ?? 4;
        return Array(n).fill(0);
    }

    randomAction() {
        const n = this.config.actionSpace?.n ?? 4;
        return Math.floor(Math.random() * n);
    }

    getLastAction() { return this.lastAction; }
}

export class MemoryModule extends CognitiveModule {
    constructor(config = {}) {
        super(mergeConfig(MEMORY_DEFAULTS, {
            ...config,
            experienceStore: config.experienceStore ?? new ExperienceStore()
        }));
        this.workingMemory = new Map();
        this.retrievalHistory = [];
    }

    async process(input, context = {}) {
        const { query, store = true } = context;

        if (store && input.experience) this.storeExperience(input.experience);

        const retrieved = query ? await this.retrieve(query) : null;
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
        const options = typeof query === 'string' ? { tags: [query] } : query;
        const results = this.config.experienceStore.query(options).take(10).collect();

        this.retrievalHistory.push({ query, results, timestamp: Date.now() });
        results.forEach(result => this.workingMemory.set(result.id, result));

        if (this.workingMemory.size > this.config.workingMemoryLimit) {
            const firstKey = this.workingMemory.keys().next().value;
            this.workingMemory.delete(firstKey);
        }

        return results;
    }

    getExperienceStore() { return this.config.experienceStore; }

    getStats() {
        return {
            workingMemorySize: this.workingMemory.size,
            retrievalCount: this.retrievalHistory.length,
            storeStats: this.config.experienceStore.getStats()
        };
    }
}

export class SkillModule extends CognitiveModule {
    constructor(config = {}) {
        super(mergeConfig(SKILL_DEFAULTS, { name: 'SkillModule', ...config }));
        this.config.skillExtractor = this.config.skillExtractor ?? new SkillExtractor();
        this.config.skillLibrary = this.config.skillLibrary ?? new Map();
        this.activeSkill = null;
        this.skillUsage = new Map();
    }

    async process(input, context = {}) {
        const { state, extractSkills = false } = context;

        if (extractSkills && context.episodes) await this.extractSkills(context.episodes);

        const selectedSkill = this.selectSkill(state);
        if (selectedSkill) {
            this.activeSkill = selectedSkill;
            const usage = this.skillUsage.get(selectedSkill.name) ?? 0;
            this.skillUsage.set(selectedSkill.name, usage + 1);
        }

        return {
            activeSkill: this.activeSkill,
            availableSkills: Array.from(this.config.skillLibrary.keys())
        };
    }

    async extractSkills(episodes) {
        const skills = this.config.skillExtractor.extractSkills(episodes);
        skills.forEach(skill => {
            this.config.skillLibrary.set(skill.name, skill);
            this.emit('skillDiscovered', skill);
        });
        return skills;
    }

    selectSkill(state) {
        const applicable = Array.from(this.config.skillLibrary.values())
            .filter(skill => skill.precondition?.(state));

        if (applicable.length === 0) return null;

        applicable.sort((a, b) =>
            (this.skillUsage.get(b.name) ?? 0) - (this.skillUsage.get(a.name) ?? 0)
        );
        return applicable[0];
    }

    getSkill(name) { return this.config.skillLibrary.get(name); }

    getSkillStats() {
        return {
            totalSkills: this.config.skillLibrary.size,
            usage: Object.fromEntries(this.skillUsage)
        };
    }
}

export class MetaCognitiveModule extends CognitiveModule {
    constructor(config = {}) {
        super(mergeConfig(METACOGNITIVE_DEFAULTS, config));
        this.reflections = [];
        this.selfKnowledge = new Map();
        this.stepCount = 0;
    }

    async process(input, context = {}) {
        this.stepCount++;

        if (this.stepCount % this.config.reflectionInterval === 0) {
            await this.reflect(input, context);
        }

        return {
            selfState: this.monitorSelf(),
            reflections: this.reflections.slice(-this.config.reflectionsLimit)
        };
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

        if (context.performance?.trend === 'declining') {
            insights.push({
                type: 'warning',
                message: 'Performance declining, consider strategy change',
                confidence: 0.7
            });
        }

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
        reflection.insights.forEach(insight => {
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
        });
    }

    monitorSelf() {
        return {
            stepCount: this.stepCount,
            reflectionCount: this.reflections.length,
            selfKnowledgeSize: this.selfKnowledge.size,
            recentInsights: this.reflections.slice(-this.config.recentInsightsLimit).flatMap(r => r.insights)
        };
    }

    getSelfKnowledge() { return Object.fromEntries(this.selfKnowledge); }
}

export class CognitiveArchitecture extends Component {
    constructor(config = {}) {
        super(mergeConfig(ARCHITECTURE_DEFAULTS, config));

        this.modules = new Map();
        this.connections = [];
        this.globalState = new Map();

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

    getModule(name) { return this.modules.get(name); }

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

        const strategies = {
            sequential: () => this.processSequential(current, context, results),
            parallel: () => this.processParallel(current, context, results),
            hierarchical: () => this.processHierarchical(current, context, results)
        };

        current = await (strategies[this.config.integrationStrategy] ?? strategies.sequential)();

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
        let current = input;

        for (const name of PROCESSING_ORDER) {
            const module = this.modules.get(name);
            if (!module || !module.config.enabled) continue;

            const result = await module.process(current, { ...context, ...results });
            results[name] = result;
            current = { ...current, ...result };
        }

        return current;
    }

    async processParallel(input, context, results) {
        const moduleResults = await Promise.all(
            Array.from(this.modules.keys()).map(async name => {
                const module = this.modules.get(name);
                if (!module || !module.config.enabled) return [name, null];
                const result = await module.process(input, context);
                return [name, result];
            })
        );

        moduleResults.forEach(([name, result]) => {
            if (result) results[name] = result;
        });

        return { ...input, ...results };
    }

    async processHierarchical(input, context, results) {
        let current = input;

        for (const name of HIGH_LEVEL_MODULES) {
            const module = this.modules.get(name);
            if (!module || !module.config.enabled) continue;
            const result = await module.process(current, context);
            results[name] = result;
            current = { ...current, ...result };
        }

        for (const name of LOW_LEVEL_MODULES) {
            const module = this.modules.get(name);
            if (!module || !module.config.enabled) continue;
            const result = await module.process(current, { ...context, highLevel: results });
            results[name] = result;
            current = { ...current, ...result };
        }

        return current;
    }

    async act(observation, goal = null) {
        const result = await this.process(observation, { goal });
        return result.results.action?.action ?? 0;
    }

    async learn(transition, reward) {
        const memoryModule = this.modules.get('memory');
        if (memoryModule) {
            memoryModule.process({ experience: { ...transition, reward } }, { store: true });
        }

        const skillModule = this.modules.get('skills');
        if (skillModule && Math.random() < 0.01) {
            const episodes = memoryModule?.getExperienceStore()?.getRecentEpisodes(10);
            if (episodes) skillModule.process({}, { episodes, extractSkills: true });
        }
    }

    getState() { return Object.fromEntries(this.globalState); }

    getModuleStates() {
        const states = {};
        this.modules.forEach((module, name) => {
            states[name] = { enabled: module.config.enabled, stateCount: module.state.size };
        });
        return states;
    }

    async shutdown() {
        await Promise.all(Array.from(this.modules.values()).map(m => m.shutdown()));
        await super.shutdown();
    }
}

export const ArchitecturePresets = {
    minimal: () => new CognitiveArchitecture({ name: 'MinimalCognition', integrationStrategy: 'sequential' }),
    standard: () => new CognitiveArchitecture({ name: 'StandardCognition', integrationStrategy: 'sequential' }),
    reflective: () => new CognitiveArchitecture({
        name: 'ReflectiveCognition',
        integrationStrategy: 'hierarchical',
        modules: { meta: new MetaCognitiveModule({ reflectionInterval: 50 }) }
    }),
    skillBased: () => new CognitiveArchitecture({
        name: 'SkillBasedCognition',
        integrationStrategy: 'hierarchical',
        modules: { skills: new SkillModule({ skillExtractor: new SkillExtractor({ minSupport: 2 }) }) }
    })
};
