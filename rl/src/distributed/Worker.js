/**
 * Worker implementation for parallel execution.
 * Used by WorkerPool for distributed task execution.
 */
import { parentPort, workerData } from 'worker_threads';

class Worker {
    constructor(id, config) {
        this.id = id;
        this.config = config;
        this.status = 'idle';
        this.currentTask = null;
        this.tasksCompleted = 0;
    }

    /**
     * Execute a task.
     */
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

    /**
     * Run task based on type.
     */
    async runTask(task) {
        switch (task.type) {
            case 'rollout':
                return this.runRollout(task);
            case 'train':
                return this.train(task);
            case 'evaluate':
                return this.evaluate(task);
            case 'custom':
                return this.runCustom(task);
            default:
                throw new Error(`Unknown task type: ${task.type}`);
        }
    }

    /**
     * Run environment rollout.
     */
    async runRollout(task) {
        const { env, policy, steps, render } = task;
        
        // Import environment dynamically
        const envModule = await import(`../environments/${env}.js`);
        const EnvironmentClass = envModule[env];
        const environment = new EnvironmentClass(task.envConfig || {});
        
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
            
            if (result.terminated) break;
        }
        
        return {
            trajectory,
            totalReward,
            steps: trajectory.length
        };
    }

    /**
     * Run training step.
     */
    async train(task) {
        const { model, batch, config } = task;
        
        // Placeholder for training logic
        // In real implementation, this would update model weights
        
        return {
            loss: Math.random() * 0.5,
            accuracy: 0.5 + Math.random() * 0.5,
            updated: true
        };
    }

    /**
     * Evaluate policy.
     */
    async evaluate(task) {
        const { env, policy, episodes } = task;
        
        const rewards = [];
        
        for (let ep = 0; ep < episodes; ep++) {
            const result = await this.runRollout({
                ...task,
                steps: task.maxSteps || 500
            });
            
            rewards.push(result.totalReward);
        }
        
        return {
            meanReward: rewards.reduce((a, b) => a + b, 0) / rewards.length,
            stdReward: Math.sqrt(rewards.reduce((a, b) => a + Math.pow(b - rewards[0], 2), 0) / rewards.length),
            minReward: Math.min(...rewards),
            maxReward: Math.max(...rewards)
        };
    }

    /**
     * Run custom task.
     */
    async runCustom(task) {
        const { fn, args } = task;
        
        // Evaluate function string (sandboxed in production)
        const fnEval = new Function('...args', `return (${fn})(...args)`);
        return fnEval(...args);
    }
}

// Main worker loop
const worker = new Worker(workerData.id, workerData.config);

// Signal ready
parentPort.postMessage({ type: 'ready', workerId: worker.id });

// Handle messages from main thread
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
        
        // Signal ready for next task
        parentPort.postMessage({ type: 'ready' });
    }
});
