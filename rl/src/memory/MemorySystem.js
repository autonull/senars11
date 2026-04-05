/**
 * Unified Memory System - Facade combining episodic, semantic, and grounding subsystems
 */
import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';
import { EpisodicMemory } from './EpisodicMemory.js';
import { SemanticMemory } from './SemanticMemory.js';
import { LearnedGrounding } from './LearnedGrounding.js';

const MEMORY_DEFAULTS = {
    capacity: 10000,
    episodicCapacity: 1000,
    semanticCapacity: 500,
    autoRebuildIndex: true,
    consolidationThreshold: 100,
    retrievalK: 5,
    similarityThreshold: 0.7,
    useCausalIndexing: true,
    decayRate: 0.01,
    useCoreMemory: true,
    coreMemoryConfig: {}
};

export class MemorySystem extends Component {
    constructor(config = {}) {
        super(mergeConfig(MEMORY_DEFAULTS, config));
        this.episodic = new EpisodicMemory(config);
        this.semantic = new SemanticMemory(config);
        this.grounding = new LearnedGrounding(config);
        this._metricsTracker = new MetricsTracker({ queriesPerformed: 0 });
    }

    get metrics() { return this._metricsTracker; }

    async onInitialize() {
        await Promise.all([
            this.episodic.initialize(),
            this.semantic.initialize(),
            this.grounding.initialize()
        ]);
        this.emit('initialized', {
            episodicCapacity: this.config.episodicCapacity,
            semanticCapacity: this.config.semanticCapacity
        });
    }

    store(experience, options = {}) {
        const { useGrounding = true } = options;
        if (useGrounding) {experience.symbol = this.grounding.lift(experience.state);}
        return this.episodic.store(experience, options);
    }

    query(pattern, options = {}) {
        this.metrics.increment('queriesPerformed');
        return this.episodic.query(pattern, options);
    }

    learnConcept(name, features, metadata = {}) {
        return this.semantic.learnConcept(name, features, metadata);
    }

    getRelatedConcepts(name, options = {}) {
        return this.semantic.getRelatedConcepts(name, options);
    }

    getStats() {
        return {
            episodic: this.episodic.getStats(),
            semantic: this.semantic.getStats(),
            grounding: this.grounding.getStats(),
            metrics: this.metrics.getAll()
        };
    }

    async onShutdown() {
        await Promise.all([
            this.episodic.shutdown(),
            this.semantic.shutdown(),
            this.grounding.shutdown()
        ]);
    }
}

export { EpisodicMemory as Memory };
export { SemanticMemory as Knowledge };
export { LearnedGrounding as Grounding, LearnedGrounding };
export { MemorySystem as UnifiedMemory };
