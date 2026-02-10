import {Bag} from './Bag.js';
import {clamp} from '../util/common.js';
import {BaseComponent} from '../util/BaseComponent.js';
import {Task} from '../task/Task.js';
import {Logger} from '../util/Logger.js';

const TASK_TYPES = Object.freeze({BELIEF: 'BELIEF', GOAL: 'GOAL', QUESTION: 'QUESTION'});
const CAPACITY_DISTRIBUTION = Object.freeze({BELIEF: 0.6, GOAL: 0.3, QUESTION: 0.1});

export class Concept extends BaseComponent {
    static DEFAULT_CONFIG = {
        maxBeliefs: 100,
        maxGoals: 50,
        maxQuestions: 20,
        defaultDecayRate: 0.01,
        defaultActivationBoost: 0.1,
        maxActivation: 1.0,
        minQuality: 0,
        maxQuality: 1
    };

    constructor(term, config = {}) {
        super({...Concept.DEFAULT_CONFIG, ...config}, `Concept<${term.toString()}>`);

        this._term = term;
        this._createdAt = Date.now();
        this._lastAccessed = Date.now();
        this._lastModified = Date.now();

        this._beliefs = new Bag(this.config.maxBeliefs);
        this._goals = new Bag(this.config.maxGoals);
        this._questions = new Bag(this.config.maxQuestions);

        this._activation = 0;
        this._useCount = 0;
        this._quality = 0;
    }

    get term() { return this._term; }
    get createdAt() { return this._createdAt; }
    get lastAccessed() { return this._lastAccessed; }
    get lastModified() { return this._lastModified; }
    get activation() { return this._activation; }
    get useCount() { return this._useCount; }
    get quality() { return this._quality; }
    get priority() { return this._activation; }

    get beliefs() { return this._beliefs; }
    get goals() { return this._goals; }
    get questions() { return this._questions; }

    get totalTasks() {
        return this._beliefs.size + this._goals.size + this._questions.size;
    }

    get averagePriority() {
        if (!this.totalTasks) return 0;
        const bags = [this._beliefs, this._goals, this._questions];
        return bags.reduce((sum, bag) => sum + (bag.getAveragePriority() * bag.size), 0) / this.totalTasks;
    }

    _getStorage(taskType) {
        const storage = {
            [TASK_TYPES.BELIEF]: this._beliefs,
            [TASK_TYPES.GOAL]: this._goals,
            [TASK_TYPES.QUESTION]: this._questions
        }[taskType];

        if (!storage) throw new Error(`Unknown task type: ${taskType}`);
        return storage;
    }

    _updateActivity() {
        this._lastAccessed = Date.now();
        this._lastModified = Date.now();
    }

    addTask(task) {
        const added = this._getStorage(task.type).add(task);
        if (added) {
            this._updateActivity();
            this._useCount++;
        }
        return added;
    }

    enforceCapacity(maxTasksPerType) {
        for (const [type, factor] of Object.entries(CAPACITY_DISTRIBUTION)) {
            const bag = type === 'BELIEF' ? this._beliefs : (type === 'GOAL' ? this._goals : this._questions);
            bag.pruneTo(maxTasksPerType * factor);
        }
    }

    getTask(taskId) {
        for (const bag of [this._beliefs, this._goals, this._questions]) {
            const task = bag.find(t => t.stamp.id === taskId);
            if (task) return task;
        }
        return null;
    }

    replaceTask(oldTask, newTask) {
        const storage = this._getStorage(oldTask.type);
        return storage.remove(oldTask) && storage.add(newTask);
    }

    getHighestPriorityTask(taskType) {
        return this._getStorage(taskType).peek() || null;
    }

    getTasksByType(taskType) {
        return this._getStorage(taskType).getItemsInPriorityOrder() || [];
    }

    removeTask(task) {
        const removed = this._getStorage(task.type).remove(task);
        if (removed) this._updateActivity();
        return removed || false;
    }

    applyDecay(decayRate = this.config.defaultDecayRate) {
        [this._beliefs, this._goals, this._questions].forEach(bag => bag.applyDecay(decayRate));
        this._activation *= (1 - decayRate);
        this._updateActivity();
    }

    boostActivation(boost = this.config.defaultActivationBoost) {
        this._activation = clamp(this._activation + boost, 0, this.config.maxActivation);
        this._updateActivity();
        this._useCount++;
    }

    incrementUseCount() {
        this._useCount++;
    }

    updateQuality(qualityChange) {
        this._quality = clamp(this._quality + qualityChange, this.config.minQuality, this.config.maxQuality);
        this._lastModified = Date.now();
    }

    containsTask(task) {
        return this._beliefs.contains(task) || this._goals.contains(task) || this._questions.contains(task);
    }

    getAllTasks() {
        return [
            ...this._beliefs.getItemsInPriorityOrder(),
            ...this._goals.getItemsInPriorityOrder(),
            ...this._questions.getItemsInPriorityOrder()
        ].sort((a, b) => b.budget.priority - a.budget.priority);
    }

    updateTaskBudget(task, newBudget) {
        const storage = this._getStorage(task.type);
        return storage.remove(task) && storage.add(task.clone({budget: newBudget}));
    }

    getStats() {
        return {
            term: this._term.toString(),
            totalTasks: this.totalTasks,
            beliefsCount: this._beliefs.size,
            goalsCount: this._goals.size,
            questionsCount: this._questions.size,
            activation: this._activation,
            useCount: this._useCount,
            quality: this._quality,
            averagePriority: this.averagePriority,
            createdAt: this._createdAt,
            lastAccessed: this._lastAccessed
        };
    }

    serialize() {
        return {
            term: this._term.serialize ? this._term.serialize() : this._term.toString(),
            createdAt: this._createdAt,
            lastAccessed: this._lastAccessed,
            activation: this._activation,
            useCount: this._useCount,
            quality: this._quality,
            beliefs: this._beliefs.serialize ? this._beliefs.serialize() : null,
            goals: this._goals.serialize ? this._goals.serialize() : null,
            questions: this._questions.serialize ? this._questions.serialize() : null,
            config: this.config,
            version: '1.0.0'
        };
    }

    async deserialize(data) {
        try {
            if (!data) throw new Error('Invalid concept data');

            this._createdAt = data.createdAt || Date.now();
            this._lastAccessed = data.lastAccessed || Date.now();
            this._activation = data.activation || 0;
            this._useCount = data.useCount || 0;
            this._quality = data.quality || 0;

            if (data.config) this.configure(data.config);

            const map = { beliefs: '_beliefs', goals: '_goals', questions: '_questions' };
            await Promise.all(Object.entries(map).map(async ([key, prop]) => {
                if (data[key] && this[prop].deserialize) {
                    await this[prop].deserialize(data[key], Task.fromJSON);
                }
            }));

            return true;
        } catch (error) {
            Logger.error('Error during concept deserialization', error);
            return false;
        }
    }
}
