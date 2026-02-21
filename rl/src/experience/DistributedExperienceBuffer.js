/**
 * Distributed Experience Buffer with Causal Modeling
 * 
 * Scalable experience storage with causal indexing, prioritized sampling,
 * and distributed aggregation across workers.
 */
import { Component } from '../composable/Component.js';
import { CausalGraph, CausalReasoner } from '../reasoning/CausalReasoning.js';
import { SymbolicTensor } from '../neurosymbolic/TensorLogicBridge.js';

/**
 * Experience transition with causal annotations
 */
export class CausalExperience {
    constructor(config = {}) {
        this.state = config.state || null;
        this.action = config.action || null;
        this.reward = config.reward || 0;
        this.nextState = config.nextState || null;
        this.done = config.done || false;
        
        // Causal annotations
        this.causalSignature = config.causalSignature || null;
        this.causalPredecessors = config.causalPredecessors || [];
        this.causalSuccessors = config.causalSuccessors || [];
        
        // Temporal info
        this.timestamp = config.timestamp || Date.now();
        this.trajectoryId = config.trajectoryId || null;
        this.stepIndex = config.stepIndex || 0;
        
        // Priority for sampling
        this.priority = config.priority || 1.0;
        this.tdError = config.tdError || null;
        
        // Metadata
        this.workerId = config.workerId || null;
        this.tags = config.tags || [];
        this.metadata = config.metadata || {};
    }

    /**
     * Create causal signature for experience
     */
    static createCausalSignature(experience, resolution = 0.1) {
        const { state, action, nextState } = experience;
        
        // Discretize states
        const discretize = (s) => s.map(v => Math.round(v / resolution) * resolution);
        
        const stateSig = discretize(state).join(',');
        const nextSig = discretize(nextState).join(',');
        
        return `${stateSig}_a${action}_→${nextSig}`;
    }

    /**
     * Get transition tuple
     */
    getTransition() {
        return {
            state: this.state,
            action: this.action,
            reward: this.reward,
            nextState: this.nextState,
            done: this.done
        };
    }

    /**
     * Compute temporal difference error
     */
    computeTDError(valueFn, gamma = 0.99) {
        if (this.tdError !== null) return this.tdError;

        const currentV = valueFn(this.state);
        const nextV = this.done ? 0 : valueFn(this.nextState);
        const target = this.reward + gamma * nextV;
        
        this.tdError = Math.abs(target - currentV);
        this.priority = Math.pow(this.tdError + 0.01, 0.6); // Prioritize by TD error
        
        return this.tdError;
    }

    /**
     * Serialize experience
     */
    toJSON() {
        return {
            state: Array.from(this.state),
            action: this.action,
            reward: this.reward,
            nextState: Array.from(this.nextState),
            done: this.done,
            causalSignature: this.causalSignature,
            timestamp: this.timestamp,
            trajectoryId: this.trajectoryId,
            stepIndex: this.stepIndex,
            priority: this.priority,
            workerId: this.workerId,
            tags: this.tags,
            metadata: this.metadata
        };
    }

    /**
     * Deserialize experience
     */
    static fromJSON(json) {
        return new CausalExperience({
            ...json,
            state: Array.from(json.state),
            nextState: Array.from(json.nextState)
        });
    }
}

/**
 * Distributed experience buffer with causal indexing
 */
export class DistributedExperienceBuffer extends Component {
    constructor(config = {}) {
        super({
            // Capacity settings
            capacity: config.capacity ?? 100000,
            minCapacity: config.minCapacity ?? 1000,
            
            // Sampling settings
            batchSize: config.batchSize ?? 32,
            sampleStrategy: config.sampleStrategy ?? 'prioritized', // random, prioritized, causal, recent
            prioritizationAlpha: config.prioritizationAlpha ?? 0.6,
            prioritizationBeta: config.prioritizationBeta ?? 0.4,
            
            // Causal modeling
            useCausalIndexing: config.useCausalIndexing ?? true,
            causalResolution: config.causalResolution ?? 0.1,
            
            // Distributed settings
            numBuffers: config.numBuffers ?? 4,
            aggregationInterval: config.aggregationInterval ?? 100,
            
            // Learning
            gamma: config.gamma ?? 0.99,
            
            ...config
        });

        // Experience storage
        this.buffers = [];
        this.currentBuffer = 0;
        this.totalSize = 0;
        
        // Causal indexing
        this.causalIndex = new Map(); // signature -> experience IDs
        this.causalGraph = new CausalGraph();
        this.causalReasoner = new CausalReasoner();
        
        // Priority tracking
        this.prioritySumTree = null; // Segment tree for prioritized sampling
        
        // Distributed state
        this.workerBuffers = new Map();
        this.lastAggregation = 0;
        
        // Metrics
        this.metrics = {
            experiencesAdded: 0,
            experiencesSampled: 0,
            causalLinksDiscovered: 0,
            aggregationsPerformed: 0
        };
    }

    async onInitialize() {
        // Initialize multiple buffers for parallel access
        const bufferCapacity = Math.floor(this.config.capacity / this.config.numBuffers);
        
        for (let i = 0; i < this.config.numBuffers; i++) {
            this.buffers.push([]);
        }
        
        // Initialize priority sum tree if using prioritized sampling
        if (this.config.sampleStrategy === 'prioritized') {
            this.prioritySumTree = new SumTree(this.config.capacity);
        }

        this.emit('initialized', {
            buffers: this.config.numBuffers,
            capacity: this.config.capacity,
            causalIndexing: this.config.useCausalIndexing
        });
    }

    // =========================================================================
    // Storage Operations
    // =========================================================================

    /**
     * Add experience to buffer
     */
    async store(experience, options = {}) {
        const { 
            computeCausal = this.config.useCausalIndexing,
            updateGraph = true 
        } = options;

        // Create causal experience
        const causalExp = experience instanceof CausalExperience 
            ? experience 
            : new CausalExperience(experience);

        // Compute causal signature
        if (computeCausal && !causalExp.causalSignature) {
            causalExp.causalSignature = CausalExperience.createCausalSignature(
                causalExp,
                this.config.causalResolution
            );
        }

        // Add to current buffer
        const buffer = this.buffers[this.currentBuffer];
        const experienceId = this.totalSize;
        
        if (buffer.length >= this.config.capacity / this.config.numBuffers) {
            // Buffer full, rotate
            this.currentBuffer = (this.currentBuffer + 1) % this.config.numBuffers;
            this.buffers[this.currentBuffer] = [];
        }

        this.buffers[this.currentBuffer].push(causalExp);
        this.totalSize++;

        // Update priority tree
        if (this.prioritySumTree) {
            this.prioritySumTree.update(experienceId, causalExp.priority);
        }

        // Update causal index
        if (computeCausal) {
            this._updateCausalIndex(causalExp);
            
            if (updateGraph && causalExp.causalSignature) {
                await this._updateCausalGraph(causalExp);
            }
        }

        this.metrics.experiencesAdded++;

        return experienceId;
    }

    /**
     * Store batch of experiences
     */
    async storeBatch(experiences, options = {}) {
        const ids = [];
        for (const exp of experiences) {
            const id = await this.store(exp, options);
            ids.push(id);
        }
        return ids;
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

        // Learn causal relationship
        await this.causalReasoner.learn(
            JSON.stringify(state),
            JSON.stringify(nextState),
            JSON.stringify({ action, reward })
        );

        // Add edge to causal graph
        this.causalGraph.addEdge(
            experience.causalSignature,
            CausalExperience.createCausalSignature({ nextState }, this.config.causalResolution),
            { action, reward }
        );

        this.metrics.causalLinksDiscovered++;
    }

    // =========================================================================
    // Sampling Operations
    // =========================================================================

    /**
     * Sample batch of experiences
     */
    async sample(batchSize = null, options = {}) {
        const size = batchSize || this.config.batchSize;
        const { 
            strategy = this.config.sampleStrategy,
            causalQuery = null
        } = options;

        let samples;

        switch (strategy) {
            case 'prioritized':
                samples = await this._samplePrioritized(size);
                break;
            case 'causal':
                samples = await this._sampleCausal(size, causalQuery);
                break;
            case 'recent':
                samples = await this._sampleRecent(size);
                break;
            case 'random':
            default:
                samples = await this._sampleRandom(size);
                break;
        }

        this.metrics.experiencesSampled += samples.length;

        // Update priorities for sampled experiences
        if (strategy === 'prioritized') {
            await this._updateSamplePriorities(samples);
        }

        return samples;
    }

    async _sampleRandom(k) {
        const samples = [];
        const allExperiences = this._getAllExperiences();
        
        if (allExperiences.length === 0) return [];

        const indices = new Set();
        while (indices.size < Math.min(k, allExperiences.length)) {
            indices.add(Math.floor(Math.random() * allExperiences.length));
        }

        for (const idx of indices) {
            samples.push(allExperiences[idx]);
        }

        return samples;
    }

    async _samplePrioritized(k) {
        const samples = [];
        
        if (!this.prioritySumTree || this.totalSize === 0) {
            return this._sampleRandom(k);
        }

        // Segment tree sampling
        const segmentSize = this.prioritySumTree.total / k;
        
        for (let i = 0; i < k; i++) {
            const lower = segmentSize * i;
            const upper = segmentSize * (i + 1);
            const value = lower + Math.random() * (upper - lower);
            
            const idx = this.prioritySumTree.find(value);
            const allExperiences = this._getAllExperiences();
            
            if (idx < allExperiences.length) {
                samples.push(allExperiences[idx]);
            }
        }

        return samples;
    }

    async _sampleCausal(k, query) {
        if (!query || !this.config.useCausalIndexing) {
            return this._sampleRandom(k);
        }

        // Find experiences with similar causal structure
        const querySignature = CausalExperience.createCausalSignature(
            query,
            this.config.causalResolution
        );

        // Find similar signatures
        const similar = this._findCausalNeighbors(querySignature, k);
        
        if (similar.length >= k) {
            return similar.slice(0, k);
        }

        // Fill remaining with random samples
        const remaining = k - similar.length;
        const random = await this._sampleRandom(remaining);
        
        return [...similar, ...random];
    }

    async _sampleRecent(k) {
        const allExperiences = this._getAllExperiences();
        
        if (allExperiences.length === 0) return [];

        // Sort by timestamp and take most recent
        const sorted = [...allExperiences].sort((a, b) => b.timestamp - a.timestamp);
        
        return sorted.slice(0, k);
    }

    _findCausalNeighbors(signature, k, radius = 2) {
        const neighbors = [];
        
        // Direct match
        const direct = this.causalIndex.get(signature);
        if (direct) {
            const allExperiences = this._getAllExperiences();
            for (const idx of direct.slice(0, k)) {
                neighbors.push(allExperiences[idx]);
            }
        }

        // Causal predecessors
        if (neighbors.length < k) {
            const predecessors = this.causalGraph.getPredecessors(signature);
            const allExperiences = this._getAllExperiences();
            
            for (const pred of predecessors.slice(0, k - neighbors.length)) {
                const predIds = this.causalIndex.get(pred.signature);
                if (predIds && predIds.length > 0) {
                    neighbors.push(allExperiences[predIds[0]]);
                }
            }
        }

        return neighbors;
    }

    async _updateSamplePriorities(samples) {
        // In a real implementation, this would compute new TD errors
        // and update the priority sum tree
        for (const sample of samples) {
            // Decay priority over time
            sample.priority *= 0.9;
            
            if (this.prioritySumTree) {
                const idx = this.totalSize - samples.indexOf(sample) - 1;
                this.prioritySumTree.update(idx, sample.priority);
            }
        }
    }

    // =========================================================================
    // Distributed Operations
    // =========================================================================

    /**
     * Register worker buffer
     */
    registerWorker(workerId, config = {}) {
        this.workerBuffers.set(workerId, {
            id: workerId,
            experiences: [],
            lastSync: Date.now(),
            config
        });
    }

    /**
     * Receive experiences from worker
     */
    async receiveFromWorker(workerId, experiences) {
        let workerBuffer = this.workerBuffers.get(workerId);
        
        if (!workerBuffer) {
            this.registerWorker(workerId);
            workerBuffer = this.workerBuffers.get(workerId);
        }

        // Tag experiences with worker ID
        for (const exp of experiences) {
            exp.workerId = workerId;
        }

        workerBuffer.experiences.push(...experiences);

        // Check if aggregation needed
        if (this.totalSize - this.lastAggregation >= this.config.aggregationInterval) {
            await this.aggregateWorkers();
        }
    }

    /**
     * Aggregate experiences from all workers
     */
    async aggregateWorkers() {
        let totalAggregated = 0;

        for (const [workerId, buffer] of this.workerBuffers) {
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

    // =========================================================================
    // Utility Operations
    // =========================================================================

    _getAllExperiences() {
        const all = [];
        for (const buffer of this.buffers) {
            all.push(...buffer);
        }
        return all;
    }

    /**
     * Get experiences by trajectory
     */
    getTrajectory(trajectoryId) {
        const allExperiences = this._getAllExperiences();
        return allExperiences.filter(e => e.trajectoryId === trajectoryId);
    }

    /**
     * Get experiences by worker
     */
    getWorkerExperiences(workerId) {
        const allExperiences = this._getAllExperiences();
        return allExperiences.filter(e => e.workerId === workerId);
    }

    /**
     * Clear old experiences
     */
    clearOld(maxAge = 3600000) {
        const cutoff = Date.now() - maxAge;
        
        for (const buffer of this.buffers) {
            const initialLength = buffer.length;
            buffer.splice(0, buffer.findIndex(e => e.timestamp > cutoff));
            this.totalSize -= (initialLength - buffer.length);
        }

        // Clean up causal index
        for (const [signature, ids] of this.causalIndex) {
            const validIds = ids.filter(id => id < this.totalSize);
            if (validIds.length === 0) {
                this.causalIndex.delete(signature);
            } else {
                this.causalIndex.set(signature, validIds);
            }
        }
    }

    /**
     * Get buffer statistics
     */
    getStats() {
        const allExperiences = this._getAllExperiences();
        
        return {
            totalSize: this.totalSize,
            bufferSize: allExperiences.length,
            causalSignatures: this.causalIndex.size,
            causalLinks: this.metrics.causalLinksDiscovered,
            avgPriority: allExperiences.reduce((sum, e) => sum + e.priority, 0) / 
                        (allExperiences.length || 1),
            workerCount: this.workerBuffers.size,
            ...this.metrics
        };
    }

    /**
     * Get causal graph
     */
    getCausalGraph() {
        return this.causalGraph;
    }

    /**
     * Query causal relationships
     */
    queryCausal(query) {
        return this.causalReasoner.queryCauses(JSON.stringify(query));
    }

    /**
     * Serialize buffer
     */
    toJSON() {
        return {
            experiences: this._getAllExperiences().map(e => e.toJSON()),
            causalGraph: this.causalGraph.toJSON(),
            metrics: { ...this.metrics },
            config: { ...this.config }
        };
    }

    /**
     * Deserialize buffer
     */
    static fromJSON(json, config = {}) {
        const buffer = new DistributedExperienceBuffer(config);
        
        buffer.totalSize = json.experiences.length;
        buffer.buffers[0] = json.experiences.map(e => CausalExperience.fromJSON(e));
        buffer.causalGraph = CausalGraph.fromJSON(json.causalGraph);
        buffer.metrics = { ...json.metrics };

        // Rebuild causal index
        for (const exp of buffer.buffers[0]) {
            if (exp.causalSignature) {
                let ids = buffer.causalIndex.get(exp.causalSignature);
                if (!ids) {
                    ids = [];
                    buffer.causalIndex.set(exp.causalSignature, ids);
                }
                ids.push(buffer.totalSize - 1);
            }
        }

        return buffer;
    }

    async onShutdown() {
        this.buffers = [];
        this.causalIndex.clear();
        this.workerBuffers.clear();
    }
}

/**
 * Sum Tree for prioritized experience replay
 */
class SumTree {
    constructor(capacity) {
        this.capacity = capacity;
        this.tree = new Array(2 * capacity).fill(0);
        this.size = 0;
    }

    update(idx, priority) {
        idx += this.capacity;
        this.tree[idx] = Math.pow(priority + 1e-6, 0.6); // Add small epsilon for stability

        while (idx > 1) {
            idx = Math.floor(idx / 2);
            this.tree[idx] = this.tree[2 * idx] + this.tree[2 * idx + 1];
        }

        if (this.size <= idx - this.capacity) {
            this.size = idx - this.capacity + 1;
        }
    }

    find(value) {
        let idx = 1;

        while (idx < this.capacity) {
            const left = 2 * idx;
            const right = 2 * idx + 1;

            if (value <= this.tree[left]) {
                idx = left;
            } else {
                value -= this.tree[left];
                idx = right;
            }
        }

        return idx - this.capacity;
    }

    get total() {
        return this.tree[1];
    }

    get max() {
        let maxVal = 0;
        for (let i = this.capacity; i < 2 * this.capacity; i++) {
            maxVal = Math.max(maxVal, this.tree[i]);
        }
        return maxVal;
    }

    get min() {
        let minVal = Infinity;
        for (let i = this.capacity; i < 2 * this.capacity; i++) {
            if (this.tree[i] > 0) {
                minVal = Math.min(minVal, this.tree[i]);
            }
        }
        return minVal === Infinity ? 0 : minVal;
    }
}

/**
 * Factory for creating specialized experience buffers
 */
export class ExperienceBufferFactory {
    /**
     * Create buffer optimized for prioritized replay
     */
    static createPrioritized(capacity = 100000, config = {}) {
        return new DistributedExperienceBuffer({
            capacity,
            sampleStrategy: 'prioritized',
            ...config
        });
    }

    /**
     * Create buffer optimized for causal reasoning
     */
    static createCausal(capacity = 100000, config = {}) {
        return new DistributedExperienceBuffer({
            capacity,
            sampleStrategy: 'causal',
            useCausalIndexing: true,
            ...config
        });
    }

    /**
     * Create buffer for distributed training
     */
    static createDistributed(capacity = 100000, numWorkers = 8, config = {}) {
        return new DistributedExperienceBuffer({
            capacity,
            numBuffers: numWorkers,
            aggregationInterval: 100,
            ...config
        });
    }

    /**
     * Create minimal buffer for testing
     */
    static createMinimal(capacity = 1000, config = {}) {
        return new DistributedExperienceBuffer({
            capacity,
            numBuffers: 1,
            useCausalIndexing: false,
            ...config
        });
    }
}
