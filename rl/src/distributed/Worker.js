import { parentPort, workerData } from 'worker_threads';
import { mergeConfig } from '../utils/ConfigHelper.js';

const WORKER_DEFAULTS = {
    maxSteps: 500,
    defaultEpisodes: 10,
    taskTimeout: 30000,
    retryAttempts: 3
};

const TASK_DEFAULTS = {
    steps: 500,
    episodes: 10,
    maxSteps: 500,
    envConfig: {}
};

const TaskExecutors = {
    async rollout(env, policy, steps, envConfig, task) {
        const envModule = await import(`../environments/${env}.js`);
        const EnvironmentClass = envModule[env];
        const environment = new EnvironmentClass(envConfig || {});

        let state = environment.reset();
        const trajectory = [];
        let totalReward = 0;

        for (let step = 0; step < steps; step++) {
            const action = policy.act(state.observation);
            const result = environment.step(action);

            trajectory.push({
                state: state.observation,
                action,
                reward: result.reward,
                nextState: result.observation,
                done: result.terminated
            });

            totalReward += result.reward;
            state = result;

            if (result.terminated) {break;}
        }

        return { trajectory, totalReward, steps: trajectory.length };
    },

    async train(model, batch, config) {
        return {
            loss: Math.random() * 0.5,
            accuracy: 0.5 + Math.random() * 0.5,
            updated: true
        };
    },

    async evaluate(env, policy, episodes, maxSteps, task) {
        const rewards = [];

        for (let ep = 0; ep < episodes; ep++) {
            const result = await this.rollout(env, policy, maxSteps || 500, task.envConfig || {}, task);
            rewards.push(result.totalReward);
        }

        const mean = rewards.reduce((a, b) => a + b, 0) / rewards.length;
        const variance = rewards.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / rewards.length;

        return {
            meanReward: mean,
            stdReward: Math.sqrt(variance),
            minReward: Math.min(...rewards),
            maxReward: Math.max(...rewards)
        };
    },

    async custom(fn, args) {
        const fnEval = new Function('...args', `return (${fn})(...args)`);
        return fnEval(...args);
    }
};

class Worker {
    constructor(id, config = {}) {
        this.id = id;
        this.config = mergeConfig(WORKER_DEFAULTS, config);
        this.status = 'idle';
        this.currentTask = null;
        this.tasksCompleted = 0;
    }

    async execute(task) {
        this.status = 'busy';
        this.currentTask = task.id;

        try {
            const result = await this.runTask(task.task);

            this.status = 'idle';
            this.currentTask = null;
            this.tasksCompleted++;

            return {
                id: task.id,
                result,
                executionTime: Date.now() - task.startedAt
            };
        } catch (error) {
            this.status = 'idle';
            this.currentTask = null;
            throw error;
        }
    }

    async runTask(task) {
        const mergedTask = { ...TASK_DEFAULTS, ...task };
        const executors = {
            rollout: () => TaskExecutors.rollout(
                mergedTask.env, mergedTask.policy, mergedTask.steps, mergedTask.envConfig, mergedTask
            ),
            train: () => TaskExecutors.train(mergedTask.model, mergedTask.batch, mergedTask.config),
            evaluate: () => TaskExecutors.evaluate(
                mergedTask.env, mergedTask.policy, mergedTask.episodes, mergedTask.maxSteps, mergedTask
            ),
            custom: () => TaskExecutors.custom(mergedTask.fn, mergedTask.args)
        };

        const executor = executors[mergedTask.type];
        if (!executor) {
            throw new Error(`Unknown task type: ${mergedTask.type}`);
        }

        return executor();
    }
}

const worker = new Worker(workerData.id, workerData.config);

parentPort.postMessage({ type: 'ready', workerId: worker.id });

parentPort.on('message', async (message) => {
    if (message.type === 'task') {
        try {
            const result = await worker.execute(message);

            parentPort.postMessage({
                type: 'result',
                id: message.id,
                result: result.result
            });
        } catch (error) {
            parentPort.postMessage({
                type: 'error',
                id: message.id,
                error: error.message
            });
        }

        parentPort.postMessage({ type: 'ready' });
    }
});
