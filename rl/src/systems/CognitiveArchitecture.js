/**
 * RLCognitiveArchitecture - RL-focused cognitive architecture
 * Distinct from agent/src/cognitive/CognitiveArchitecture.js (LLM/MeTTa-focused LIDA model)
 */
import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { ExperienceStore, SkillExtractor } from '../experience/ExperienceSystem.js';
import { PerceptionModule } from './modules/PerceptionModule.js';
import { ReasoningModule } from './modules/ReasoningModule.js';
import { PlanningModule } from './modules/PlanningModule.js';
import { ActionModule } from './modules/ActionModule.js';
import { MemoryModule } from './modules/MemoryModule.js';
import { SkillModule } from './modules/SkillModule.js';
import { MetaCognitiveModule } from './modules/MetaCognitiveModule.js';

const ARCHITECTURE_DEFAULTS = { name: 'CognitiveArchitecture', modules: [], integrationStrategy: 'sequential' };
const PROCESSING_ORDER = ['perception', 'reasoning', 'planning', 'memory', 'skills', 'action'];
const HIGH_LEVEL_MODULES = ['perception', 'reasoning', 'planning'];
const LOW_LEVEL_MODULES = ['memory', 'skills', 'action'];

export { RLCognitiveArchitecture as CognitiveArchitecture };

export class RLCognitiveArchitecture extends Component {
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

    addModule(name, module) { this.modules.set(name, module); module.parent = this; this.emit('moduleAdded', { name, module }); return this; }
    getModule(name) { return this.modules.get(name); }

    connect(from, to, transform = null) {
        this.connections.push({ from, to, transform });
        const fromModule = this.modules.get(from);
        const toModule = this.modules.get(to);
        if (fromModule && toModule) { fromModule.connectOutput(to, toModule); toModule.connectInput(from, fromModule); }
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
            if (!module || !module.config.enabled) {continue;}
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
                if (!module || !module.config.enabled) {return [name, null];}
                const result = await module.process(input, context);
                return [name, result];
            })
        );
        moduleResults.forEach(([name, result]) => { if (result) {results[name] = result;} });
        return { ...input, ...results };
    }

    async processHierarchical(input, context, results) {
        let current = input;
        for (const name of HIGH_LEVEL_MODULES) {
            const module = this.modules.get(name);
            if (!module || !module.config.enabled) {continue;}
            const result = await module.process(current, context);
            results[name] = result;
            current = { ...current, ...result };
        }
        for (const name of LOW_LEVEL_MODULES) {
            const module = this.modules.get(name);
            if (!module || !module.config.enabled) {continue;}
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
        if (memoryModule) {memoryModule.process({ experience: { ...transition, reward } }, { store: true });}
        const skillModule = this.modules.get('skills');
        if (skillModule && Math.random() < 0.01) {
            const episodes = memoryModule?.getExperienceStore()?.getRecentEpisodes(10);
            if (episodes) {skillModule.process({}, { episodes, extractSkills: true });}
        }
    }

    getState() { return Object.fromEntries(this.globalState); }
    getModuleStates() {
        const states = {};
        this.modules.forEach((module, name) => { states[name] = { enabled: module.config.enabled, stateCount: module.state.size }; });
        return states;
    }
    async shutdown() {
        await Promise.all(Array.from(this.modules.values()).map(m => m.shutdown()));
        await super.shutdown();
    }
}

export { CognitiveModule } from './modules/CognitiveModule.js';
export { PerceptionModule } from './modules/PerceptionModule.js';
export { ReasoningModule } from './modules/ReasoningModule.js';
export { PlanningModule } from './modules/PlanningModule.js';
export { ActionModule } from './modules/ActionModule.js';
export { MemoryModule } from './modules/MemoryModule.js';
export { SkillModule } from './modules/SkillModule.js';
export { MetaCognitiveModule } from './modules/MetaCognitiveModule.js';

export const ArchitecturePresets = {
    minimal: () => new CognitiveArchitecture({ name: 'MinimalCognition', integrationStrategy: 'sequential' }),
    standard: () => new CognitiveArchitecture({ name: 'StandardCognition', integrationStrategy: 'sequential' }),
    reflective: () => new CognitiveArchitecture({
        name: 'ReflectiveCognition', integrationStrategy: 'hierarchical',
        modules: { meta: new MetaCognitiveModule({ reflectionInterval: 50 }) }
    }),
    skillBased: () => new CognitiveArchitecture({
        name: 'SkillBasedCognition', integrationStrategy: 'hierarchical',
        modules: { skills: new SkillModule({ skillExtractor: new SkillExtractor({ minSupport: 2 }) }) }
    })
};
