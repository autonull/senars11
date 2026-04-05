import {Task} from './Task.js';
import {Truth} from '../Truth.js';
import {collectTasksFromAllConcepts} from '../memory/MemoryUtils.js';
import {BaseComponent} from '@senars/core';
import {Statistics} from '@senars/core/src/util/Statistics.js';

const PRIORITY_BUCKETS = Object.freeze({
    LOW_THRESHOLD: 0.3,
    MEDIUM_THRESHOLD: 0.7
});

const DEFAULTS = Object.freeze({
    PRIORITY_THRESHOLD: 0.1,
    MIN_PRIORITY: 0.7,
    MAX_AGE: 60000,
    LIMIT: 20
});

export class TaskManager extends BaseComponent {
    constructor(memory, focus, config) {
        super(config, 'TaskManager');
        this._memory = memory;
        this._focus = focus;
        this._pendingTasks = new Map();

        this._stats = {
            totalTasksCreated: 0,
            totalTasksProcessed: 0,
            tasksPending: 0,
            createdAt: Date.now()
        };
    }

    get stats() { return {...this._stats}; }
    get pendingTasksCount() { return this._pendingTasks.size; }

    addTask(task) {
        if (!(task instanceof Task)) {throw new Error('TaskManager.addTask requires a Task instance');}

        this._pendingTasks.set(task.stamp.id, task);
        this._stats.totalTasksCreated++;
        this._stats.tasksPending = this._pendingTasks.size;
        return true;
    }

    processPendingTasks(currentTime = Date.now()) {
        const processedTasks = [];
        const priorityThreshold = this.config.priorityThreshold ?? DEFAULTS.PRIORITY_THRESHOLD;

        for (const [taskId, task] of this._pendingTasks) {
            if (this._processSingleTask(task, currentTime, priorityThreshold)) {
                processedTasks.push(task);
            }
        }

        this._pendingTasks.clear();
        this._stats.tasksPending = 0;
        return processedTasks;
    }

    _processSingleTask(task, currentTime, priorityThreshold) {
        const addedToMemory = this._memory.addTask(task, currentTime);
        if (addedToMemory) {
            if (this._focus && task.budget.priority >= priorityThreshold) {
                this._focus.addTaskToFocus(task);
            }
            this._stats.totalTasksProcessed++;
            return true;
        }
        return false;
    }

    _createTask(punctuation, term, truth = null, budget) {
        if (!truth && (punctuation === '.' || punctuation === '!')) {
            truth = new Truth(1.0, 0.9);
        }

        return new Task({
            term,
            truth,
            punctuation,
            budget: budget ?? this.config.defaultBudget
        });
    }

    createBelief(term, truth, budget) { return this._createTask('.', term, truth, budget); }
    createGoal(term, truth = null, budget) { return this._createTask('!', term, truth, budget); }
    createQuestion(term, budget) { return this._createTask('?', term, null, budget); }

    findTasksByTerm(term) {
        return this._memory.getConcept(term)?.getAllTasks() ?? [];
    }

    findTasksByType(taskType) {
        return collectTasksFromAllConcepts(this._memory, t => t.type === taskType);
    }

    findTasksByPriority(minPriority = 0, maxPriority = 1) {
        return collectTasksFromAllConcepts(this._memory,
            t => t.budget.priority >= minPriority && t.budget.priority <= maxPriority);
    }

    findRecentTasks(sinceTimestamp) {
        return collectTasksFromAllConcepts(this._memory,
            t => t.stamp.creationTime >= sinceTimestamp);
    }

    getHighestPriorityTasks(limit = 10) {
        return collectTasksFromAllConcepts(this._memory)
            .sort((a, b) => b.budget.priority - a.budget.priority)
            .slice(0, limit);
    }

    updateTaskPriority(task, newPriority) {
        const concept = this._memory.getConcept(task.term);
        if (!concept) {return false;}

        const oldTask = concept.getTask(task.stamp.id);
        if (!oldTask) {return false;}

        const newTask = oldTask.clone({budget: {...oldTask.budget, priority: newPriority}});
        return concept.replaceTask(oldTask, newTask);
    }

    removeTask(task) {
        const concept = this._memory.getConcept(task.term);
        if (!concept) {return false;}

        const removed = concept.removeTask(task);
        if (removed) {this._stats.totalTasksProcessed++;} // Interpreting removal as processing? Or creating separate stat? keeping strictly consistent with old code
        return removed;
    }

    getTasksNeedingAttention(criteria = {}) {
        const { minPriority = DEFAULTS.MIN_PRIORITY, maxAge = DEFAULTS.MAX_AGE, limit = DEFAULTS.LIMIT } = criteria;
        const currentTime = Date.now();

        return collectTasksFromAllConcepts(this._memory, task =>
            task.budget.priority >= minPriority && (currentTime - task.stamp.creationTime) <= maxAge
        )
        .sort((a, b) => b.budget.priority - a.budget.priority || b.stamp.creationTime - a.stamp.creationTime)
        .slice(0, limit);
    }

    getTaskStats() {
        const stats = {
            tasksByType: {BELIEF: 0, GOAL: 0, QUESTION: 0},
            priorityDistribution: {low: 0, medium: 0, high: 0},
            priorities: [],
            creationTimes: [],
            oldestTask: Date.now(),
            newestTask: 0
        };

        collectTasksFromAllConcepts(this._memory, task => {
            stats.tasksByType[task.type]++;
            stats.priorityDistribution[this._getPriorityBucket(task.budget.priority)]++;
            stats.priorities.push(task.budget.priority);
            stats.creationTimes.push(task.stamp.creationTime);
            stats.oldestTask = Math.min(stats.oldestTask, task.stamp.creationTime);
            stats.newestTask = Math.max(stats.newestTask, task.stamp.creationTime);
            return true;
        });

        const totalTasks = Object.values(stats.tasksByType).reduce((sum, count) => sum + count, 0);
        const priorityStats = this._calculatePriorityStats(stats.priorities);

        return {
            ...this._stats,
            tasksByType: stats.tasksByType,
            priorityDistribution: stats.priorityDistribution,
            ...priorityStats,
            oldestTask: stats.oldestTask,
            newestTask: stats.newestTask,
            ageRange: stats.newestTask - stats.oldestTask,
            taskCount: totalTasks
        };
    }

    _calculatePriorityStats(priorities) {
         return {
            average: Statistics.mean(priorities),
            std: Statistics.stdDev(priorities),
            median: Statistics.median(priorities),
            percentiles: {
                p25: Statistics.quantile(priorities, 0.25),
                p75: Statistics.quantile(priorities, 0.75),
                p95: Statistics.quantile(priorities, 0.95)
            }
        };
    }

    _getPriorityBucket(priority) {
        if (priority < PRIORITY_BUCKETS.LOW_THRESHOLD) {return 'low';}
        if (priority < PRIORITY_BUCKETS.MEDIUM_THRESHOLD) {return 'medium';}
        return 'high';
    }

    clearPendingTasks() {
        this._pendingTasks.clear();
        this._stats.tasksPending = 0;
    }

    hasTask(task) {
        return this._memory.getConcept(task.term)?.containsTask(task) ?? false;
    }

    getPendingTasks() {
        return Array.from(this._pendingTasks.values());
    }

    serialize() {
        return {
            config: this.config,
            pendingTasks: Array.from(this._pendingTasks.entries()).map(([id, task]) => ({
                id,
                task: task.serialize ? task.serialize() : null
            })),
            stats: this._stats,
            version: '1.0.0'
        };
    }

    async deserialize(data) {
        try {
            if (!data) {throw new Error('Invalid task manager data for deserialization');}

            if (data.config) {this.configure(data.config);}

            this._pendingTasks.clear();
            if (data.pendingTasks) {
                for (const {id, task: taskData} of data.pendingTasks) {
                    if (taskData) {
                        this._pendingTasks.set(id, Task.fromJSON ? Task.fromJSON(taskData) : null);
                    }
                }
            }

            if (data.stats) {this._stats = {...data.stats};}

            return true;
        } catch (error) {
            this.logError('Error during task manager deserialization', error);
            return false;
        }
    }
}
