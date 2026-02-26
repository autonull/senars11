/**
 * Experience Buffer - Core replay buffer functionality
 * Leverages Experience from ExperienceSystem.js for unified experience representation
 */
import { Component } from '../composable/Component.js';
import { CausalGraph } from '../cognitive/CognitiveSystem.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { SumTree } from '../utils/DataStructures.js';
import { Experience } from './ExperienceSystem.js';

const DEFAULTS = {
    capacity: 100000,
    minCapacity: 1000,
    batchSize: 32,
    sampleStrategy: 'prioritized',
    prioritizationAlpha: 0.6,
    prioritizationBeta: 0.4,
    useCausalIndexing: true,
    causalResolution: 0.1,
    numBuffers: 4,
    aggregationInterval: 100,
    gamma: 0.99,
    priorityDecay: 0.9
};

const SamplingStrategies = {
    random(allExperiences, k) {
        if (allExperiences.length === 0) return [];
        const indices = new Set();
        const max = allExperiences.length;
        const limit = Math.min(k, max);

        while (indices.size < limit) {
            indices.add(Math.floor(Math.random() * max));
        }

        return Array.from(indices, idx => allExperiences[idx]);
    },

    prioritized(sumTree, allExperiences, k) {
        if (!sumTree || allExperiences.length === 0) {
            return this.random(allExperiences, k);
        }

        const samples = [];
        const segmentSize = sumTree.total / k;

        for (let i = 0; i < k; i++) {
            const value = segmentSize * i + Math.random() * segmentSize;
            const idx = sumTree.find(value);
            if (idx < allExperiences.length) {
                samples.push(allExperiences[idx]);
            }
        }

        return samples;
    },

    recent(allExperiences, k) {
        return allExperiences.slice().sort((a, b) => b.info.timestamp - a.info.timestamp).slice(0, k);
    }
};

/**
 * CausalExperience - Extends Experience with causal signatures
 */
export class CausalExperience extends Experience {
    constructor(config = {}) {
        const { state, action, reward, nextState, done, info = {} } = config;
        super({ state, action, reward, nextState, done, info });
        
        this.causalSignature = config.causalSignature ?? null;
        this.causalPredecessors = config.causalPredecessors ?? [];
        this.causalSuccessors = config.causalSuccessors ?? [];
        
        if (!this.causalSignature && state && action && nextState) {
            this.causalSignature = CausalExperience.createCausalSignature(this, config.resolution ?? 0.1);
        }
    }

    static create(state, action, reward, nextState, done = false) {
        return new CausalExperience({ state, action, reward, nextState, done });
    }

    static createCausalSignature(experience, resolution = 0.1) {
        if (!experience) return null;
        const { state, action, nextState, reward } = experience;
        const discretize = (v) => Math.round(v / resolution) * resolution;
        const stateSig = Array.isArray(state) ? state.map(discretize).join(',') : discretize(state);
        const nextSig = Array.isArray(nextState) ? nextState.map(discretize).join(',') : discretize(nextState);
        return `${stateSig}|${action}|${discretize(reward)}|${nextSig}`;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            causalSignature: this.causalSignature,
            causalPredecessors: this.causalPredecessors,
            causalSuccessors: this.causalSuccessors
        };
    }
}

export class ExperienceBuffer extends Component {
    constructor(config = {}) {
        super(mergeConfig(DEFAULTS, config));
        this.capacity = this.config.capacity;
        this.experiences = [];
        this.sumTree = null;
        this.causalIndex = new Map();
        this.causalGraph = this.config.useCausalIndexing ? new CausalGraph() : null;
        this.pos = 0;
        this.count = 0;
        this._metricsTracker = { additions: 0, samples: 0, causalLinksDiscovered: 0 };
    }

    get metrics() {
        return this._metricsTracker;
    }

    /**
     * Total number of experiences stored (for backward compatibility)
     */
    get totalSize() {
        return this.count;
    }

    async onInitialize() {
        if (this.config.sampleStrategy === 'prioritized') {
            this.sumTree = new SumTree(this.capacity);
        }
        this.emit('initialized', { capacity: this.capacity, strategy: this.config.sampleStrategy });
    }

    async store(experience) {
        const exp = experience instanceof CausalExperience ? experience : new CausalExperience(experience);
        const id = this.count;

        if (this.count >= this.capacity) {
            this.experiences[this.pos] = exp;
            if (this.sumTree) this.sumTree.update(this.pos, 1.0);
        } else {
            this.experiences.push(exp);
            if (this.sumTree) this.sumTree.add(1.0);
            this.count++;
        }

        if (this.config.useCausalIndexing && this.causalGraph) {
            await this._updateCausalGraph(exp);
        }

        this.pos = (this.pos + 1) % this.capacity;
        this.metrics.additions++;
        return id;
    }

    async storeBatch(experiences) {
        return Promise.all(experiences.map(exp => this.store(exp)));
    }

    async _updateCausalGraph(experience) {
        const { state, action, nextState, reward } = experience;
        await this.causalReasoner?.learn(JSON.stringify(state), JSON.stringify(nextState), JSON.stringify({ action, reward }));
        this.metrics.causalLinksDiscovered++;
    }

    async sample(batchSize = this.config.batchSize) {
        const { sampleStrategy, prioritizedAlpha, prioritizedBeta } = this.config;
        const strategyFn = SamplingStrategies[sampleStrategy] ?? SamplingStrategies.random;

        let samples;
        if (sampleStrategy === 'prioritized') {
            samples = strategyFn(this.sumTree, this.experiences, batchSize);
        } else if (sampleStrategy === 'causal') {
            samples = strategyFn(this.causalIndex, this.causalGraph, this.experiences, null, batchSize, this.config.causalResolution);
        } else {
            samples = strategyFn(this.experiences, batchSize);
        }

        this.metrics.samples += samples.length;
        return samples;
    }

    async prioritize(index, priority) {
        if (!this.sumTree) return;
        const oldPriority = this.sumTree.get(index);
        const importance = Math.pow(priority / this.sumTree.max, -this.config.prioritizedBeta);
        this.sumTree.update(index, priority);
        return importance;
    }

    clear() {
        this.experiences = [];
        this.pos = 0;
        this.count = 0;
        if (this.sumTree) this.sumTree = new SumTree(this.capacity);
        if (this.causalIndex) this.causalIndex.clear();
        this._metricsTracker = { additions: 0, samples: 0, causalLinksDiscovered: 0 };
    }

    getStats() {
        return {
            count: this.count,
            totalSize: this.count,
            capacity: this.capacity,
            strategy: this.config.sampleStrategy,
            ...this.metrics,
            causalIndexSize: this.causalIndex?.size ?? 0
        };
    }

    async onShutdown() {
        this.clear();
    }

    static create(config = {}) {
        return new ExperienceBuffer(config);
    }

    static createMinimal(capacity = 10000, config = {}) {
        return new ExperienceBuffer({
            capacity,
            batchSize: 32,
            sampleStrategy: 'random',
            useCausalIndexing: false,
            ...config
        });
    }

    static createPrioritized(capacity = 100000, config = {}) {
        return new ExperienceBuffer({
            capacity,
            batchSize: 64,
            sampleStrategy: 'prioritized',
            prioritizationAlpha: 0.6,
            prioritizationBeta: 0.4,
            ...config
        });
    }

    static createCausal(capacity = 50000, config = {}) {
        return new ExperienceBuffer({
            capacity,
            batchSize: 32,
            sampleStrategy: 'causal',
            useCausalIndexing: true,
            causalResolution: 0.1,
            ...config
        });
    }
}

// Re-export Experience classes from ExperienceSystem.js for convenience
export {
    Experience,
    ExperienceStream,
    Episode,
    ExperienceIndex,
    ExperienceStore,
    SkillExtractor,
    ExperienceLearner
} from './ExperienceSystem.js';
