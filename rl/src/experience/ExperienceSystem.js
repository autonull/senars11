import { mergeConfig } from '../utils/ConfigHelper.js';
import { SumTree, generateId, serializeValue, hashState } from '../utils/DataStructures.js';

const EXPERIENCE_DEFAULTS = {
    capacity: 100000,
    episodeCapacity: 10000,
    priorityReplay: false,
    nStep: 1,
    gamma: 0.99,
    minSupport: 3,
    minConfidence: 0.6,
    maxSkillLength: 10,
    batchSize: 32,
    updateFrequency: 1,
    prioritizedReplay: false
};

const EXPERIENCE_INFO_DEFAULTS = {
    timestamp: null,
    episode: 0,
    step: 0,
    priority: 1.0,
    tags: []
};

const SUM_TREE_DEFAULTS = {
    epsilon: 1e-6,
    alpha: 0.6,
    beta: 0.4
};

const SkillExtractorDefaults = {
    minSupport: 3,
    minConfidence: 0.6,
    maxSkillLength: 10,
    stateSimilarityThreshold: 0.5
};

const ExperienceLearnerDefaults = {
    batchSize: 32,
    updateFrequency: 1,
    prioritizedReplay: false
};

export class Experience {
    constructor({ state, action, reward, nextState, done, info = {} }) {
        const mergedInfo = { ...EXPERIENCE_INFO_DEFAULTS, ...info };
        this.id = info.id ?? generateId();
        this.state = state;
        this.action = action;
        this.reward = reward;
        this.nextState = nextState;
        this.done = done;
        this.info = {
            timestamp: mergedInfo.timestamp ?? Date.now(),
            episode: mergedInfo.episode,
            step: mergedInfo.step,
            priority: mergedInfo.priority,
            tags: mergedInfo.tags,
            ...info
        };
        this.metadata = new Map();
    }

    withReward(reward) { return new Experience({ ...this, reward }); }
    withPriority(priority) { return new Experience({ ...this, info: { ...this.info, priority } }); }
    withTag(tag) { return new Experience({ ...this, info: { ...this.info, tags: [...this.info.tags, tag] } }); }

    setMetadata(key, value) { this.metadata.set(key, value); return this; }
    getMetadata(key) { return this.metadata.get(key); }

    toTransition() {
        return { state: this.state, action: this.action, reward: this.reward, nextState: this.nextState, done: this.done };
    }

    toJSON() {
        return {
            id: this.id,
            state: serializeValue(this.state),
            action: this.action,
            reward: this.reward,
            nextState: serializeValue(this.nextState),
            done: this.done,
            info: this.info
        };
    }
}

export class ExperienceStream {
    constructor(iterator) { this._iterator = iterator; }

    static from(iterable) { return new ExperienceStream(iterable[Symbol.iterator]()); }
    static empty() { return new ExperienceStream((function*() {})()); }

    filter(predicate) {
        const self = this;
        return new ExperienceStream((function*() {
            for (const exp of self._iterator) if (predicate(exp)) yield exp;
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
            for (const exp of self._iterator) { if (count++ >= n) break; yield exp; }
        })());
    }

    sortBy(comparator) {
        const items = this.collect();
        items.sort(comparator);
        return ExperienceStream.from(items);
    }

    sample(k) {
        const items = this.collect().sort(() => Math.random() - 0.5);
        return ExperienceStream.from(items.slice(0, k));
    }

    collect() { return Array.from(this._iterator); }
    reduce(fn, initial) {
        let acc = initial;
        for (const exp of this._iterator) acc = fn(acc, exp);
        return acc;
    }

    forEach(fn) { for (const exp of this._iterator) fn(exp); return this; }
    [Symbol.iterator]() { return this._iterator; }
}

export class Episode {
    constructor(id = null) {
        this.id = id ?? generateId('ep');
        this.experiences = [];
        this.startTime = Date.now();
        this.endTime = null;
        this.metadata = new Map();
    }

    add(experience) { this.experiences.push(experience); return this; }
    addAll(experiences) { this.experiences.push(...experiences); return this; }

    get length() { return this.experiences.length; }
    get totalReward() { return this.experiences.reduce((sum, e) => sum + e.reward, 0); }
    get success() { return this.experiences.length > 0 && this.experiences.at(-1).done && this.totalReward > 0; }
    get duration() { return (this.endTime ?? Date.now()) - this.startTime; }

    getTrajectory() { return this.experiences.map(e => e.toTransition()); }
    getStates() { return this.experiences.map(e => e.state); }
    getActions() { return this.experiences.map(e => e.action); }
    getRewards() { return this.experiences.map(e => e.reward); }

    finalize() { this.endTime = Date.now(); return this; }
    setMetadata(key, value) { this.metadata.set(key, value); return this; }
    getMetadata(key) { return this.metadata.get(key); }
    stream() { return ExperienceStream.from(this.experiences); }

    toJSON() {
        return {
            id: this.id, length: this.length, totalReward: this.totalReward,
            success: this.success, duration: this.duration,
            experiences: this.experiences.map(e => e.toJSON())
        };
    }
}

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
        this.timeline.push(id);

        experience.info.tags.forEach(tag => {
            if (!this.byTag.has(tag)) this.byTag.set(tag, new Set());
            this.byTag.get(tag).add(id);
        });

        const epId = experience.info.episode;
        if (!this.byEpisode.has(epId)) this.byEpisode.set(epId, new Set());
        this.byEpisode.get(epId).add(id);

        const rewardBin = Math.floor(experience.reward * 10);
        if (!this.byReward.has(rewardBin)) this.byReward.set(rewardBin, new Set());
        this.byReward.get(rewardBin).add(id);

        const stateHash = hashState(experience.state);
        if (!this.byState.has(stateHash)) this.byState.set(stateHash, new Set());
        this.byState.get(stateHash).add(id);
    }

    remove(id) {
        [this.byTag, this.byEpisode, this.byReward, this.byState].forEach(set => set.forEach(s => s.delete(id)));
        const idx = this.timeline.indexOf(id);
        if (idx >= 0) this.timeline.splice(idx, 1);
    }

    query(options = {}) {
        const { tags, episode, minReward, maxReward, state, limit } = options;
        let candidates = new Set(this.timeline);

        if (tags) {
            tags.forEach(tag => {
                const tagged = this.byTag.get(tag) ?? new Set();
                candidates = new Set([...candidates].filter(id => tagged.has(id)));
            });
        }

        if (episode !== undefined) {
            const epExps = this.byEpisode.get(episode) ?? new Set();
            candidates = new Set([...candidates].filter(id => epExps.has(id)));
        }

        if (minReward !== undefined) {
            this.byReward.forEach((ids, bin) => {
                if (bin * 0.1 < minReward) ids.forEach(id => candidates.delete(id));
            });
        }

        if (state) {
            candidates = this.byState.get(hashState(state)) ?? new Set();
        }

        let result = Array.from(candidates);
        if (limit) result = result.slice(0, limit);
        return result;
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
        [this.byTag, this.byEpisode, this.byReward, this.byState].forEach(m => m.clear());
        this.timeline = [];
    }
}

export class ExperienceStore {
    constructor(config = {}) {
        this.config = mergeConfig(EXPERIENCE_DEFAULTS, config);
        this.experiences = new Map();
        this.episodes = new Map();
        this.index = new ExperienceIndex();
        this.currentEpisode = null;
        this.totalExperiences = 0;
        this.totalEpisodes = 0;
        this.priorities = new Map();
        this.sumTree = this.config.priorityReplay ? new SumTree(this.config.capacity) : null;
    }

    startEpisode(metadata = {}) {
        this.currentEpisode = new Episode();
        Object.entries(metadata).forEach(([key, value]) => this.currentEpisode.setMetadata(key, value));
        return this.currentEpisode;
    }

    record(state, action, reward, nextState, done, info = {}) {
        if (!this.currentEpisode) this.startEpisode();

        const experience = new Experience({
            state, action, reward, nextState, done,
            info: { ...info, episode: this.currentEpisode.id, step: this.currentEpisode.length }
        });

        this.currentEpisode.add(experience);
        this.experiences.set(experience.id, experience);
        this.index.add(experience);

        if (this.sumTree) this.sumTree.update(this.totalExperiences, experience.info.priority);

        this.totalExperiences++;
        if (done) this.finalizeEpisode();

        return experience;
    }

    finalizeEpisode() {
        if (!this.currentEpisode) return null;

        const episode = this.currentEpisode.finalize();
        this.episodes.set(episode.id, episode);
        this.totalEpisodes++;

        if (this.config.nStep > 1) this.computeNStepReturns(episode);

        this.currentEpisode = null;
        return episode;
    }

    computeNStepReturns(episode) {
        const { nStep: n, gamma } = this.config;
        const experiences = episode.experiences;

        for (let t = 0; t < experiences.length; t++) {
            let G = 0;
            for (let k = 0; k < n && t + k < experiences.length; k++) {
                G += Math.pow(gamma, k) * experiences[t + k].reward;
            }
            if (t + n < experiences.length) {
                G += Math.pow(gamma, n) * experiences[t + n].reward;
            }
            experiences[t].nStepReturn = G;
        }
    }

    query(options = {}) {
        const ids = this.index.query(options);
        const experiences = ids.map(id => this.experiences.get(id)).filter(e => e !== undefined);
        return ExperienceStream.from(experiences);
    }

    sample(k = 32, options = {}) {
        const { prioritized = false } = options;
        if (prioritized && this.sumTree) return this.samplePrioritized(k);
        return this.query(options).sample(k).collect();
    }

    samplePrioritized(k) {
        const indices = this.sumTree.sample(k);
        const exps = Array.from(this.experiences.values());
        return indices.map(i => exps[i]).filter(e => e !== undefined);
    }

    updatePriorities(experienceIds, priorities) {
        if (!this.config.priorityReplay) return;

        experienceIds.forEach((id, i) => {
            const exp = this.experiences.get(id);
            if (exp) {
                exp.info.priority = priorities[i];
                const idx = Array.from(this.experiences.keys()).indexOf(id);
                if (idx >= 0 && this.sumTree) this.sumTree.update(idx, priorities[i]);
            }
        });
    }

    getEpisode(episodeId) { return this.episodes.get(episodeId); }

    getSuccessfulEpisodes(limit = 100) {
        return Array.from(this.episodes.values())
            .filter(ep => ep.success)
            .sort((a, b) => b.totalReward - a.totalReward)
            .slice(0, limit);
    }

    getRecentEpisodes(limit = 100) {
        return Array.from(this.episodes.values())
            .sort((a, b) => b.startTime - a.startTime)
            .slice(0, limit);
    }

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

    export(options = {}) {
        const { format = 'json', filter = null } = options;
        let stream = this.query();
        if (filter) stream = stream.filter(filter);
        const experiences = stream.collect();
        return format === 'json' ? JSON.stringify(experiences.map(e => e.toJSON())) : experiences;
    }

    import(data) {
        const experiences = typeof data === 'string' ? JSON.parse(data) : data;
        experiences.forEach(expData => {
            const experience = new Experience(expData);
            this.experiences.set(experience.id, experience);
            this.index.add(experience);
            this.totalExperiences++;
        });
    }

    clear() {
        this.experiences.clear();
        this.episodes.clear();
        this.index.clear();
        this.priorities.clear();
        if (this.sumTree) this.sumTree.clear();
        this.totalExperiences = 0;
        this.totalEpisodes = 0;
    }

    mean(arr) { return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
    std(arr) {
        if (arr.length < 2) return 0;
        const m = this.mean(arr);
        return Math.sqrt(arr.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / arr.length);
    }
}

export class SkillExtractor {
    constructor(config = {}) {
        this.config = mergeConfig(SkillExtractorDefaults, config);
    }

    extractSkills(episodes) {
        const successful = episodes.filter(ep => ep.success);
        const sequences = successful.map(ep => ep.getTrajectory());
        const patterns = this.findCommonPatterns(sequences);
        return patterns.map(pattern => this.patternToSkill(pattern));
    }

    findCommonPatterns(sequences) {
        const patternCounts = new Map();

        sequences.forEach(seq => {
            this.extractPatterns(seq).forEach(pattern => {
                const key = JSON.stringify(pattern);
                patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1);
            });
        });

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

    extractPatterns(sequence) {
        const patterns = [];
        const maxLen = Math.min(this.config.maxSkillLength, sequence.length);

        for (let len = 2; len <= maxLen; len++) {
            for (let start = 0; start <= sequence.length - len; start++) {
                patterns.push(sequence.slice(start, start + len));
            }
        }
        return patterns;
    }

    patternToSkill(patternData) {
        const { pattern, support, confidence } = patternData;
        return {
            name: generateId('skill'),
            type: 'extracted',
            sequence: pattern,
            precondition: this.inferPrecondition(pattern),
            termination: this.inferTermination(pattern),
            policy: this.extractPolicy(pattern),
            metadata: { support, confidence, length: pattern.length }
        };
    }

    inferPrecondition(pattern) {
        const firstState = pattern[0]?.state;
        return (state) => {
            if (!firstState) return true;
            return this.stateSimilarity(state, firstState) > this.config.stateSimilarityThreshold;
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

export class ExperienceLearner {
    constructor(store, config = {}) {
        this.store = store;
        this.config = mergeConfig(ExperienceLearnerDefaults, config);
        this.learningSteps = 0;
        this.callbacks = new Map();
    }

    on(event, callback) {
        if (!this.callbacks.has(event)) this.callbacks.set(event, []);
        this.callbacks.get(event).push(callback);
        return () => {
            const cbs = this.callbacks.get(event);
            const idx = cbs.indexOf(callback);
            if (idx >= 0) cbs.splice(idx, 1);
        };
    }

    emit(event, data) {
        const cbs = this.callbacks.get(event) ?? [];
        cbs.forEach(cb => cb(data));
    }

    async learn(agent, options = {}) {
        const { batchSize = this.config.batchSize, prioritized = this.config.prioritizedReplay } = options;

        if (this.store.experiences.size < batchSize) return null;

        const samples = this.store.sample(batchSize, { prioritized });

        if (prioritized) {
            const { losses, tdErrors } = await this.computeLosses(agent, samples);
            const priorities = tdErrors.map(e => Math.abs(e) + SUM_TREE_DEFAULTS.epsilon);
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

    shouldUpdate() { return this.learningSteps % this.config.updateFrequency === 0; }
}
