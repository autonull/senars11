/**
 * Unified Experience System
 * Accumulate, organize, and learn from experience for general intelligence.
 */
import { compose, pipe, Maybe, Either, Stream, Lazy, Lens } from '../functional/FunctionalUtils.js';

/**
 * Experience Record
 */
export class Experience {
    constructor({ state, action, reward, nextState, done, info = {} }) {
        this.id = info.id ?? this.generateId();
        this.state = state;
        this.action = action;
        this.reward = reward;
        this.nextState = nextState;
        this.done = done;
        this.info = {
            timestamp: info.timestamp ?? Date.now(),
            episode: info.episode ?? 0,
            step: info.step ?? 0,
            priority: info.priority ?? 1.0,
            tags: info.tags ?? [],
            ...info
        };
        this.metadata = new Map();
    }

    generateId() {
        return `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    withReward(reward) {
        return new Experience({ ...this, reward });
    }

    withPriority(priority) {
        return new Experience({ ...this, info: { ...this.info, priority } });
    }

    withTag(tag) {
        return new Experience({ ...this, info: { ...this.info, tags: [...this.info.tags, tag] } });
    }

    setMetadata(key, value) {
        this.metadata.set(key, value);
        return this;
    }

    getMetadata(key) {
        return this.metadata.get(key);
    }

    toTransition() {
        return {
            state: this.state,
            action: this.action,
            reward: this.reward,
            nextState: this.nextState,
            done: this.done
        };
    }

    toJSON() {
        return {
            id: this.id,
            state: this.serialize(this.state),
            action: this.action,
            reward: this.reward,
            nextState: this.serialize(this.nextState),
            done: this.done,
            info: this.info
        };
    }

    serialize(value) {
        if (value?.data) return Array.from(value.data);
        if (Array.isArray(value)) return [...value];
        return value;
    }
}

/**
 * Experience Stream for lazy processing
 */
export class ExperienceStream {
    constructor(iterator) {
        this._iterator = iterator;
    }

    static from(iterable) {
        return new ExperienceStream(iterable[Symbol.iterator]());
    }

    static empty() {
        return new ExperienceStream((function*() {})());
    }

    filter(predicate) {
        const self = this;
        return new ExperienceStream((function*() {
            for (const exp of self._iterator) {
                if (predicate(exp)) yield exp;
            }
        })());
    }

    map(fn) {
        const self = this;
        return new ExperienceStream((function*() {
            for (const exp of self._iterator) yield fn(exp);
        })());
    }

    take(n) {
        const self = this;
        return new ExperienceStream((function*() {
            let count = 0;
            for (const exp of self._iterator) {
                if (count++ >= n) break;
                yield exp;
            }
        })());
    }

    sortBy(comparator) {
        const items = this.collect();
        items.sort(comparator);
        return ExperienceStream.from(items);
    }

    sample(k) {
        const items = this.collect();
        const shuffled = items.sort(() => Math.random() - 0.5);
        return ExperienceStream.from(shuffled.slice(0, k));
    }

    collect() {
        return Array.from(this._iterator);
    }

    reduce(fn, initial) {
        let acc = initial;
        for (const exp of this._iterator) {
            acc = fn(acc, exp);
        }
        return acc;
    }

    forEach(fn) {
        for (const exp of this._iterator) fn(exp);
        return this;
    }

    [Symbol.iterator]() {
        return this._iterator;
    }
}

/**
 * Episode: Sequence of experiences
 */
export class Episode {
    constructor(id = null) {
        this.id = id ?? `ep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.experiences = [];
        this.startTime = Date.now();
        this.endTime = null;
        this.metadata = new Map();
    }

    add(experience) {
        this.experiences.push(experience);
        return this;
    }

    addAll(experiences) {
        this.experiences.push(...experiences);
        return this;
    }

    get length() {
        return this.experiences.length;
    }

    get totalReward() {
        return this.experiences.reduce((sum, e) => sum + e.reward, 0);
    }

    get success() {
        return this.experiences.length > 0 && 
               this.experiences[this.experiences.length - 1].done &&
               this.totalReward > 0;
    }

    get duration() {
        return (this.endTime ?? Date.now()) - this.startTime;
    }

    getTrajectory() {
        return this.experiences.map(e => e.toTransition());
    }

    getStates() {
        return this.experiences.map(e => e.state);
    }

    getActions() {
        return this.experiences.map(e => e.action);
    }

    getRewards() {
        return this.experiences.map(e => e.reward);
    }

    finalize() {
        this.endTime = Date.now();
        return this;
    }

    setMetadata(key, value) {
        this.metadata.set(key, value);
        return this;
    }

    getMetadata(key) {
        return this.metadata.get(key);
    }

    stream() {
        return ExperienceStream.from(this.experiences);
    }

    toJSON() {
        return {
            id: this.id,
            length: this.length,
            totalReward: this.totalReward,
            success: this.success,
            duration: this.duration,
            experiences: this.experiences.map(e => e.toJSON())
        };
    }
}

/**
 * Experience Index for efficient retrieval
 */
export class ExperienceIndex {
    constructor() {
        this.byTag = new Map();
        this.byEpisode = new Map();
        this.byReward = new Map();
        this.byState = new Map();
        this.timeline = [];
    }

    add(experience) {
        const id = experience.id;
        
        // Timeline index
        this.timeline.push(id);

        // Tag index
        for (const tag of experience.info.tags) {
            if (!this.byTag.has(tag)) this.byTag.set(tag, new Set());
            this.byTag.get(tag).add(id);
        }

        // Episode index
        const epId = experience.info.episode;
        if (!this.byEpisode.has(epId)) this.byEpisode.set(epId, new Set());
        this.byEpisode.get(epId).add(id);

        // Reward index (binned)
        const rewardBin = Math.floor(experience.reward * 10);
        if (!this.byReward.has(rewardBin)) this.byReward.set(rewardBin, new Set());
        this.byReward.get(rewardBin).add(id);

        // State index (hashed)
        const stateHash = this.hashState(experience.state);
        if (!this.byState.has(stateHash)) this.byState.set(stateHash, new Set());
        this.byState.get(stateHash).add(id);
    }

    remove(id) {
        // Remove from all indices
        for (const set of this.byTag.values()) set.delete(id);
        for (const set of this.byEpisode.values()) set.delete(id);
        for (const set of this.byReward.values()) set.delete(id);
        for (const set of this.byState.values()) set.delete(id);
        
        const idx = this.timeline.indexOf(id);
        if (idx >= 0) this.timeline.splice(idx, 1);
    }

    query(options = {}) {
        const { tags, episode, minReward, maxReward, state, limit } = options;
        
        let candidates = new Set(this.timeline);

        if (tags) {
            for (const tag of tags) {
                const tagged = this.byTag.get(tag) ?? new Set();
                candidates = new Set([...candidates].filter(id => tagged.has(id)));
            }
        }

        if (episode !== undefined) {
            const epExps = this.byEpisode.get(episode) ?? new Set();
            candidates = new Set([...candidates].filter(id => epExps.has(id)));
        }

        if (minReward !== undefined) {
            for (const [bin, ids] of this.byReward) {
                if (bin * 0.1 < minReward) {
                    for (const id of ids) candidates.delete(id);
                }
            }
        }

        if (state) {
            const stateHash = this.hashState(state);
            const similar = this.byState.get(stateHash) ?? new Set();
            candidates = similar;
        }

        let result = Array.from(candidates);
        
        if (limit) {
            result = result.slice(0, limit);
        }

        return result;
    }

    hashState(state) {
        if (Array.isArray(state)) {
            return state.map(x => Math.round(x * 10)).join('_');
        }
        return String(state);
    }

    stats() {
        return {
            total: this.timeline.length,
            tags: this.byTag.size,
            episodes: this.byEpisode.size,
            rewardBins: this.byReward.size,
            stateHashes: this.byState.size
        };
    }

    clear() {
        this.byTag.clear();
        this.byEpisode.clear();
        this.byReward.clear();
        this.byState.clear();
        this.timeline = [];
    }
}

/**
 * Experience Store - Main accumulation system
 */
export class ExperienceStore {
    constructor(config = {}) {
        this.config = {
            capacity: config.capacity ?? 100000,
            episodeCapacity: config.episodeCapacity ?? 10000,
            priorityReplay: config.priorityReplay ?? false,
            nStep: config.nStep ?? 1,
            gamma: config.gamma ?? 0.99,
            ...config
        };

        this.experiences = new Map();
        this.episodes = new Map();
        this.index = new ExperienceIndex();
        this.currentEpisode = null;
        this.totalExperiences = 0;
        this.totalEpisodes = 0;

        // Priority replay
        this.priorities = new Map();
        this.sumTree = null;
        if (this.config.priorityReplay) {
            this.sumTree = new SumTree(this.config.capacity);
        }
    }

    /**
     * Start a new episode
     */
    startEpisode(metadata = {}) {
        this.currentEpisode = new Episode();
        for (const [key, value] of Object.entries(metadata)) {
            this.currentEpisode.setMetadata(key, value);
        }
        return this.currentEpisode;
    }

    /**
     * Record an experience
     */
    record(state, action, reward, nextState, done, info = {}) {
        if (!this.currentEpisode) {
            this.startEpisode();
        }

        const experience = new Experience({
            state,
            action,
            reward,
            nextState,
            done,
            info: {
                ...info,
                episode: this.currentEpisode.id,
                step: this.currentEpisode.length
            }
        });

        this.currentEpisode.add(experience);
        this.experiences.set(experience.id, experience);
        this.index.add(experience);
        
        if (this.config.priorityReplay && this.sumTree) {
            this.sumTree.update(this.totalExperiences, experience.info.priority);
        }

        this.totalExperiences++;

        if (done) {
            this.finalizeEpisode();
        }

        return experience;
    }

    /**
     * Finalize current episode
     */
    finalizeEpisode() {
        if (!this.currentEpisode) return null;

        const episode = this.currentEpisode.finalize();
        this.episodes.set(episode.id, episode);
        this.totalEpisodes++;

        // Compute n-step returns
        if (this.config.nStep > 1) {
            this.computeNStepReturns(episode);
        }

        this.currentEpisode = null;
        return episode;
    }

    /**
     * Compute n-step returns
     */
    computeNStepReturns(episode) {
        const n = this.config.nStep;
        const gamma = this.config.gamma;
        const experiences = episode.experiences;

        for (let t = 0; t < experiences.length; t++) {
            let G = 0;
            for (let k = 0; k < n && t + k < experiences.length; k++) {
                G += Math.pow(gamma, k) * experiences[t + k].reward;
            }
            
            if (t + n < experiences.length) {
                // Bootstrap from value estimate (placeholder)
                G += Math.pow(gamma, n) * experiences[t + n].reward;
            }

            experiences[t].nStepReturn = G;
        }
    }

    /**
     * Query experiences
     */
    query(options = {}) {
        const ids = this.index.query(options);
        const experiences = ids
            .map(id => this.experiences.get(id))
            .filter(e => e !== undefined);

        return ExperienceStream.from(experiences);
    }

    /**
     * Sample experiences
     */
    sample(k = 32, options = {}) {
        const { prioritized = false } = options;

        if (prioritized && this.sumTree) {
            return this.samplePrioritized(k);
        }

        return this.query(options).sample(k).collect();
    }

    /**
     * Prioritized sampling
     */
    samplePrioritized(k) {
        const indices = this.sumTree.sample(k);
        return indices
            .map(i => Array.from(this.experiences.values())[i])
            .filter(e => e !== undefined);
    }

    /**
     * Update priorities
     */
    updatePriorities(experienceIds, priorities) {
        if (!this.config.priorityReplay) return;

        for (let i = 0; i < experienceIds.length; i++) {
            const id = experienceIds[i];
            const priority = priorities[i];
            
            const exp = this.experiences.get(id);
            if (exp) {
                exp.info.priority = priority;
                const idx = Array.from(this.experiences.keys()).indexOf(id);
                if (idx >= 0 && this.sumTree) {
                    this.sumTree.update(idx, priority);
                }
            }
        }
    }

    /**
     * Get episode by ID
     */
    getEpisode(episodeId) {
        return this.episodes.get(episodeId);
    }

    /**
     * Get successful episodes
     */
    getSuccessfulEpisodes(limit = 100) {
        return Array.from(this.episodes.values())
            .filter(ep => ep.success)
            .sort((a, b) => b.totalReward - a.totalReward)
            .slice(0, limit);
    }

    /**
     * Get recent episodes
     */
    getRecentEpisodes(limit = 100) {
        return Array.from(this.episodes.values())
            .sort((a, b) => b.startTime - a.startTime)
            .slice(0, limit);
    }

    /**
     * Compute statistics
     */
    getStats() {
        const episodes = Array.from(this.episodes.values());
        const rewards = episodes.map(ep => ep.totalReward);
        const lengths = episodes.map(ep => ep.length);

        return {
            totalExperiences: this.totalExperiences,
            totalEpisodes: this.totalEpisodes,
            storedExperiences: this.experiences.size,
            indexStats: this.index.stats(),
            episodeStats: {
                avgReward: this.mean(rewards),
                stdReward: this.std(rewards),
                maxReward: Math.max(...rewards, 0),
                avgLength: this.mean(lengths),
                successRate: episodes.filter(ep => ep.success).length / episodes.length
            }
        };
    }

    /**
     * Export experiences
     */
    export(options = {}) {
        const { format = 'json', filter = null } = options;
        
        let stream = this.query();
        if (filter) {
            stream = stream.filter(filter);
        }

        const experiences = stream.collect();

        if (format === 'json') {
            return JSON.stringify(experiences.map(e => e.toJSON()));
        }

        return experiences;
    }

    /**
     * Import experiences
     */
    import(data) {
        const experiences = typeof data === 'string' ? JSON.parse(data) : data;
        
        for (const expData of experiences) {
            const experience = new Experience(expData);
            this.experiences.set(experience.id, experience);
            this.index.add(experience);
            this.totalExperiences++;
        }
    }

    /**
     * Clear store
     */
    clear() {
        this.experiences.clear();
        this.episodes.clear();
        this.index.clear();
        this.priorities.clear();
        if (this.sumTree) this.sumTree.clear();
        this.totalExperiences = 0;
        this.totalEpisodes = 0;
    }

    mean(arr) {
        return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    }

    std(arr) {
        if (arr.length < 2) return 0;
        const m = this.mean(arr);
        return Math.sqrt(arr.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / arr.length);
    }
}

/**
 * Sum Tree for prioritized replay
 */
class SumTree {
    constructor(capacity) {
        this.capacity = capacity;
        this.tree = new Float32Array(2 * capacity - 1);
        this.data = new Array(capacity).fill(null);
        this.size = 0;
        this.writeIdx = 0;
    }

    update(idx, priority) {
        const treeIdx = idx + this.capacity - 1;
        const change = priority - this.tree[treeIdx];
        this.tree[treeIdx] = priority;
        this._propagate(treeIdx, change);
    }

    add(priority, data) {
        this.data[this.writeIdx] = data;
        this.update(this.writeIdx, priority);
        this.writeIdx = (this.writeIdx + 1) % this.capacity;
        this.size = Math.min(this.size + 1, this.capacity);
    }

    sample(k) {
        const indices = [];
        const segmentSize = this.total / k;

        for (let i = 0; i < k; i++) {
            const start = segmentSize * i;
            const target = start + Math.random() * segmentSize;
            indices.push(this._retrieve(target));
        }

        return indices;
    }

    _retrieve(target, idx = 0) {
        const left = 2 * idx + 1;
        const right = 2 * idx + 2;

        if (left >= this.tree.length) return idx - (this.capacity - 1);

        if (target <= this.tree[left]) {
            return this._retrieve(target, left);
        }
        return this._retrieve(target - this.tree[left], right);
    }

    _propagate(idx, change) {
        const parent = Math.floor((idx - 1) / 2);
        if (parent >= 0) {
            this.tree[parent] += change;
            this._propagate(parent, change);
        }
    }

    get total() {
        return this.tree[0];
    }

    get maxPriority() {
        return Math.max(...this.tree.slice(this.capacity - 1));
    }

    clear() {
        this.tree.fill(0);
        this.data.fill(null);
        this.size = 0;
        this.writeIdx = 0;
    }
}

/**
 * Skill Extraction from Experience
 */
export class SkillExtractor {
    constructor(config = {}) {
        this.config = {
            minSupport: config.minSupport ?? 3,
            minConfidence: config.minConfidence ?? 0.6,
            maxSkillLength: config.maxSkillLength ?? 10,
            ...config
        };
    }

    /**
     * Extract skills from successful episodes
     */
    extractSkills(episodes) {
        const successful = episodes.filter(ep => ep.success);
        const sequences = successful.map(ep => ep.getTrajectory());
        
        // Find common subsequences
        const patterns = this.findCommonPatterns(sequences);
        
        // Convert to skills
        return patterns.map(pattern => this.patternToSkill(pattern));
    }

    /**
     * Find common patterns
     */
    findCommonPatterns(sequences) {
        const patternCounts = new Map();

        for (const seq of sequences) {
            const patterns = this.extractPatterns(seq);
            for (const pattern of patterns) {
                const key = JSON.stringify(pattern);
                patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1);
            }
        }

        return Array.from(patternCounts.entries())
            .filter(([, count]) => count >= this.config.minSupport)
            .map(([key, count]) => ({
                pattern: JSON.parse(key),
                support: count,
                confidence: count / sequences.length
            }))
            .filter(p => p.confidence >= this.config.minConfidence)
            .sort((a, b) => b.support - a.support);
    }

    /**
     * Extract patterns from sequence
     */
    extractPatterns(sequence) {
        const patterns = [];
        
        for (let len = 2; len <= Math.min(this.config.maxSkillLength, sequence.length); len++) {
            for (let start = 0; start <= sequence.length - len; start++) {
                patterns.push(sequence.slice(start, start + len));
            }
        }

        return patterns;
    }

    /**
     * Convert pattern to skill
     */
    patternToSkill(patternData) {
        const { pattern, support, confidence } = patternData;
        
        return {
            name: `skill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'extracted',
            sequence: pattern,
            precondition: this.inferPrecondition(pattern),
            termination: this.inferTermination(pattern),
            policy: this.extractPolicy(pattern),
            metadata: { support, confidence, length: pattern.length }
        };
    }

    inferPrecondition(pattern) {
        // Infer from first state
        return (state) => {
            const firstState = pattern[0]?.state;
            if (!firstState) return true;
            
            // Simple similarity check
            return this.stateSimilarity(state, firstState) > 0.5;
        };
    }

    inferTermination(pattern) {
        const length = pattern.length;
        return (state, stepsInSkill = 0) => stepsInSkill >= length;
    }

    extractPolicy(pattern) {
        let step = 0;
        return async (state) => {
            if (step >= pattern.length) return null;
            return pattern[step++].action;
        };
    }

    stateSimilarity(s1, s2) {
        const a1 = Array.isArray(s1) ? s1 : s1.data ?? [s1];
        const a2 = Array.isArray(s2) ? s2 : s2.data ?? [s2];
        
        let dot = 0, norm1 = 0, norm2 = 0;
        const len = Math.min(a1.length, a2.length);
        
        for (let i = 0; i < len; i++) {
            dot += a1[i] * a2[i];
            norm1 += a1[i] * a1[i];
            norm2 += a2[i] * a2[i];
        }
        
        return dot / (Math.sqrt(norm1) * Math.sqrt(norm2) || 1);
    }
}

/**
 * Experience-based Learning
 */
export class ExperienceLearner {
    constructor(store, config = {}) {
        this.store = store;
        this.config = {
            batchSize: config.batchSize ?? 32,
            updateFrequency: config.updateFrequency ?? 1,
            prioritizedReplay: config.prioritizedReplay ?? false,
            ...config
        };
        
        this.learningSteps = 0;
        this.callbacks = new Map();
    }

    on(event, callback) {
        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, []);
        }
        this.callbacks.get(event).push(callback);
        return () => {
            const cbs = this.callbacks.get(event);
            const idx = cbs.indexOf(callback);
            if (idx >= 0) cbs.splice(idx, 1);
        };
    }

    emit(event, data) {
        const cbs = this.callbacks.get(event) ?? [];
        for (const cb of cbs) cb(data);
    }

    async learn(agent, options = {}) {
        const { batchSize = this.config.batchSize, prioritized = this.config.prioritizedReplay } = options;

        if (this.store.experiences.size < batchSize) {
            return null;
        }

        const samples = this.store.sample(batchSize, { prioritized });
        
        // Compute TD errors and update priorities
        if (prioritized) {
            const { losses, tdErrors } = await this.computeLosses(agent, samples);
            const priorities = tdErrors.map(e => Math.abs(e) + 1e-6);
            this.store.updatePriorities(samples.map(s => s.id), priorities);
            return { losses, priorities };
        }

        const losses = await this.computeLosses(agent, samples);
        this.learningSteps++;
        
        this.emit('learn', { step: this.learningSteps, losses });
        
        return losses;
    }

    async computeLosses(agent, samples) {
        const losses = [];
        const tdErrors = [];

        for (const sample of samples) {
            const { state, action, reward, nextState, done } = sample.toTransition();
            
            const loss = await agent.computeLoss(state, action, reward, nextState, done);
            const tdError = await agent.computeTDError(state, action, reward, nextState);
            
            losses.push(loss);
            tdErrors.push(tdError);
        }

        return {
            losses,
            tdErrors,
            meanLoss: losses.reduce((a, b) => a + b, 0) / losses.length
        };
    }

    shouldUpdate() {
        return this.learningSteps % this.config.updateFrequency === 0;
    }
}
