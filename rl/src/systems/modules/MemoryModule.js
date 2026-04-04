import { mergeConfig } from '../../utils/ConfigHelper.js';
import { CognitiveModule } from './CognitiveModule.js';
import { ExperienceStore } from '../../experience/ExperienceSystem.js';

const MEMORY_DEFAULTS = { experienceStore: null, retrievalStrategy: null, workingMemoryLimit: 50 };

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
        this.config.experienceStore.record(state, action, reward, nextState, done, { tags: this.extractTags(experience) });
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
            this.workingMemory.delete(this.workingMemory.keys().next().value);
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
