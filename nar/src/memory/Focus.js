import {clamp} from '@senars/core/src/util/common.js';
import {BaseComponent} from '@senars/core/src/util/BaseComponent.js';
import {Logger} from '@senars/core/src/util/Logger.js';
import {Task} from '../task/Task.js';

const DEFAULT_CONFIG = Object.freeze({
    maxFocusSets: 5,
    defaultFocusSetSize: 100,
    attentionDecayRate: 0.05
});

export class Focus extends BaseComponent {
    constructor(config = {}) {
        super(config, 'Focus');
        this._config = { ...DEFAULT_CONFIG, ...config };
        this._focusSets = new Map();
        this._currentFocus = null;

        this.createFocusSet('default');
        this.setFocus('default');
    }

    createFocusSet(name, maxSize) {
        if (this._focusSets.has(name) || this._focusSets.size >= this._config.maxFocusSets) return false;
        this._focusSets.set(name, new FocusSet(name, maxSize || this._config.defaultFocusSetSize));
        return true;
    }

    setFocus(name) {
        if (!this._focusSets.has(name)) return false;
        this._currentFocus = name;
        return true;
    }

    getCurrentFocus() {
        return this._currentFocus;
    }

    getTasks(count = 10) {
        return this._focusSets.get(this._currentFocus)?.getTasks(count) ?? [];
    }

    addTaskToFocus(task) {
        return this._focusSets.get(this._currentFocus)?.addTask(task) ?? false;
    }

    removeTaskFromFocus(taskHash) {
        let removed = false;
        for (const focusSet of this._focusSets.values()) {
            if (focusSet.removeTask(taskHash)) removed = true;
        }
        return removed;
    }

    updateAttention(name, delta) {
        this._focusSets.get(name)?.updateAttention(delta);
    }

    applyDecay() {
        for (const focusSet of this._focusSets.values()) {
            focusSet.applyDecay(this._config.attentionDecayRate);
        }
    }

    getStats() {
        const stats = {};
        for (const [name, focusSet] of this._focusSets) {
            stats[name] = focusSet.getStats();
        }
        return {
            currentFocus: this._currentFocus,
            totalFocusSets: this._focusSets.size,
            focusSets: stats
        };
    }

    clear() {
        for (const focusSet of this._focusSets.values()) focusSet.clear();
        this._focusSets.clear();
        this._currentFocus = null;
    }

    serialize() {
        const focusSetData = {};
        for (const [name, focusSet] of this._focusSets) {
            focusSetData[name] = focusSet.serialize();
        }

        return {
            config: this._config,
            currentFocus: this._currentFocus,
            focusSets: focusSetData,
            version: '1.0.0'
        };
    }

    async deserialize(data) {
        try {
            if (!data) throw new Error('Invalid focus data');

            if (data.config) this._config = { ...this._config, ...data.config };
            this.clear();

            if (data.focusSets) {
                for (const [name, focusSetData] of Object.entries(data.focusSets)) {
                    if (focusSetData) {
                        const focusSet = new FocusSet(name, focusSetData.maxSize);
                        await focusSet.deserialize(focusSetData);
                        this._focusSets.set(name, focusSet);
                    }
                }
            }

            if (data.currentFocus) this._currentFocus = data.currentFocus;
            return true;
        } catch (error) {
            Logger.error('Error during focus deserialization', error);
            return false;
        }
    }
}

const DEFAULT_SCORE_WEIGHTS = Object.freeze({
    priorityWeight: 0.4,
    activationWeight: 0.3,
    complexityWeight: 0.2,
    recencyWeight: 0.1
});

class FocusSet {
    constructor(name, maxSize) {
        this._name = name;
        this._maxSize = maxSize;
        this._tasks = new Map();
        this._attentionScore = 0;
        this._accessCount = 0;
        this._createdAt = Date.now();
        this._lastAccessed = Date.now();
    }

    addTask(task) {
        const taskHash = task.stamp.id;
        if (this._tasks.has(taskHash)) return false;

        if (this._tasks.size >= this._maxSize) {
            this._removeLowestPriorityTask();
        }

        this._tasks.set(taskHash, {
            task,
            priority: task.budget.priority,
            addedAt: Date.now()
        });

        this._attentionScore = Math.max(this._attentionScore, task.budget.priority * 0.5);
        this._updateAccess();
        return true;
    }

    removeTask(taskHash) {
        const removed = this._tasks.delete(taskHash);
        if (removed) this._updateAccess();
        return removed;
    }

    getTasks(count = 10) {
        return Array.from(this._tasks.values())
            .sort((a, b) => b.priority - a.priority)
            .slice(0, count)
            .map(entry => entry.task);
    }

    getTasksByCompositeScore(count = 10, scoringOptions = {}) {
        const options = { ...DEFAULT_SCORE_WEIGHTS, ...scoringOptions };

        const scoredTasks = Array.from(this._tasks.values()).map(entry => {
            const { task, priority, addedAt } = entry;
            const complexityScore = this._calculateTaskComplexityScore(task);
            const recencyScore = this._calculateRecencyScore(addedAt);

            const compositeScore =
                (priority * options.priorityWeight) +
                (priority * options.activationWeight) +
                (complexityScore * options.complexityWeight) +
                (recencyScore * options.recencyWeight);

            return { task, compositeScore, complexityScore };
        });

        scoredTasks.sort((a, b) => b.compositeScore - a.compositeScore);

        if (options.targetComplexity !== undefined && options.targetComplexity !== null) {
            scoredTasks.sort((a, b) =>
                Math.abs(a.complexityScore - options.targetComplexity) -
                Math.abs(b.complexityScore - options.targetComplexity)
            );
        }

        return scoredTasks.slice(0, count).map(st => st.task);
    }

    updateAttention(delta) {
        this._attentionScore = clamp(this._attentionScore + delta, 0, 1);
    }

    applyDecay(decayRate) {
        this._attentionScore *= (1 - decayRate);
        for (const entry of this._tasks.values()) {
            entry.priority *= (1 - decayRate);
        }
    }

    getStats() {
        return {
            name: this._name,
            size: this._tasks.size,
            maxSize: this._maxSize,
            attentionScore: this._attentionScore,
            accessCount: this._accessCount,
            utilization: this._tasks.size / this._maxSize,
            createdAt: this._createdAt,
            lastAccessed: this._lastAccessed,
            age: Date.now() - this._createdAt
        };
    }

    clear() {
        this._tasks.clear();
        this._attentionScore = 0;
    }

    serialize() {
        return {
            name: this._name,
            maxSize: this._maxSize,
            tasks: Array.from(this._tasks.entries()).map(([hash, entry]) => ({
                hash,
                priority: entry.priority,
                addedAt: entry.addedAt,
                task: entry.task.serialize ? entry.task.serialize() : null
            })),
            attentionScore: this._attentionScore,
            accessCount: this._accessCount,
            createdAt: this._createdAt,
            lastAccessed: this._lastAccessed,
            version: '1.0.0'
        };
    }

    async deserialize(data) {
        try {
            if (!data) throw new Error('Invalid focus set data');

            this._name = data.name || this._name;
            this._maxSize = data.maxSize || this._maxSize;
            this._attentionScore = data.attentionScore || 0;
            this._accessCount = data.accessCount || 0;
            this._createdAt = data.createdAt || Date.now();
            this._lastAccessed = data.lastAccessed || Date.now();

            this._tasks.clear();
            if (data.tasks) {
                for (const entry of data.tasks) {
                    if (entry?.task) {
                        const task = Task.fromJSON ? Task.fromJSON(entry.task) : null;
                        if (task) {
                            this._tasks.set(entry.hash, {
                                task,
                                priority: entry.priority || 0,
                                addedAt: entry.addedAt || Date.now()
                            });
                        }
                    }
                }
            }
            return true;
        } catch (error) {
            Logger.error('Error during focus set deserialization', error);
            return false;
        }
    }

    _removeLowestPriorityTask() {
        if (this._tasks.size === 0) return;

        let minPriority = Infinity;
        let minKey = null;

        for (const [key, val] of this._tasks) {
            if (val.priority < minPriority) {
                minPriority = val.priority;
                minKey = key;
            }
        }

        if (minKey !== null) this._tasks.delete(minKey);
    }

    _updateAccess() {
        this._lastAccessed = Date.now();
        this._accessCount++;
    }

    _calculateTaskComplexityScore(task) {
        const comps = task.term?.components;
        return comps ? Math.min(1, 0.1 + (comps.length * 0.3)) : 0.1;
    }

    _calculateRecencyScore(addedAt) {
        return Math.exp(-(Date.now() - addedAt) / 600000); // 10 minutes decay
    }
}
