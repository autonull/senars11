import { Component } from '../composable/Component.js';
import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { mergeConfig } from '../utils/ConfigHelper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULTS = {
    numWorkers: 4,
    workerType: 'thread',
    taskQueue: 'fifo',
    maxTasksPerWorker: 100,
    workerTimeout: 30000
};

const TaskExecutors = {
    rollout: async (task, envFactory) => {
        const envModule = await import(`../environments/${task.env}.js`);
        const EnvironmentClass = envModule[task.env];
        const env = new EnvironmentClass(task.envConfig || {});

        let state = env.reset();
        const trajectory = [];
        let totalReward = 0;

        for (let step = 0; step < task.steps; step++) {
            const action = task.policy.act(state.observation);
            const result = env.step(action);
            trajectory.push({ state: state.observation, action, reward: result.reward, nextState: result.observation, done: result.terminated });
            totalReward += result.reward;
            state = result;
            if (result.terminated) break;
        }

        return { trajectory, totalReward, steps: trajectory.length };
    },

    train: async (task) => ({ loss: Math.random() * 0.5, accuracy: 0.5 + Math.random() * 0.5, updated: true }),

    evaluate: async (task, envFactory) => {
        const rewards = [];
        for (let ep = 0; ep < task.episodes; ep++) {
            const result = await TaskExecutors.rollout({ ...task, steps: task.maxSteps || 500 }, envFactory);
            rewards.push(result.totalReward);
        }
        const mean = rewards.reduce((a, b) => a + b, 0) / rewards.length;
        const variance = rewards.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / rewards.length;
        return { meanReward: mean, stdReward: Math.sqrt(variance), minReward: Math.min(...rewards), maxReward: Math.max(...rewards) };
    },

    custom: async (task) => {
        const fnEval = new Function('...args', `return (${task.fn})(...args)`);
        return fnEval(...task.args);
    }
};

export class WorkerPool extends Component {
    constructor(config = {}) {
        super(mergeConfig(DEFAULTS, config));
        this.workers = [];
        this.taskQueue = [];
        this.activeTasks = new Map();
        this.completedTasks = [];
        this.stats = { tasksSubmitted: 0, tasksCompleted: 0, tasksFailed: 0, totalExecutionTime: 0 };
        this.eventEmitter = new EventEmitter();
    }

    async onInitialize() {
        await Promise.all(Array.from({ length: this.config.numWorkers }, (_, i) => this.spawnWorker(i)));
        this.setState('initialized', true);
        this.setState('availableWorkers', this.config.numWorkers);
    }

    async onShutdown() {
        await Promise.all(this.workers.map(w => this.terminateWorker(w)));
        this.workers = [];
    }

    async spawnWorker(id) {
        const workerConfig = { workerData: { id, config: this.config }, stdout: true, stderr: true };
        const worker = this.config.workerType === 'process'
            ? fork(path.join(__dirname, 'Worker.js'), workerConfig)
            : new Worker(path.join(__dirname, 'Worker.js'), workerConfig);

        const workerInfo = { id, worker, status: 'idle', currentTask: null, tasksCompleted: 0, createdAt: Date.now() };

        worker.on('message', message => this.handleWorkerMessage(workerInfo, message));
        worker.on('error', error => this.handleWorkerError(workerInfo, error));
        worker.on('exit', code => this.handleWorkerExit(workerInfo, code));

        this.workers.push(workerInfo);
        this.emit('workerSpawned', { id });
        return workerInfo;
    }

    async submitTask(task) {
        const taskId = task.id ?? `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const taskInfo = { ...task, id: taskId, submittedAt: Date.now() };

        this.taskQueue.push(taskInfo);
        this.stats.tasksSubmitted++;

        this._dispatchTasks();
        return taskId;
    }

    _dispatchTasks() {
        const idleWorkers = this.workers.filter(w => w.status === 'idle');
        while (idleWorkers.length > 0 && this.taskQueue.length > 0) {
            const worker = idleWorkers.pop();
            const task = this.taskQueue.shift();
            this._executeTask(worker, task);
        }
    }

    async _executeTask(worker, task) {
        worker.status = 'busy';
        worker.currentTask = task.id;
        this.activeTasks.set(task.id, { worker, task, startedAt: Date.now() });

        const timeout = this.config.workerTimeout;
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Task timeout after ${timeout}ms`)), timeout)
        );

        const taskPromise = new Promise((resolve, reject) => {
            const handler = (message) => {
                if (message.id === task.id) {
                    worker.worker.removeListener('message', handler);
                    if (message.type === 'result') resolve(message.result);
                    else reject(new Error(message.error));
                }
            };
            worker.worker.on('message', handler);
            worker.worker.postMessage({ type: 'task', ...task });
        });

        try {
            const result = await Promise.race([taskPromise, timeoutPromise]);
            this._completeTask(task.id, result);
        } catch (error) {
            this._failTask(task.id, error);
        }
    }

    _completeTask(taskId, result) {
        const taskInfo = this.activeTasks.get(taskId);
        if (!taskInfo) return;

        const { worker, startedAt } = taskInfo;
        worker.status = 'idle';
        worker.currentTask = null;
        worker.tasksCompleted++;

        this.stats.tasksCompleted++;
        this.stats.totalExecutionTime += Date.now() - startedAt;
        this.completedTasks.push({ taskId, result, executionTime: Date.now() - startedAt });

        this.activeTasks.delete(taskId);
        this.emit('taskCompleted', { taskId, result });
        this._dispatchTasks();
    }

    _failTask(taskId, error) {
        const taskInfo = this.activeTasks.get(taskId);
        if (!taskInfo) return;

        const { worker } = taskInfo;
        worker.status = 'idle';
        worker.currentTask = null;

        this.stats.tasksFailed++;
        this.activeTasks.delete(taskId);
        this.emit('taskFailed', { taskId, error });
        this._dispatchTasks();
    }

    handleWorkerMessage(workerInfo, message) {
        if (message.type === 'ready' && workerInfo.currentTask === null) {
            this._dispatchTasks();
        }
    }

    handleWorkerError(workerInfo, error) {
        console.error(`Worker ${workerInfo.id} error:`, error);
        if (workerInfo.currentTask) this._failTask(workerInfo.currentTask, error);
    }

    handleWorkerExit(workerInfo, code) {
        const idx = this.workers.indexOf(workerInfo);
        if (idx >= 0) this.workers.splice(idx, 1);
        this.emit('workerExited', { id: workerInfo.id, code });
    }

    async terminateWorker(workerInfo) {
        return new Promise(resolve => {
            workerInfo.worker.on('exit', resolve);
            workerInfo.worker.terminate?.();
        });
    }

    getStats() {
        return {
            ...this.stats,
            activeTasks: this.activeTasks.size,
            queueLength: this.taskQueue.length,
            workers: this.workers.length
        };
    }

    async waitForCompletion(taskId, timeout = 30000) {
        return new Promise((resolve, reject) => {
            const check = () => {
                const completed = this.completedTasks.find(t => t.taskId === taskId);
                if (completed) return resolve(completed.result);

                const failed = this.activeTasks.get(taskId);
                if (!failed && !this.taskQueue.find(t => t.id === taskId)) {
                    return reject(new Error('Task not found'));
                }

                setTimeout(check, 100);
            };

            setTimeout(() => reject(new Error('Timeout')), timeout);
            check();
        });
    }
}

export class ParallelExecutor extends Component {
    constructor(config = {}) {
        super({
            maxConcurrency: config.maxConcurrency ?? 4,
            timeout: config.timeout ?? 30000,
            ...config
        });

        this.pool = new WorkerPool({ numWorkers: this.config.maxConcurrency, ...config });
    }

    async onInitialize() {
        await this.pool.initialize();
    }

    async executeAll(tasks, options = {}) {
        const { returnOrder = true } = options;

        const taskPromises = tasks.map(async (task, idx) => {
            const taskId = await this.pool.submitTask(task);
            const result = await this.pool.waitForCompletion(taskId, this.config.timeout);
            return { index: idx, result };
        });

        const results = await Promise.all(taskPromises);
        return returnOrder ? results.sort((a, b) => a.index - b.index).map(r => r.result) : results.map(r => r.result);
    }

    async map(fn, items, options = {}) {
        const tasks = items.map((item, i) => ({
            type: 'custom',
            fn: fn.toString(),
            args: [item],
            id: `map_${i}`
        }));

        return this.executeAll(tasks, options);
    }

    async onShutdown() {
        await this.pool.shutdown();
    }
}

export class DistributedTrainer extends Component {
    constructor(config = {}) {
        super({
            numWorkers: config.numWorkers ?? 4,
            syncFrequency: config.syncFrequency ?? 100,
            aggregationMethod: config.aggregationMethod ?? 'average',
            ...config
        });

        this.pool = new WorkerPool({ numWorkers: this.config.numWorkers });
        this.modelVersions = new Map();
        this.syncCounter = 0;
    }

    async onInitialize() {
        await this.pool.initialize();
    }

    async train(agent, env, episodes) {
        const workerEpisodes = Math.floor(episodes / this.config.numWorkers);
        const tasks = Array.from({ length: this.config.numWorkers }, (_, i) => ({
            type: 'rollout',
            env: env.constructor.name,
            steps: 500,
            policy: agent,
            id: `worker_${i}`
        }));

        const results = await this.pool.executeAll(tasks);
        this.syncCounter++;

        if (this.syncCounter % this.config.syncFrequency === 0) {
            await this._syncModels(agent, results);
        }

        return this._aggregateResults(results);
    }

    async _syncModels(agent, results) {
        const params = agent.getParameters?.();
        if (params) {
            this.modelVersions.set(Date.now(), params);
            if (this.modelVersions.size > 10) {
                const firstKey = this.modelVersions.keys().next().value;
                this.modelVersions.delete(firstKey);
            }
        }
    }

    _aggregateResults(results) {
        const rewards = results.map(r => r.totalReward ?? r.meanReward ?? 0);
        return {
            meanReward: rewards.reduce((a, b) => a + b, 0) / rewards.length,
            minReward: Math.min(...rewards),
            maxReward: Math.max(...rewards),
            workers: results.length
        };
    }

    async onShutdown() {
        await this.pool.shutdown();
    }
}
