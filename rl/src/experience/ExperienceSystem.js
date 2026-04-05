/**
 * Experience System - Extended experience management
 * Experience, Episode, ExperienceStream, ExperienceIndex, ExperienceStore, SkillExtractor, ExperienceLearner
 */
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

const SkillExtractorDefaults = {
    minSupport: 2,
    minConfidence: 0.5,
    maxSkillLength: 10
};

const ExperienceLearnerDefaults = {
    batchSize: 32,
    updateFrequency: 1
};

export class Experience {
    constructor({ state, action, reward, nextState, done, info = {} }) {
        const mergedInfo = { ...EXPERIENCE_INFO_DEFAULTS, ...info };
        this.id = info.id ?? generateId('exp');
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
            for (const exp of self._iterator) {if (predicate(exp)) {yield exp;}}
        })());
    }

    map(fn) {
        const self = this;
        return new ExperienceStream((function*() {
            for (const exp of self._iterator) {yield fn(exp);}
        })());
    }

    take(n) {
        const self = this;
        return new ExperienceStream((function*() {
            let count = 0;
            for (const exp of self._iterator) {
                if (count++ >= n) {break;}
                yield exp;
            }
        })());
    }

    reduce(fn, acc) {
        for (const exp of this._iterator) {acc = fn(acc, exp);}
        return acc;
    }

    collect() { return Array.from(this._iterator); }
    forEach(fn) { for (const exp of this._iterator) {fn(exp);} return this; }
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
        const {id} = experience;
        this.timeline.push(id);

        experience.info.tags.forEach(tag => {
            if (!this.byTag.has(tag)) {this.byTag.set(tag, new Set());}
            this.byTag.get(tag).add(id);
        });

        const epId = experience.info.episode;
        if (!this.byEpisode.has(epId)) {this.byEpisode.set(epId, new Set());}
        this.byEpisode.get(epId).add(id);

        const rewardBin = Math.floor(experience.reward * 10);
        if (!this.byReward.has(rewardBin)) {this.byReward.set(rewardBin, new Set());}
        this.byReward.get(rewardBin).add(id);

        const stateHash = hashState(experience.state);
        if (!this.byState.has(stateHash)) {this.byState.set(stateHash, new Set());}
        this.byState.get(stateHash).add(id);
    }

    remove(id) {
        [this.byTag, this.byEpisode, this.byReward, this.byState].forEach(set => set.forEach(s => s.delete(id)));
        const idx = this.timeline.indexOf(id);
        if (idx >= 0) {this.timeline.splice(idx, 1);}
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
                if (bin * 0.1 < minReward) {ids.forEach(id => candidates.delete(id));}
            });
        }

        if (state) {
            const stateHash = hashState(state);
            const stateExps = this.byState.get(stateHash) ?? new Set();
            candidates = new Set([...candidates].filter(id => stateExps.has(id)));
        }

        const result = Array.from(candidates);
        return limit ? result.slice(0, limit) : result;
    }

    clear() {
        this.byTag.clear();
        this.byEpisode.clear();
        this.byReward.clear();
        this.byState.clear();
        this.timeline = [];
    }

    getStats() {
        return {
            total: this.timeline.length,
            tags: this.byTag.size,
            episodes: this.byEpisode.size,
            rewardBins: this.byReward.size,
            states: this.byState.size
        };
    }
}

export class ExperienceStore {
    constructor(config = {}) {
        this.config = mergeConfig(EXPERIENCE_DEFAULTS, config);
        this.buffer = [];
        this.episodes = new Map();
        this.index = new ExperienceIndex();
        this.currentEpisode = null;
    }

    async initialize() {
        this.currentEpisode = new Episode();
        return this;
    }

    add(experience) {
        const exp = experience instanceof Experience ? experience : new Experience(experience);
        this.buffer.push(exp);
        this.index.add(exp);

        if (this.currentEpisode) {
            this.currentEpisode.add(exp);
        }

        if (this.buffer.length > this.config.capacity) {
            const removed = this.buffer.shift();
            this.index.remove(removed.id);
        }

        return exp;
    }

    record(state, action, reward, nextState, done, info = {}) {
        return this.add(new Experience({ state, action, reward, nextState, done, info }));
    }

    startEpisode(metadata = {}) {
        if (this.currentEpisode) {this.endEpisode();}
        this.currentEpisode = new Episode();
        Object.entries(metadata).forEach(([k, v]) => this.currentEpisode.setMetadata(k, v));
        return this.currentEpisode;
    }

    endEpisode() {
        if (!this.currentEpisode) {return null;}
        this.currentEpisode.finalize();
        const episode = this.currentEpisode;
        this.episodes.set(episode.id, episode);
        this.currentEpisode = null;
        return episode;
    }

    sample(batchSize = this.config.batchSize) {
        if (this.buffer.length === 0) {return [];}
        const indices = new Set();
        while (indices.size < Math.min(batchSize, this.buffer.length)) {
            indices.add(Math.floor(Math.random() * this.buffer.length));
        }
        return Array.from(indices).map(i => this.buffer[i]);
    }

    query(options) {
        const results = this.index.query(options).map(id => this.buffer.find(e => e.id === id));
        return ExperienceStream.from(results);
    }

    getEpisode(id) { return this.episodes.get(id); }
    getEpisodes() { return Array.from(this.episodes.values()); }
    getSuccessfulEpisodes() { return this.getEpisodes().filter(e => e.success); }

    getStats() {
        return {
            buffer: this.buffer.length,
            capacity: this.config.capacity,
            episodes: this.episodes.size,
            totalEpisodes: this.episodes.size,
            totalExperiences: this.buffer.length,
            index: this.index.getStats()
        };
    }

    clear() {
        this.buffer = [];
        this.episodes.clear();
        this.index.clear();
        this.currentEpisode = null;
    }
}

export class SkillExtractor {
    constructor(config = {}) {
        this.config = mergeConfig(SkillExtractorDefaults, config);
        this.patterns = new Map();
        this.support = new Map();
    }

    extractSkills(episodes) {
        episodes.forEach(ep => this.processEpisode(ep));
        return this.getSkills();
    }

    processEpisode(episode) {
        const states = episode.getStates();
        const actions = episode.getActions();
        const rewards = episode.getRewards();

        for (let len = 2; len <= this.config.maxSkillLength; len++) {
            for (let i = 0; i <= states.length - len; i++) {
                const pattern = {
                    states: states.slice(i, i + len),
                    actions: actions.slice(i, i + len),
                    totalReward: rewards.slice(i, i + len).reduce((a, b) => a + b, 0)
                };
                const key = this._patternKey(pattern);

                if (!this.patterns.has(key)) {
                    this.patterns.set(key, { pattern, count: 0, totalReward: 0 });
                }

                const entry = this.patterns.get(key);
                entry.count++;
                entry.totalReward += pattern.totalReward;
            }
        }
    }

    _patternKey(pattern) {
        return JSON.stringify({
            states: pattern.states.map(s => serializeValue(s)),
            actions: pattern.actions
        });
    }

    getSkills(minSupport = this.config.minSupport, minConfidence = this.config.minConfidence) {
        const skills = [];

        this.patterns.forEach((entry, key) => {
            const support = entry.count / this.patterns.size;
            const confidence = entry.totalReward / entry.count;

            if (support >= minSupport && confidence >= minConfidence) {
                skills.push({
                    pattern: entry.pattern,
                    support,
                    confidence,
                    avgReward: confidence
                });
            }
        });

        return skills.sort((a, b) => b.support - a.support);
    }

    clear() {
        this.patterns.clear();
        this.support.clear();
    }
}

export class ExperienceLearner {
    constructor(agent, experienceStore, config = {}) {
        this.agent = agent;
        this.store = experienceStore;
        this.config = mergeConfig(ExperienceLearnerDefaults, config);
        this.step = 0;
    }

    async learn() {
        this.step++;

        if (this.step % this.config.updateFrequency !== 0) {return null;}

        const batch = this.store.sample(this.config.batchSize);
        if (batch.length === 0) {return null;}

        let totalLoss = 0;
        for (const exp of batch) {
            const loss = await this.agent.learn(exp.toTransition(), exp.reward);
            if (loss) {totalLoss += loss.loss ?? 0;}
        }

        return {
            batch_size: batch.length,
            avg_loss: totalLoss / batch.length,
            step: this.step
        };
    }

    async train(numSteps) {
        const results = [];
        for (let i = 0; i < numSteps; i++) {
            const result = await this.learn();
            if (result) {results.push(result);}
        }
        return results;
    }
}
