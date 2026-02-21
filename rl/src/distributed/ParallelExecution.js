/**
 * Distributed and Parallel Execution Framework
 * Enables scaling RL training across multiple workers and machines.
 */
import { Component } from '../composable/Component.js';
import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Worker Pool for parallel execution.
 */
export class WorkerPool extends Component {
    constructor(config = {}) {
        super({
            numWorkers: 4,
            workerType: 'thread', // 'thread' or 'process'
            taskQueue: 'fifo',
            maxTasksPerWorker: 100,
            workerTimeout: 30000,
            ...config
        });
        
        this.workers = [];
        this.taskQueue = [];
        this.activeTasks = new Map();
        this.completedTasks = [];
        this.stats = {
            tasksSubmitted: 0,
            tasksCompleted: 0,
            tasksFailed: 0,
            totalExecutionTime: 0
        };
        
        this.eventEmitter = new EventEmitter();
    }

    async onInitialize() {
        // Spawn workers
        for (let i = 0; i < this.config.numWorkers; i++) {
            await this.spawnWorker(i);
        }
        
        this.setState('initialized', true);
        this.setState('availableWorkers', this.config.numWorkers);
    }

    async onShutdown() {
        // Terminate all workers
        for (const worker of this.workers) {
            await this.terminateWorker(worker);
        }
        this.workers = [];
    }

    /**
     * Spawn a new worker.
     */
    async spawnWorker(id) {
        const workerConfig = {
            workerData: { id, config: this.config },
            stdout: true,
            stderr: true
        };

        let worker;
        
        if (this.config.workerType === 'process') {
            worker = fork(path.join(__dirname, 'Worker.js'), workerConfig);
        } else {
            worker = new Worker(path.join(__dirname, 'Worker.js'), workerConfig);
        }

        const workerInfo = {
            id,
            worker,
            status: 'idle',
            currentTask: null,
            tasksCompleted: 0,
            createdAt: Date.now()
        };

        // Set up message handlers
        worker.on('message', (message) => this.handleWorkerMessage(workerInfo, message));
        worker.on('error', (error) => this.handleWorkerError(workerInfo, error));
        worker.on('exit', (code) => this.handleWorkerExit(workerInfo, code));

        this.workers.push(workerInfo);
        this.emit('workerSpawned', { id });
        
        return workerInfo;
    }

    /**
     * Submit a task to the pool.
     */
    async submit(task) {
        const taskInfo = {
            id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            task,
            submittedAt: Date.now(),
            status: 'pending'
        };

        this.stats.tasksSubmitted++;
        this.taskQueue.push(taskInfo);

        // Try to dispatch immediately
        this.dispatchTasks();

        // Return promise for task completion
        return new Promise((resolve, reject) => {
            taskInfo.resolve = resolve;
            taskInfo.reject = reject;
            this.activeTasks.set(taskInfo.id, taskInfo);
        });
    }

    /**
     * Submit multiple tasks (batch).
     */
    async submitBatch(tasks) {
        const promises = tasks.map(task => this.submit(task));
        return Promise.allSettled(promises);
    }

    /**
     * Dispatch tasks to available workers.
     */
    dispatchTasks() {
        const availableWorkers = this.workers.filter(w => w.status === 'idle');
        
        while (availableWorkers.length > 0 && this.taskQueue.length > 0) {
            const worker = availableWorkers.pop();
            const task = this.taskQueue.shift();
            
            this.executeTask(worker, task);
        }
    }

    /**
     * Execute task on worker.
     */
    executeTask(worker, taskInfo) {
        worker.status = 'busy';
        worker.currentTask = taskInfo.id;
        taskInfo.status = 'running';
        taskInfo.workerId = worker.id;
        taskInfo.startedAt = Date.now();

        // Set timeout
        const timeout = setTimeout(() => {
            this.handleTaskTimeout(worker, taskInfo);
        }, this.config.workerTimeout);
        
        taskInfo.timeout = timeout;

        // Send task to worker
        worker.worker.postMessage({
            type: 'task',
            id: taskInfo.id,
            task: taskInfo.task
        });
    }

    /**
     * Handle worker message.
     */
    handleWorkerMessage(worker, message) {
        switch (message.type) {
            case 'ready':
                worker.status = 'idle';
                worker.currentTask = null;
                this.dispatchTasks();
                break;
                
            case 'result':
                this.handleTaskResult(worker, message);
                break;
                
            case 'error':
                this.handleTaskError(worker, message);
                break;
                
            case 'progress':
                this.handleTaskProgress(worker, message);
                break;
        }
    }

    /**
     * Handle task result.
     */
    handleTaskResult(worker, message) {
        const taskInfo = this.activeTasks.get(message.id);
        if (!taskInfo) return;

        clearTimeout(taskInfo.timeout);
        
        const executionTime = Date.now() - taskInfo.startedAt;
        
        this.stats.tasksCompleted++;
        this.stats.totalExecutionTime += executionTime;
        worker.tasksCompleted++;

        this.completedTasks.push({
            id: message.id,
            result: message.result,
            executionTime,
            workerId: worker.id
        });

        // Resolve promise
        taskInfo.resolve({
            id: message.id,
            result: message.result,
            executionTime,
            workerId: worker.id
        });

        // Clean up
        this.activeTasks.delete(message.id);
        
        // Mark worker as available
        worker.status = 'idle';
        worker.currentTask = null;
        
        this.emit('taskComplete', { taskId: message.id, result: message.result });
        
        // Dispatch next task
        this.dispatchTasks();
    }

    /**
     * Handle task error.
     */
    handleTaskError(worker, message) {
        const taskInfo = this.activeTasks.get(message.id);
        if (!taskInfo) return;

        clearTimeout(taskInfo.timeout);
        
        this.stats.tasksFailed++;
        
        taskInfo.reject(new Error(message.error));
        this.activeTasks.delete(message.id);
        
        worker.status = 'idle';
        worker.currentTask = null;
        
        this.emit('taskError', { taskId: message.id, error: message.error });
        
        this.dispatchTasks();
    }

    /**
     * Handle task timeout.
     */
    handleTaskTimeout(worker, taskInfo) {
        this.stats.tasksFailed++;
        
        taskInfo.reject(new Error(`Task timeout after ${this.config.workerTimeout}ms`));
        this.activeTasks.delete(taskInfo.id);
        
        // Terminate and respawn worker
        this.terminateWorker(worker);
        this.spawnWorker(worker.id);
        
        this.emit('taskTimeout', { taskId: taskInfo.id });
    }

    /**
     * Handle worker error.
     */
    handleWorkerError(worker, error) {
        console.error(`Worker ${worker.id} error:`, error);
        this.emit('workerError', { workerId: worker.id, error });
    }

    /**
     * Handle worker exit.
     */
    handleWorkerExit(worker, code) {
        console.log(`Worker ${worker.id} exited with code ${code}`);
        this.emit('workerExit', { workerId: worker.id, code });
        
        // Remove from pool
        this.workers = this.workers.filter(w => w.id !== worker.id);
        
        // Fail any active tasks on this worker
        for (const [taskId, taskInfo] of this.activeTasks) {
            if (taskInfo.workerId === worker.id) {
                taskInfo.reject(new Error(`Worker ${worker.id} exited`));
                this.activeTasks.delete(taskId);
                this.stats.tasksFailed++;
            }
        }
    }

    /**
     * Terminate a worker.
     */
    async terminateWorker(worker) {
        return new Promise((resolve) => {
            if (worker.worker.terminate) {
                worker.worker.terminate().then(resolve);
            } else {
                worker.worker.kill();
                resolve();
            }
        });
    }

    /**
     * Get pool statistics.
     */
    getStats() {
        return {
            ...this.stats,
            queueLength: this.taskQueue.length,
            activeTasks: this.activeTasks.size,
            availableWorkers: this.workers.filter(w => w.status === 'idle').length,
            totalWorkers: this.workers.length,
            avgExecutionTime: this.stats.tasksCompleted > 0 
                ? this.stats.totalExecutionTime / this.stats.tasksCompleted 
                : 0
        };
    }

    /**
     * Get worker status.
     */
    getWorkerStatus() {
        return this.workers.map(w => ({
            id: w.id,
            status: w.status,
            currentTask: w.currentTask,
            tasksCompleted: w.tasksCompleted,
            uptime: Date.now() - w.createdAt
        }));
    }

    /**
     * Scale worker pool.
     */
    async scale(numWorkers) {
        const current = this.workers.length;
        
        if (numWorkers > current) {
            // Scale up
            for (let i = current; i < numWorkers; i++) {
                await this.spawnWorker(i);
            }
        } else if (numWorkers < current) {
            // Scale down (wait for workers to become idle)
            const toRemove = this.workers
                .filter(w => w.status === 'idle')
                .slice(0, current - numWorkers);
            
            for (const worker of toRemove) {
                await this.terminateWorker(worker);
                this.workers = this.workers.filter(w => w.id !== worker.id);
            }
        }
        
        this.setState('availableWorkers', this.workers.length);
        this.emit('scaled', { numWorkers: this.workers.length });
    }
}

/**
 * Distributed Experience Buffer for parallel sampling.
 */
export class DistributedExperienceBuffer extends Component {
    constructor(config = {}) {
        super({
            capacity: 100000,
            numBuffers: 4,
            batchSize: 32,
            sampleStrategy: 'uniform', // 'uniform', 'prioritized'
            syncInterval: 100,
            ...config
        });
        
        this.buffers = [];
        this.priorities = new Map();
        this.totalCount = 0;
        this.sampleCount = 0;
    }

    async onInitialize() {
        // Initialize distributed buffers
        for (let i = 0; i < this.config.numBuffers; i++) {
            this.buffers.push({
                id: i,
                experiences: [],
                capacity: Math.floor(this.config.capacity / this.config.numBuffers)
            });
        }
        
        this.setState('initialized', true);
    }

    /**
     * Add experience to buffer.
     */
    add(experience, workerId = null) {
        const targetBuffer = workerId !== null 
            ? this.buffers[workerId % this.buffers.length]
            : this.selectBuffer();
        
        if (targetBuffer.experiences.length >= targetBuffer.capacity) {
            // Remove oldest experience
            targetBuffer.experiences.shift();
        }
        
        targetBuffer.experiences.push({
            ...experience,
            addedAt: Date.now(),
            priority: 1.0
        });
        
        this.totalCount++;
        this.priorities.set(this.totalCount - 1, 1.0);
        
        // Periodic sync
        if (this.totalCount % this.config.syncInterval === 0) {
            this.syncBuffers();
        }
    }

    /**
     * Sample batch of experiences.
     */
    sample(batchSize = null) {
        const size = batchSize || this.config.batchSize;
        
        if (this.totalCount === 0) {
            return [];
        }
        
        const samples = [];
        
        if (this.config.sampleStrategy === 'prioritized') {
            return this.samplePrioritized(size);
        }
        
        // Uniform sampling
        for (let i = 0; i < size; i++) {
            const bufferIdx = Math.floor(Math.random() * this.buffers.length);
            const buffer = this.buffers[bufferIdx];
            
            if (buffer.experiences.length > 0) {
                const expIdx = Math.floor(Math.random() * buffer.experiences.length);
                samples.push(buffer.experiences[expIdx]);
            }
        }
        
        this.sampleCount += samples.length;
        return samples;
    }

    /**
     * Prioritized experience replay sampling.
     */
    samplePrioritized(size) {
        const samples = [];
        const priorities = Array.from(this.priorities.entries());
        
        if (priorities.length === 0) return [];
        
        // Calculate priority weights
        const totalPriority = priorities.reduce((sum, [, p]) => sum + p, 0);
        
        for (let i = 0; i < size; i++) {
            let r = Math.random() * totalPriority;
            
            for (const [idx, priority] of priorities) {
                r -= priority;
                if (r <= 0) {
                    // Find experience with this index
                    const exp = this.getExperienceByIdx(idx);
                    if (exp) {
                        samples.push(exp);
                    }
                    break;
                }
            }
        }
        
        this.sampleCount += samples.length;
        return samples;
    }

    /**
     * Get experience by global index.
     */
    getExperienceByIdx(idx) {
        let cumulative = 0;
        
        for (const buffer of this.buffers) {
            if (idx < cumulative + buffer.experiences.length) {
                return buffer.experiences[idx - cumulative];
            }
            cumulative += buffer.experiences.length;
        }
        
        return null;
    }

    /**
     * Update priority of experience.
     */
    updatePriority(idx, priority) {
        this.priorities.set(idx, priority);
    }

    /**
     * Select buffer for insertion.
     */
    selectBuffer() {
        // Select buffer with most space
        return this.buffers.reduce((a, b) => 
            a.experiences.length < b.experiences.length ? a : b
        );
    }

    /**
     * Sync buffers (merge and redistribute).
     */
    syncBuffers() {
        // Collect all experiences
        const allExperiences = [];
        for (const buffer of this.buffers) {
            allExperiences.push(...buffer.experiences);
        }
        
        // Shuffle
        for (let i = allExperiences.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allExperiences[i], allExperiences[j]] = [allExperiences[j], allExperiences[i]];
        }
        
        // Redistribute
        for (let i = 0; i < this.buffers.length; i++) {
            const start = Math.floor(i * allExperiences.length / this.buffers.length);
            const end = Math.floor((i + 1) * allExperiences.length / this.buffers.length);
            this.buffers[i].experiences = allExperiences.slice(start, end);
        }
    }

    /**
     * Get buffer statistics.
     */
    getStats() {
        return {
            totalCount: this.totalCount,
            sampleCount: this.sampleCount,
            buffers: this.buffers.map(b => ({
                id: b.id,
                size: b.experiences.length,
                capacity: b.capacity
            })),
            avgPriority: this.priorities.size > 0
                ? Array.from(this.priorities.values()).reduce((a, b) => a + b, 0) / this.priorities.size
                : 0
        };
    }

    /**
     * Clear all buffers.
     */
    clear() {
        for (const buffer of this.buffers) {
            buffer.experiences = [];
        }
        this.priorities.clear();
        this.totalCount = 0;
        this.sampleCount = 0;
    }

    serialize() {
        return {
            buffers: this.buffers.map(b => ({
                id: b.id,
                experiences: b.experiences.slice(-100) // Last 100 per buffer
            })),
            totalCount: this.totalCount,
            sampleCount: this.sampleCount
        };
    }
}

/**
 * Synchronous parameter server for distributed training.
 */
export class ParameterServer extends Component {
    constructor(config = {}) {
        super({
            updateMode: 'async', // 'async', 'sync', 'semi_async'
            stalenessThreshold: 10,
            aggregationMethod: 'mean', // 'mean', 'median', 'trimmed_mean'
            ...config
        });
        
        this.parameters = new Map();
        this.gradients = [];
        this.version = 0;
        this.updateHistory = [];
    }

    /**
     * Initialize parameters.
     */
    initializeParameters(paramSpec) {
        for (const [name, spec] of Object.entries(paramSpec)) {
            this.parameters.set(name, {
                value: spec.initialValue || new Float32Array(spec.shape.reduce((a, b) => a * b, 1)),
                shape: spec.shape,
                version: 0,
                lastUpdate: Date.now()
            });
        }
        
        this.setState('initialized', true);
    }

    /**
     * Get current parameters.
     */
    getParameters(names = null) {
        if (names) {
            const result = {};
            for (const name of names) {
                const param = this.parameters.get(name);
                if (param) {
                    result[name] = { value: param.value, version: this.version };
                }
            }
            return result;
        }
        
        return Object.fromEntries(
            Array.from(this.parameters.entries()).map(([name, p]) => [name, p.value])
        );
    }

    /**
     * Push gradients from worker.
     */
    pushGradients(gradients, workerId) {
        this.gradients.push({
            gradients,
            workerId,
            version: this.version,
            timestamp: Date.now()
        });
        
        // Trigger update if enough gradients collected
        if (this.config.updateMode === 'sync' && this.gradients.length >= this.config.numWorkers) {
            this.aggregateAndApply();
        } else if (this.config.updateMode === 'async') {
            this.applyGradients(gradients);
        }
    }

    /**
     * Aggregate gradients and apply update.
     */
    aggregateAndApply() {
        if (this.gradients.length === 0) return;
        
        // Aggregate gradients
        const aggregated = this.aggregateGradients();
        
        // Apply update
        this.applyGradients(aggregated);
        
        // Clear gradient buffer
        this.gradients = [];
    }

    /**
     * Aggregate gradients from multiple workers.
     */
    aggregateGradients() {
        const aggregated = {};
        
        for (const { gradients } of this.gradients) {
            for (const [name, grad] of Object.entries(gradients)) {
                if (!aggregated[name]) {
                    aggregated[name] = new Float32Array(grad.length);
                }
                
                for (let i = 0; i < grad.length; i++) {
                    aggregated[name][i] += grad[i];
                }
            }
        }
        
        // Average
        const numGradients = this.gradients.length;
        for (const name of Object.keys(aggregated)) {
            for (let i = 0; i < aggregated[name].length; i++) {
                aggregated[name][i] /= numGradients;
            }
        }
        
        return aggregated;
    }

    /**
     * Apply gradients to parameters.
     */
    applyGradients(gradients, learningRate = 0.01) {
        for (const [name, grad] of Object.entries(gradients)) {
            const param = this.parameters.get(name);
            if (!param) continue;
            
            // SGD update
            for (let i = 0; i < param.value.length; i++) {
                param.value[i] -= learningRate * grad[i];
            }
            
            param.version = this.version;
            param.lastUpdate = Date.now();
        }
        
        this.version++;
        this.updateHistory.push({
            version: this.version,
            timestamp: Date.now(),
            gradientsApplied: Object.keys(gradients).length
        });
        
        this.emit('parametersUpdated', { version: this.version });
    }

    /**
     * Get parameter statistics.
     */
    getStats() {
        return {
            version: this.version,
            numParameters: this.parameters.size,
            pendingGradients: this.gradients.length,
            updateHistory: this.updateHistory.slice(-100)
        };
    }

    serialize() {
        return {
            parameters: Object.fromEntries(
                Array.from(this.parameters.entries()).map(([name, p]) => [
                    name,
                    { value: Array.from(p.value), version: p.version }
                ])
            ),
            version: this.version
        };
    }
}
