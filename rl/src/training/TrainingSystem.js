/**
 * Unified Training System
 * Consolidates TrainingLoop, WorkerPool, ParallelExecutor, DistributedTrainer
 */
import { Component } from '../composable/Component.js';
import { EventEmitter } from 'events';
import { Worker, fork } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { ExperienceBuffer } from '../experience/ExperienceBuffer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TRAINING_DEFAULTS = {
    episodes: 1000,
    maxSteps: 500,
    batchSize: 64,
    updateFrequency: 1,
    targetUpdateFrequency: 100,
    evalFrequency: 50,
    saveFrequency: 100,
    seed: 42,
    modelFree: true,
    modelBased: false,
    offline: false,
    multiTask: false,
    meta: false,
    hierarchical: false,
    causal: false
};

const DISTRIBUTED_DEFAULTS = {
    numWorkers: 4,
    workerType: 'thread',
    taskQueue: 'fifo',
    maxTasksPerWorker: 100,
    workerTimeout: 30000,
    syncFrequency: 100,
    aggregationMethod: 'average'
};

export class TrainingConfig {
    constructor(config = {}) {
        const merged = mergeConfig(TRAINING_DEFAULTS, config);
        Object.assign(this, merged);
        this.paradigms = {
            modelFree: merged.modelFree,
            modelBased: merged.modelBased,
            offline: merged.offline,
            multiTask: merged.multiTask,
            meta: merged.meta,
            hierarchical: merged.hierarchical,
            causal: merged.causal
        };
        this.hyperparams = config.hyperparams ?? {};
    }
}

export class EpisodeResult {
    constructor(episode, reward, steps, success = false, info = {}) {
        this.episode = episode;
        this.reward = reward;
        this.steps = steps;
        this.success = success;
        this.info = info;
        this.timestamp = Date.now();
    }

    toJSON() { return { ...this }; }
}

export class TrainingLoop extends Component {
    constructor(agent, env, config = new TrainingConfig()) {
        super(config);
        this.agent = agent;
        this.env = env;
        this.config = config;

        this.experienceBuffer = new ExperienceBuffer({
            capacity: 50000,
            batchSize: config.batchSize,
            sampleStrategy: 'prioritized',
            useCausalIndexing: config.causal
        });

        this.episodeHistory = [];
        this.currentEpisode = 0;
        this.bestReward = -Infinity;
        this.metrics = { episodesCompleted: 0, totalSteps: 0, updatesPerformed: 0 };
    }

    async onInitialize() {
        await this.experienceBuffer.initialize();
        this.emit('initialized', { config: this.config });
    }

    async run() {
        this.emit('trainingStarted', { episodes: this.config.episodes });

        for (let ep = 0; ep < this.config.episodes; ep++) {
            this.currentEpisode = ep;
            const result = await this.runEpisode();

            this.episodeHistory.push(result);
            if (result.reward > this.bestReward) this.bestReward = result.reward;
            this.metrics.episodesCompleted++;
            this.metrics.totalSteps += result.steps;

            await this.learn(result);

            if (ep % this.config.evalFrequency === 0) {
                const evalResult = await this.evaluate();
                this.emit('evaluation', { episode: ep, ...evalResult });
            }

            if (ep % this.config.saveFrequency === 0) {
                this.emit('checkpoint', { episode: ep, state: this.getState() });
            }

            if (ep % 10 === 0) {
                this.emit('progress', {
                    episode: ep,
                    reward: result.reward,
                    avgReward: this._runningAvg(10),
                    bestReward: this.bestReward
                });
            }
        }

        this.emit('trainingCompleted', { bestReward: this.bestReward, history: this.episodeHistory, metrics: this.metrics });
        return { bestReward: this.bestReward, history: this.episodeHistory, metrics: this.metrics };
    }

    async runEpisode() {
        const { observation } = this.env.reset();
        let state = observation;
        let totalReward = 0;
        let steps = 0;

        for (let step = 0; step < this.config.maxSteps; step++) {
            const action = await this.agent.act(state, {
                explorationRate: 0.1,
                useWorldModel: false
            });

            const result = this.env.step(action);
            const { observation: nextState, reward, terminated, truncated } = result;

            await this.agent.learn({ state, action, reward, nextState, done: terminated || truncated }, reward);
            await this.experienceBuffer.store({ state, action, reward, nextState, done: terminated || truncated });

            totalReward += reward;
            state = nextState;
            steps++;

            if (terminated || truncated) break;
        }

        return new EpisodeResult(this.currentEpisode, totalReward, steps, totalReward > 0);
    }

    async learn(episodeResult) {
        if (this.currentEpisode % this.config.updateFrequency !== 0) return;

        const batch = await this.experienceBuffer.sample(this.config.batchSize);
        if (batch.length === 0) return;

        for (const experience of batch) {
            await this.agent.learn(experience, experience.reward);
        }

        this.metrics.updatesPerformed++;
    }

    async evaluate(numEpisodes = 5) {
        const evalEpisodes = [];

        for (let ep = 0; ep < numEpisodes; ep++) {
            const { observation } = this.env.reset();
            let state = observation;
            let totalReward = 0;

            for (let step = 0; step < this.config.maxSteps; step++) {
                const action = await this.agent.act(state, { explorationRate: 0 });
                const result = this.env.step(action);
                totalReward += result.reward;
                state = result.observation;
                if (result.terminated || result.truncated) break;
            }

            evalEpisodes.push(totalReward);
        }

        const mean = evalEpisodes.reduce((a, b) => a + b, 0) / evalEpisodes.length;
        const std = Math.sqrt(evalEpisodes.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / evalEpisodes.length);

        return { meanReward: mean, stdReward: std, episodes: evalEpisodes };
    }

    _runningAvg(window = 100) {
        const recent = this.episodeHistory.slice(-window);
        return recent.reduce((a, b) => a + b.reward, 0) / recent.length;
    }

    getState() {
        return {
            currentEpisode: this.currentEpisode,
            bestReward: this.bestReward,
            metrics: { ...this.metrics },
            episodeHistory: this.episodeHistory.slice(-100)
        };
    }

    async onShutdown() {
        await this.experienceBuffer.shutdown();
    }
}

export class WorkerPool extends Component {
    constructor(config = {}) {
        super(mergeConfig(DISTRIBUTED_DEFAULTS, config));
        this.workers = [];
        this.taskQueue = [];
        this.activeTasks = new Map();
        this.completedTasks = [];
        this.stats = { tasksSubmitted: 0, tasksCompleted: 0, tasksFailed: 0, totalExecutionTime: 0 };
        this.eventEmitter = new EventEmitter();
    }

    async onInitialize() {
        await Promise.all(Array.from({ length: this.config.numWorkers }, (_, i) => this._spawnWorker(i)));
        this.setState('initialized', true);
    }

    async _spawnWorker(id) {
        const workerConfig = { workerData: { id, config: this.config }, stdout: true, stderr: true };
        const worker = this.config.workerType === 'process'
            ? fork(path.join(__dirname, 'Worker.js'), workerConfig)
            : new Worker(path.join(__dirname, 'Worker.js'), workerConfig);

        const workerInfo = { id, worker, status: 'idle', currentTask: null, tasksCompleted: 0, createdAt: Date.now() };

        worker.on('message', message => this._handleWorkerMessage(workerInfo, message));
        worker.on('error', error => this._handleWorkerError(workerInfo, error));
        worker.on('exit', code => this._handleWorkerExit(workerInfo, code));

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

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Task timeout after ${this.config.workerTimeout}ms`)), this.config.workerTimeout)
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

    _handleWorkerMessage(workerInfo, message) {
        if (message.type === 'ready' && workerInfo.currentTask === null) {
            this._dispatchTasks();
        }
    }

    _handleWorkerError(workerInfo, error) {
        if (workerInfo.currentTask) this._failTask(workerInfo.currentTask, error);
    }

    _handleWorkerExit(workerInfo, code) {
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

    getStats() {
        return {
            ...this.stats,
            activeTasks: this.activeTasks.size,
            queueLength: this.taskQueue.length,
            workers: this.workers.length
        };
    }

    async onShutdown() {
        await Promise.all(this.workers.map(w => this.terminateWorker(w)));
        this.workers = [];
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
            env: env.constructor?.name ?? 'Environment',
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

export class TrainingPresets {
    static dqn(config = {}) {
        return new TrainingConfig({ ...config, episodes: 500, batchSize: 32, modelBased: false });
    }

    static ppo(config = {}) {
        return new TrainingConfig({ ...config, episodes: 1000, batchSize: 64, updateFrequency: 200 });
    }

    static modelBased(config = {}) {
        return new TrainingConfig({ ...config, episodes: 500, modelBased: true });
    }

    static hierarchical(config = {}) {
        return new TrainingConfig({ ...config, episodes: 2000, hierarchical: true });
    }

    static causal(config = {}) {
        return new TrainingConfig({ ...config, episodes: 1000, causal: true });
    }

    static distributed(config = {}) {
        return { ...config, numWorkers: config.numWorkers ?? 4, syncFrequency: 100 };
    }
}
