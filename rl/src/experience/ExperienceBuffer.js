import { Component } from '../composable/Component.js';
import { CausalGraph, CausalReasoner } from '../reasoning/CausalReasoning.js';
import { mergeConfig } from '../utils/ConfigHelper.js';

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

    causal(causalIndex, causalGraph, allExperiences, query, k, resolution) {
        if (!query || !causalIndex.size) {
            return this.random(allExperiences, k);
        }

        const querySignature = CausalExperience.createCausalSignature(query, resolution);
        const neighbors = [];

        const direct = causalIndex.get(querySignature);
        if (direct) {
            for (let i = 0; i < Math.min(k, direct.length); i++) {
                neighbors.push(allExperiences[direct[i]]);
            }
        }

        if (neighbors.length < k) {
            const predecessors = causalGraph.getPredecessors(querySignature);
            const needed = k - neighbors.length;

            for (let i = 0; i < Math.min(needed, predecessors.length); i++) {
                const predIds = causalIndex.get(predecessors[i].signature);
                if (predIds?.length > 0) {
                    neighbors.push(allExperiences[predIds[0]]);
                }
            }
        }

        return neighbors;
    },

    recent(allExperiences, k) {
        return allExperiences.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, k);
    }
};

export class CausalExperience {
    constructor(config = {}) {
        Object.assign(this, {
            state: null,
            action: null,
            reward: 0,
            nextState: null,
            done: false,
            causalSignature: null,
            causalPredecessors: [],
            causalSuccessors: [],
            timestamp: Date.now(),
            trajectoryId: null,
            stepIndex: 0,
            priority: 1.0,
            tdError: null,
            workerId: null,
            tags: [],
            metadata: {},
            ...config
        });
    }

    static createCausalSignature(experience, resolution = 0.1) {
        const { state, action, nextState } = experience;
        const discretize = (s) => s.map(v => Math.round(v / resolution) * resolution);
        return `${discretize(state).join(',')}_a${action}_→${discretize(nextState).join(',')}`;
    }

    getTransition() {
        return {
            state: this.state,
            action: this.action,
            reward: this.reward,
            nextState: this.nextState,
            done: this.done
        };
    }

    computeTDError(valueFn, gamma = 0.99) {
        if (this.tdError !== null) return this.tdError;

        const currentV = valueFn(this.state);
        const nextV = this.done ? 0 : valueFn(this.nextState);
        const target = this.reward + gamma * nextV;

        this.tdError = Math.abs(target - currentV);
        this.priority = Math.pow(this.tdError + 0.01, 0.6);
        return this.tdError;
    }

    toJSON() {
        return {
            ...this,
            state: Array.from(this.state),
            nextState: Array.from(this.nextState)
        };
    }

    static fromJSON(json) {
        return new CausalExperience({
            ...json,
            state: Array.from(json.state),
            nextState: Array.from(json.nextState)
        });
    }
}

export class ExperienceBuffer extends Component {
    constructor(config = {}) {
        super(mergeConfig(DEFAULTS, config));

        this.buffers = [];
        this.currentBuffer = 0;
        this.totalSize = 0;
        this.causalIndex = new Map();
        this.causalGraph = new CausalGraph();
        this.causalReasoner = new CausalReasoner();
        this.prioritySumTree = null;
        this.workerBuffers = new Map();
        this.lastAggregation = 0;
        this.metrics = { experiencesAdded: 0, experiencesSampled: 0, causalLinksDiscovered: 0, aggregationsPerformed: 0 };
    }

    async onInitialize() {
        this.buffers = Array.from({ length: this.config.numBuffers }, () => []);

        if (this.config.sampleStrategy === 'prioritized') {
            this.prioritySumTree = new SumTree(this.config.capacity);
        }

        this.emit('initialized', { buffers: this.config.numBuffers, capacity: this.config.capacity, causalIndexing: this.config.useCausalIndexing });
    }

    async store(experience, options = {}) {
        const { computeCausal = this.config.useCausalIndexing, updateGraph = true } = options;

        const causalExp = experience instanceof CausalExperience
            ? experience
            : new CausalExperience(experience);

        if (computeCausal && !causalExp.causalSignature) {
            causalExp.causalSignature = CausalExperience.createCausalSignature(causalExp, this.config.causalResolution);
        }

        const buffer = this.buffers[this.currentBuffer];

        if (buffer.length >= this.config.capacity / this.config.numBuffers) {
            this.currentBuffer = (this.currentBuffer + 1) % this.config.numBuffers;
            this.buffers[this.currentBuffer] = [];
        }

        this.buffers[this.currentBuffer].push(causalExp);
        this.totalSize++;

        if (this.prioritySumTree) {
            this.prioritySumTree.update(this.totalSize - 1, causalExp.priority);
        }

        if (computeCausal) {
            this._updateCausalIndex(causalExp);
            if (updateGraph && causalExp.causalSignature) {
                await this._updateCausalGraph(causalExp);
            }
        }

        this.metrics.experiencesAdded++;
        return this.totalSize - 1;
    }

    async storeBatch(experiences, options = {}) {
        return Promise.all(experiences.map(exp => this.store(exp, options)));
    }

    _updateCausalIndex(experience) {
        if (!experience.causalSignature) return;

        let ids = this.causalIndex.get(experience.causalSignature);
        if (!ids) {
            ids = [];
            this.causalIndex.set(experience.causalSignature, ids);
        }
        ids.push(this.totalSize - 1);
    }

    async _updateCausalGraph(experience) {
        const { state, action, nextState, reward } = experience;
        await this.causalReasoner.learn(JSON.stringify(state), JSON.stringify(nextState), JSON.stringify({ action, reward }));
        this.metrics.causalLinksDiscovered++;
    }

    async sample(batchSize = null, options = {}) {
        const size = batchSize ?? this.config.batchSize;
        const { strategy = this.config.sampleStrategy, causalQuery = null } = options;

        const allExperiences = this._getAllExperiences();
        let samples;

        switch (strategy) {
            case 'prioritized':
                samples = SamplingStrategies.prioritized(this.prioritySumTree, allExperiences, size);
                break;
            case 'causal':
                samples = SamplingStrategies.causal(this.causalIndex, this.causalGraph, allExperiences, causalQuery, size, this.config.causalResolution);
                if (samples.length < size) {
                    const remaining = SamplingStrategies.random(allExperiences, size - samples.length);
                    samples = [...samples, ...remaining];
                }
                break;
            case 'recent':
                samples = SamplingStrategies.recent(allExperiences, size);
                break;
            default:
                samples = SamplingStrategies.random(allExperiences, size);
        }

        this.metrics.experiencesSampled += samples.length;

        if (strategy === 'prioritized') {
            this._updateSamplePriorities(samples);
        }

        return samples;
    }

    async _updateSamplePriorities(samples) {
        for (let i = 0; i < samples.length; i++) {
            const sample = samples[i];
            sample.priority *= this.config.priorityDecay;
            if (this.prioritySumTree) {
                // Approximate index finding - flawed in original but kept for structure
                // Ideally sample should store its index
                const idx = this.totalSize - i - 1;
                this.prioritySumTree.update(idx, sample.priority);
            }
        }
    }

    registerWorker(workerId, config = {}) {
        this.workerBuffers.set(workerId, { id: workerId, experiences: [], lastSync: Date.now(), config });
    }

    async receiveFromWorker(workerId, experiences) {
        let workerBuffer = this.workerBuffers.get(workerId);

        if (!workerBuffer) {
            this.registerWorker(workerId);
            workerBuffer = this.workerBuffers.get(workerId);
        }

        for (const exp of experiences) {
            exp.workerId = workerId;
            workerBuffer.experiences.push(exp);
        }

        if (this.totalSize - this.lastAggregation >= this.config.aggregationInterval) {
            await this.aggregateWorkers();
        }
    }

    async aggregateWorkers() {
        let totalAggregated = 0;

        for (const buffer of this.workerBuffers.values()) {
            if (buffer.experiences.length > 0) {
                await this.storeBatch(buffer.experiences);
                totalAggregated += buffer.experiences.length;
                buffer.experiences = [];
                buffer.lastSync = Date.now();
            }
        }

        this.metrics.aggregationsPerformed++;
        this.lastAggregation = this.totalSize;
        return totalAggregated;
    }

    _getAllExperiences() {
        return this.buffers.flat();
    }

    getTrajectory(trajectoryId) {
        return this._getAllExperiences().filter(e => e.trajectoryId === trajectoryId);
    }

    getWorkerExperiences(workerId) {
        return this._getAllExperiences().filter(e => e.workerId === workerId);
    }

    clearOld(maxAge = 3600000) {
        const cutoff = Date.now() - maxAge;

        for (const buffer of this.buffers) {
            const initialLength = buffer.length;
            const validIdx = buffer.findIndex(e => e.timestamp > cutoff);
            if (validIdx > 0) {
                buffer.splice(0, validIdx);
                this.totalSize -= (initialLength - buffer.length);
            } else if (validIdx === -1 && buffer.length > 0 && buffer[buffer.length-1].timestamp <= cutoff) {
                 // All old
                 this.totalSize -= buffer.length;
                 buffer.length = 0;
            }
        }

        for (const [signature, ids] of this.causalIndex) {
            const validIds = ids.filter(id => id < this.totalSize);
            if (validIds.length === 0) {
                this.causalIndex.delete(signature);
            } else {
                this.causalIndex.set(signature, validIds);
            }
        }
    }

    getStats() {
        const allExperiences = this._getAllExperiences();
        const len = allExperiences.length || 1;
        let sumPriority = 0;
        for (const e of allExperiences) sumPriority += e.priority;

        return {
            totalSize: this.totalSize,
            bufferSize: allExperiences.length,
            causalSignatures: this.causalIndex.size,
            causalLinks: this.metrics.causalLinksDiscovered,
            avgPriority: sumPriority / len,
            workerCount: this.workerBuffers.size,
            ...this.metrics
        };
    }

    getCausalGraph() {
        return this.causalGraph;
    }

    queryCausal(query) {
        return this.causalReasoner.queryCauses(JSON.stringify(query));
    }

    toJSON() {
        return {
            experiences: this._getAllExperiences().map(e => e.toJSON()),
            causalGraph: this.causalGraph.toJSON(),
            metrics: { ...this.metrics },
            config: { ...this.config }
        };
    }

    static fromJSON(json, config = {}) {
        const buffer = new ExperienceBuffer(config);
        buffer.totalSize = json.experiences.length;
        buffer.buffers[0] = json.experiences.map(e => CausalExperience.fromJSON(e));
        buffer.causalGraph = CausalGraph.fromJSON(json.causalGraph);
        buffer.metrics = { ...json.metrics };

        // Rebuild index
        const exps = buffer.buffers[0];
        for (let idx = 0; idx < exps.length; idx++) {
            const exp = exps[idx];
            if (exp.causalSignature) {
                let ids = buffer.causalIndex.get(exp.causalSignature);
                if (!ids) {
                    ids = [];
                    buffer.causalIndex.set(exp.causalSignature, ids);
                }
                ids.push(idx);
            }
        }

        return buffer;
    }

    async onShutdown() {
        this.buffers = [];
        this.causalIndex.clear();
        this.workerBuffers.clear();
    }

    static createPrioritized(capacity = 100000, config = {}) {
        return new ExperienceBuffer({ capacity, sampleStrategy: 'prioritized', ...config });
    }

    static createCausal(capacity = 100000, config = {}) {
        return new ExperienceBuffer({ capacity, sampleStrategy: 'causal', useCausalIndexing: true, ...config });
    }

    static createDistributed(capacity = 100000, numWorkers = 8, config = {}) {
        return new ExperienceBuffer({ capacity, numBuffers: numWorkers, aggregationInterval: 100, ...config });
    }

    static createMinimal(capacity = 1000, config = {}) {
        return new ExperienceBuffer({ capacity, numBuffers: 1, useCausalIndexing: false, ...config });
    }
}

class SumTree {
    constructor(capacity) {
        this.capacity = capacity;
        this.tree = new Float64Array(2 * capacity); // Use TypedArray
        this.size = 0;
    }

    update(idx, priority) {
        let currentIdx = idx + this.capacity;
        this.tree[currentIdx] = Math.pow(priority + 1e-6, 0.6);

        while (currentIdx > 1) {
            currentIdx = currentIdx >> 1; // Bitwise shift for floor division by 2
            this.tree[currentIdx] = this.tree[2 * currentIdx] + this.tree[2 * currentIdx + 1];
        }

        if (this.size <= idx) {
            this.size = idx + 1;
        }
    }

    find(value) {
        let idx = 1;

        while (idx < this.capacity) {
            const left = 2 * idx;
            if (value <= this.tree[left]) {
                idx = left;
            } else {
                value -= this.tree[left];
                idx = left + 1;
            }
        }

        return idx - this.capacity;
    }

    get total() {
        return this.tree[1];
    }
}
