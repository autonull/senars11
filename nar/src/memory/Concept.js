import {Bag} from './Bag.js';
import {clamp} from '@senars/core/src/util/common.js';
import {BaseComponent} from '@senars/core/src/util/BaseComponent.js';
import {Task} from '../task/Task.js';
import {Logger} from '@senars/core/src/util/Logger.js';
import { CONCEPT_CAPACITY, CONCEPT_ACTIVATION, CONCEPT_DECAY } from '../config/ConceptConstants.js';

const TASK_TYPES = Object.freeze({BELIEF: 'BELIEF', GOAL: 'GOAL', QUESTION: 'QUESTION'});

export class Concept extends BaseComponent {
    static DEFAULT_CONFIG = {
        maxBeliefs: 100,
        maxGoals: 50,
        maxQuestions: 20,
        defaultDecayRate: 0.01,
        defaultActivationBoost: CONCEPT_DECAY.PROPAGATION_STRENGTH,
        maxActivation: CONCEPT_ACTIVATION.MAX_ACTIVATION,
        minQuality: 0,
        maxQuality: 1
    };

    constructor(term, config = {}) {
        super({...Concept.DEFAULT_CONFIG, ...config}, `Concept<${term.toString()}>`);

        this._term = term;
        this._createdAt = Date.now();
        this._lastAccessed = Date.now();
        this._lastModified = Date.now();

        this._storage = {
            [TASK_TYPES.BELIEF]: new Bag(this.config.maxBeliefs),
            [TASK_TYPES.GOAL]: new Bag(this.config.maxGoals),
            [TASK_TYPES.QUESTION]: new Bag(this.config.maxQuestions)
        };

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

    get beliefs() { return this._storage[TASK_TYPES.BELIEF]; }
    get goals() { return this._storage[TASK_TYPES.GOAL]; }
    get questions() { return this._storage[TASK_TYPES.QUESTION]; }

    get totalTasks() {
        return this.beliefs.size + this.goals.size + this.questions.size;
    }

    get _bags() {
        return Object.values(this._storage);
    }

    get averagePriority() {
        if (!this.totalTasks) return 0;
        return this._bags.reduce((sum, bag) => sum + (bag.getAveragePriority() * bag.size), 0) / this.totalTasks;
    }

    _getStorage(taskType) {
        const storage = this._storage[taskType];
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
        const CAPACITY_DISTRIBUTION = {
            [TASK_TYPES.BELIEF]: CONCEPT_CAPACITY.BELIEF_CAPACITY,
            [TASK_TYPES.GOAL]: CONCEPT_CAPACITY.GOAL_CAPACITY,
            [TASK_TYPES.QUESTION]: CONCEPT_CAPACITY.QUESTION_CAPACITY
        };

        for (const [type, factor] of Object.entries(CAPACITY_DISTRIBUTION)) {
            this._getStorage(type).pruneTo(maxTasksPerType * factor);
        }
    }

    getTask(taskId) {
        for (const bag of this._bags) {
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
        for (const bag of this._bags) {
            bag.applyDecay(decayRate);
        }
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
        return this._bags.some(bag => bag.contains(task));
    }

    getAllTasks() {
        return this._bags
            .flatMap(bag => bag.getItemsInPriorityOrder())
            .sort((a, b) => b.budget.priority - a.budget.priority);
    }

    updateTaskBudget(task, newBudget) {
        const storage = this._getStorage(task.type);
        // Removing and re-adding ensures the bag updates priority ordering if needed
        return storage.remove(task) && storage.add(task.clone({budget: newBudget}));
    }

    getStats() {
        return {
            term: this._term.toString(),
            totalTasks: this.totalTasks,
            beliefsCount: this.beliefs.size,
            goalsCount: this.goals.size,
            questionsCount: this.questions.size,
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
            beliefs: this.beliefs.serialize ? this.beliefs.serialize() : null,
            goals: this.goals.serialize ? this.goals.serialize() : null,
            questions: this.questions.serialize ? this.questions.serialize() : null,
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

            const map = {
                beliefs: this.beliefs,
                goals: this.goals,
                questions: this.questions
            };

            await Promise.all(
                Object.entries(map).map(([key, bag]) =>
                    data[key] && bag.deserialize ? bag.deserialize(data[key], Task.fromJSON) : Promise.resolve()
                )
            );

            return true;
        } catch (error) {
            Logger.error('Error during concept deserialization', error);
            return false;
        }
    }
}
