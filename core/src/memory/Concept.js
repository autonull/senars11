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
        this._beliefs = new Bag(this.config.maxBeliefs);
        this._goals = new Bag(this.config.maxGoals);
        this._questions = new Bag(this.config.maxQuestions);
        this._activation = 0;
        this._useCount = 0;
        this._quality = 0;
    }

    get term() {
        return this._term;
    }

    get createdAt() {
        return this._createdAt;
    }

    get lastAccessed() {
        return this._lastAccessed;
    }

    get activation() {
        return this._activation;
    }

    get useCount() {
        return this._useCount;
    }

    get quality() {
        return this._quality;
    }

    get priority() {
        return this._activation;
    }

    get beliefs() {
        return this._beliefs;
    }

    get goals() {
        return this._goals;
    }

    get questions() {
        return this._questions;
    }

    get totalTasks() {
        return this._beliefs.size + this._goals.size + this._questions.size;
    }

    get averagePriority() {
        return this.totalTasks ? this._calculateWeightedAveragePriority() : 0;
    }

    _calculateWeightedAveragePriority() {
        const bags = [this._beliefs, this._goals, this._questions];
        const totalWeightedPriority = bags.reduce((sum, bag) => sum + (bag.getAveragePriority() * bag.size), 0);
        return totalWeightedPriority / this.totalTasks;
    }

    _getStorage(taskType) {
        const storageMap = {
            [TASK_TYPES.BELIEF]: this._beliefs,
            [TASK_TYPES.GOAL]: this._goals,
            [TASK_TYPES.QUESTION]: this._questions
        };

        const storage = storageMap[taskType];
        if (!storage) {
            const validTypes = Object.values(TASK_TYPES).join(', ');
            throw new Error(`Unknown task type: ${taskType}. Expected ${validTypes}.`);
        }
        return storage;
    }

    _updateLastAccessed() {
        this._lastAccessed = Date.now();
    }

    addTask(task) {
        const storage = this._getStorage(task.type);
        const added = storage.add(task);
        if (added) {
            this._updateLastAccessed();
            this._useCount++;
        }
        return added;
    }

    enforceCapacity(maxTasksPerType) {
        for (const [type, factor] of Object.entries(CAPACITY_DISTRIBUTION)) {
            const bag = this[`_${type.toLowerCase()}s`]; // Convert BELIEF to _beliefs
            if (bag) {
                bag.pruneTo(maxTasksPerType * factor);
            }
        }
    }

    getTask(taskId) {
        // Find early exit using loop is more efficient here than map/find combo
        for (const bag of [this._beliefs, this._goals, this._questions]) {
            const task = bag.find(t => t.stamp.id === taskId);
            if (task) return task;
        }
        return null;
    }

    replaceTask(oldTask, newTask) {
        const storage = this._getStorage(oldTask.type);
        if (storage.remove(oldTask)) {
            return storage.add(newTask);
        }
        return false;
    }

    getHighestPriorityTask(taskType) {
        return this._getStorage(taskType).peek() || null;
    }

    getTasksByType(taskType) {
        return this._getStorage(taskType).getItemsInPriorityOrder() || [];
    }

    removeTask(task) {
        const removed = this._getStorage(task.type).remove(task);
        if (removed) {
            this._updateLastAccessed();
        }
        return removed || false;
    }

    applyDecay(decayRate = this.config.defaultDecayRate) {
        for (const bag of [this._beliefs, this._goals, this._questions]) {
            bag.applyDecay(decayRate);
        }
        this._activation *= (1 - decayRate);
        this._updateLastAccessed();
    }

    boostActivation(activationBoost = this.config.defaultActivationBoost) {
        this._activation = clamp(this._activation + activationBoost, 0, this.config.maxActivation);
        this._updateLastAccessed();
        this.incrementUseCount();
    }

    incrementUseCount() {
        this._useCount++;
    }

    updateQuality(qualityChange) {
        this._quality = clamp(this._quality + qualityChange, this.config.minQuality, this.config.maxQuality);
    }

    containsTask(task) {
        return this._beliefs.contains(task) || this._goals.contains(task) || this._questions.contains(task);
    }

    getAllTasks() {
        const allTasks = [
            ...this._beliefs.getItemsInPriorityOrder(),
            ...this._goals.getItemsInPriorityOrder(),
            ...this._questions.getItemsInPriorityOrder()
        ];
        return allTasks.sort((a, b) => b.budget.priority - a.budget.priority);
    }

    updateTaskBudget(task, newBudget) {
        const storage = this._getStorage(task.type);
        return this._replaceTaskInStorage(storage, task, task.clone({budget: newBudget}));
    }

    _replaceTaskInStorage(storage, oldTask, newTask) {
        return storage.remove(oldTask) && storage.add(newTask);
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
            if (!data) {
                throw new Error('Invalid concept data for deserialization');
            }

            this._createdAt = data.createdAt || Date.now();
            this._lastAccessed = data.lastAccessed || Date.now();
            this._activation = data.activation || 0;
            this._useCount = data.useCount || 0;
            this._quality = data.quality || 0;

            if (data.config) {
                this.configure(data.config);
            }

            const deserializationMap = [
                {dataKey: 'beliefs', bagKey: '_beliefs'},
                {dataKey: 'goals', bagKey: '_goals'},
                {dataKey: 'questions', bagKey: '_questions'}
            ];

            await Promise.all(deserializationMap.map(async ({dataKey, bagKey}) => {
                if (data[dataKey] && this[bagKey].deserialize) {
                    await this[bagKey].deserialize(data[dataKey], Task.fromJSON);
                }
            }));

            return true;
        } catch (error) {
            Logger.error('Error during concept deserialization', error);
            return false;
        }
    }
}
