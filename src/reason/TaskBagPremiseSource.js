import {PremiseSource} from './PremiseSource.js';
import {randomWeightedSelect} from './utils/randomWeightedSelect.js';
import {mergeConfig, sleep} from './utils/common.js';
import {logError, ReasonerError} from './utils/error.js';

/**
 * A PremiseSource that draws from a TaskBag with configurable sampling objectives.
 */
export class TaskBagPremiseSource extends PremiseSource {
    /**
     * @param {Memory} memory - The memory to draw from (should contain a taskBag).
     * @param {object} samplingObjectives - Configuration for the sampling strategy.
     * Supported objectives:
     * - priority: Sample tasks based on their priority value (default: true)
     * - recency: Favor tasks that are closest to a specific target time (default: false)
     * - punctuation: Focus on Goals or Questions (default: false)
     * - novelty: Favor tasks that have participated in fewer reasoning steps (default: false)
     * - targetTime: Specific time to measure closeness to (default: current time when used)
     * - weights: Custom weights for different sampling strategies (default: {})
     * - dynamic: Enable dynamic strategy adaptation based on performance (default: false)
     */
    constructor(memory, samplingObjectives) {
        // Set default sampling objectives if not provided
        const defaults = mergeConfig({
            priority: true,
            recency: false,
            punctuation: false,
            novelty: false,
            targetTime: null,  // Default to current time when used
            weights: {},
            dynamic: false,
            samplingInterval: 10 // Throttle sampling to prevent CPU spinning
        }, samplingObjectives);

        super(memory, defaults);

        // Support different memory types: traditional taskBag/bag, or Focus component
        this._initializeMemoryAccess(memory);

        if (!this.taskBag && !this.focusComponent) {
            throw new ReasonerError('TaskBagPremiseSource requires either a memory object with a taskBag/bag property or a Focus component with getTasks method', 'CONFIG_ERROR');
        }

        // Initialize sampling strategy weights based on sampling objectives
        const initialWeights = {
            priority: defaults.priority ? 1.0 : 0.0,
            recency: defaults.recency ? 1.0 : 0.0,
            punctuation: defaults.punctuation ? 1.0 : 0.0,
            novelty: defaults.novelty ? 1.0 : 0.0
        };

        // Override with any explicit weights provided
        this.weights = mergeConfig(initialWeights, defaults.weights);

        // Performance tracking for dynamic adaptation
        this.performanceStats = {
            priority: {count: 0, effectiveness: 0},
            recency: {count: 0, effectiveness: 0},
            punctuation: {count: 0, effectiveness: 0},
            novelty: {count: 0, effectiveness: 0}
        };

        this.dynamicAdaptation = defaults.dynamic;
        this.lastUpdate = Date.now();
        this.samplingObjectives = defaults;
    }

    /**
     * Initialize memory access based on the provided memory object
     * @private
     */
    _initializeMemoryAccess(memory) {
        // Support different memory types: traditional taskBag/bag, or Focus component
        if (memory && typeof memory.getTasks === 'function') {
            // This is a Focus-like component that uses getTasks method
            this.focusComponent = memory;
            this.taskBag = null; // No traditional taskBag
        } else {
            // Traditional memory with taskBag or bag property
            this.taskBag = memory?.taskBag ?? memory?.bag ?? null;
            this.focusComponent = null;
        }
    }

    /**
     * Returns an async stream of premises sampled from the task bag.
     * @param {AbortSignal} [signal] - Optional signal to abort the stream
     * @returns {AsyncGenerator<Task>}
     */
    async* stream(signal = null) {
        // Implement different sampling strategies based on objectives
        while (true) {
            if (signal?.aborted) break;

            try {
                const task = await this._sampleTask();
                if (task) {
                    yield task;
                    if (this.samplingObjectives.samplingInterval > 0) {
                        await sleep(this.samplingObjectives.samplingInterval);
                    }
                } else {
                    if (signal?.aborted) break;
                    // If no task is available, wait a bit before trying again
                    // We can add a mechanism to detect if the stream should end
                    await this._waitForTask();
                }
            } catch (error) {
                if (signal?.aborted) break;
                logError(error, {context: 'premise_source_stream'}, 'warn');
                // Wait before continuing to avoid tight error loop
                await this._waitForTask();
                continue;
            }
        }
    }

    /**
     * Attempt to get a task without waiting indefinitely
     * @returns {Promise<Task|null>}
     */
    async tryGetTask() {
        return await this._sampleTask();
    }

    /**
     * Sample a task from the bag based on sampling objectives
     * @returns {Promise<Task|null>}
     */
    async _sampleTask() {
        try {
            // Check if taskBag is available and has items
            if (this._getBagSize() === 0) {
                return null;
            }

            // Update weights dynamically if enabled
            if (this.dynamicAdaptation) {
                this._updateWeightsDynamically();
            }

            // Select sampling method based on weights
            const selectedMethod = this._selectSamplingMethod();

            // Record which method was selected for performance tracking
            const startTime = Date.now();
            const selectedTask = this._applySamplingMethod(selectedMethod);

            // Record the performance of the selected method if we have the task
            if (selectedTask) {
                const executionTime = Date.now() - startTime;
                // For now, we'll record basic effectiveness (inverse of execution time, with some random factor)
                // In a real system, this would be based on how valuable the derived conclusions are
                const effectiveness = 1.0 / (executionTime + 1);  // +1 to avoid division by zero
                this.recordMethodEffectiveness(selectedMethod, effectiveness);
            }

            return selectedTask;
        } catch (error) {
            logError(error, {context: 'task_sampling'}, 'error');
            return null;
        }
    }

    /**
     * Apply the selected sampling method
     * @param {string} method - The sampling method to apply
     * @returns {Task|null}
     */
    _applySamplingMethod(method) {
        switch (method) {
            case 'priority':
                return this._sampleByPriority();
            case 'recency':
                return this._sampleByRecency();
            case 'punctuation':
                return this._sampleByPunctuation();
            case 'novelty':
                return this._sampleByNovelty();
            default:
                return this._sampleByPriority(); // Default fallback
        }
    }

    /**
     * Get the size of the task bag or focus
     * @returns {number}
     */
    _getBagSize() {
        if (this.focusComponent) {
            // For Focus component, get the number of tasks in the current focus
            const tasks = this.focusComponent.getTasks(1000); // Get all tasks (up to 1000)
            return tasks.length;
        }

        if (this.taskBag?.size !== undefined) return this.taskBag.size;
        if (typeof this.taskBag?.length === 'number') return this.taskBag.length;
        if (typeof this.taskBag?.count === 'function') return this.taskBag.count();
        if (Array.isArray(this.taskBag) || this.taskBag instanceof Set) return this.taskBag.length ?? this.taskBag.size;
        if (this.taskBag instanceof Map) return this.taskBag.size;
        // If we can't determine size, assume it's not empty and try to get items
        return 0; // Return 0 if no bag or focus is available
    }

    /**
     * Select the sampling method based on current weights
     * @returns {string}
     */
    _selectSamplingMethod() {
        const methods = Object.keys(this.weights);
        const weights = methods.map(method => this.weights[method]);

        // Normalize weights to ensure at least some probability for each method
        const totalWeight = weights.reduce((sum, w) => sum + Math.max(w, 0.001), 0);
        const normalizedWeights = weights.map(w => w / totalWeight);

        return randomWeightedSelect(methods, normalizedWeights);
    }

    /**
     * Sample by priority (default behavior using the underlying bag's priority)
     * Enhanced to consider recent tasks for better syllogistic reasoning
     * @returns {Task|null}
     */
    _sampleByPriority() {
        if (this.focusComponent) {
            return this._sampleFocusByPriority();
        }

        if (this.taskBag?.take) {
            return this.taskBag.take();
        } else if (this.taskBag?.pop) {
            return this.taskBag.pop();
        } else if (this.taskBag?.get) {
            return this.taskBag.get(0);
        }
        return null;
    }

    /**
     * Sample focus by priority using fair roulette sampling
     * @private
     */
    _sampleFocusByPriority() {
        // Get all tasks from focus to enable fair roulette sampling
        const allTasks = this.focusComponent.getTasks(1000); // Get up to 1000 tasks (essentially all)

        if (allTasks.length === 0) return null;
        if (allTasks.length === 1) return allTasks[0];

        // Log all available tasks for debugging
        /*
        console.log(`[PREMISE DEBUG] Available tasks in focus: ${allTasks.length}`);
        for (let i = 0; i < allTasks.length; i++) {
            const termName = allTasks[i].term?._name || allTasks[i].term || 'unknown';
            const priority = allTasks[i].budget?.priority || 0;
            console.log(`[PREMISE DEBUG] Task ${i}: ${termName} (priority: ${priority})`);
        }
        */

        // Use fair roulette sampling: each task's selection probability is proportional to its priority
        const totalPriority = allTasks.reduce((sum, task) => sum + (task.budget?.priority || 0), 0);

        if (totalPriority <= 0) {
            // If no priorities, do uniform random selection
            const randomIndex = Math.floor(Math.random() * allTasks.length);
            const selectedTask = allTasks[randomIndex];
            //console.log(`[PREMISE SELECT] Random (no priority) - Selected: ${selectedTask.term?._name || selectedTask.term || 'unknown'}`);
            return selectedTask;
        }

        // Perform roulette wheel selection
        let randomValue = Math.random() * totalPriority;
        for (const task of allTasks) {
            const taskPriority = task.budget?.priority || 0;
            //console.log(`[PREMISE SELECT] Considering ${task.term?._name || task.term || 'unknown'} with priority ${taskPriority}`);
            if (randomValue < taskPriority) {
                //console.log(`[PREMISE SELECT] SELECTED: ${task.term?._name || task.term || 'unknown'} with priority ${taskPriority}`);
                return task;
            }
            randomValue -= taskPriority;
        }

        // Fallback (shouldn't reach here if totalPriority calculation is correct)
        const fallbackTask = allTasks[allTasks.length - 1];
        //console.log(`[PREMISE SELECT] Fallback - Selected: ${fallbackTask.term?._name || fallbackTask.term || 'unknown'}`);
        return fallbackTask;
    }

    /**
     * Sample by closeness to target time (favor tasks closest to a specific time)
     * @returns {Task|null}
     */
    _sampleByRecency() {
        // Handle Focus component
        if (this.focusComponent) {
            return this._sampleFocusByRecency();
        }

        // If the bag supports getting multiple items, we can prioritize based on closeness to target time
        if (this.taskBag?.getAll && typeof this.taskBag.getAll === 'function') {
            return this._sampleBagByRecency();
        }

        // Fallback: just take from the bag (assumes underlying priority might include recency)
        return this._sampleByPriority();
    }

    /**
     * Sample focus by recency
     * @private
     */
    _sampleFocusByRecency() {
        // Get all tasks from focus
        const allTasks = this.focusComponent.getTasks(1000); // Get up to 1000 tasks
        if (allTasks.length === 0) return null;

        // Use a configurable target time (default to current time if not specified)
        const targetTime = this.samplingObjectives.targetTime ?? Date.now();

        // Sort by closeness to target time (closest first)
        allTasks.sort((a, b) => {
            const timeA = a.stamp?.lastUpdated ?? a.stamp?.creationTime ?? 0;
            const timeB = b.stamp?.lastUpdated ?? b.stamp?.creationTime ?? 0;

            // Calculate absolute distance to target time
            const distanceA = Math.abs(timeA - targetTime);
            const distanceB = Math.abs(timeB - targetTime);

            return distanceA - distanceB; // Closest to target time first
        });

        // Return the task closest to target time
        return allTasks[0];
    }

    /**
     * Sample task bag by recency
     * @private
     */
    _sampleBagByRecency() {
        const allTasks = this.taskBag.getAll();
        if (allTasks.length === 0) return null;

        // Use a configurable target time (default to current time if not specified)
        const targetTime = this.samplingObjectives.targetTime ?? Date.now();

        // Sort by closeness to target time (closest first)
        allTasks.sort((a, b) => {
            const timeA = a.stamp?.lastUpdated ?? a.stamp?.creationTime ?? 0;
            const timeB = b.stamp?.lastUpdated ?? b.stamp?.creationTime ?? 0;

            // Calculate absolute distance to target time
            const distanceA = Math.abs(timeA - targetTime);
            const distanceB = Math.abs(timeB - targetTime);

            return distanceA - distanceB; // Closest to target time first
        });

        // Return the task closest to target time
        const selectedTask = allTasks[0];
        // Remove the selected task from the bag (if supported)
        if (this.taskBag?.remove) {
            this.taskBag.remove(selectedTask);
        }
        return selectedTask;
    }

    /**
     * Sample by punctuation (favor Goals or Questions)
     * @returns {Task|null}
     */
    _sampleByPunctuation() {
        // Handle Focus component
        if (this.focusComponent) {
            return this._sampleFocusByPunctuation();
        }

        // Get all tasks and filter for goals/questions
        if (this.taskBag?.getAll && typeof this.taskBag.getAll === 'function') {
            return this._sampleBagByPunctuation();
        }

        // If no goals/questions available, fall back to priority
        return this._sampleByPriority();
    }

    /**
     * Sample focus by punctuation
     * @private
     */
    _sampleFocusByPunctuation() {
        // Get all tasks from focus
        const allTasks = this.focusComponent.getTasks(1000); // Get up to 1000 tasks
        if (allTasks.length === 0) return null;

        // Filter for goals and questions
        const goalsAndQuestions = allTasks.filter(task => {
            const punctuation = task.type; // In the new system, task type is stored in 'type' property
            return punctuation === 'GOAL' || punctuation === 'QUESTION';
        });

        if (goalsAndQuestions.length > 0) {
            // Randomly select from goals/questions
            const randomIndex = Math.floor(Math.random() * goalsAndQuestions.length);
            return goalsAndQuestions[randomIndex];
        }

        return null;
    }

    /**
     * Sample task bag by punctuation
     * @private
     */
    _sampleBagByPunctuation() {
        const allTasks = this.taskBag.getAll();
        if (allTasks.length === 0) return null;

        // Filter for goals and questions
        const goalsAndQuestions = allTasks.filter(task => {
            const punctuation = task.type; // In the new system, task type is stored in 'type' property
            return punctuation === 'GOAL' || punctuation === 'QUESTION';
        });

        if (goalsAndQuestions.length > 0) {
            // Randomly select from goals/questions
            const randomIndex = Math.floor(Math.random() * goalsAndQuestions.length);
            const selectedTask = goalsAndQuestions[randomIndex];
            // Remove the selected task from the bag (if supported)
            if (this.taskBag?.remove) {
                this.taskBag.remove(selectedTask);
            }
            return selectedTask;
        }

        return null;
    }

    /**
     * Sample by novelty (favor tasks with fewer reasoning steps)
     * @returns {Task|null}
     */
    _sampleByNovelty() {
        // Handle Focus component
        if (this.focusComponent) {
            return this._sampleFocusByNovelty();
        }

        // Get all tasks and select those with lower derivation depth
        if (this.taskBag?.getAll && typeof this.taskBag.getAll === 'function') {
            return this._sampleBagByNovelty();
        }

        // Fallback: just take from the bag
        return this._sampleByPriority();
    }

    /**
     * Sample focus by novelty
     * @private
     */
    _sampleFocusByNovelty() {
        // Get all tasks from focus
        const allTasks = this.focusComponent.getTasks(1000); // Get up to 1000 tasks
        if (allTasks.length === 0) return null;

        // Calculate novelty as inverse of derivation depth
        const tasksWithNovelty = allTasks.map(task => {
            const depth = task.stamp?.depth ?? 0;
            // Higher novelty score for lower depth values
            const novelty = 1 / (depth + 1); // Add 1 to avoid division by zero
            return {task, novelty};
        });

        // Sort by novelty (highest novelty first)
        tasksWithNovelty.sort((a, b) => b.novelty - a.novelty);

        // Select the most novel task
        return tasksWithNovelty[0].task;
    }

    /**
     * Sample task bag by novelty
     * @private
     */
    _sampleBagByNovelty() {
        const allTasks = this.taskBag.getAll();
        if (allTasks.length === 0) return null;

        // Calculate novelty as inverse of derivation depth
        const tasksWithNovelty = allTasks.map(task => {
            const depth = task.stamp?.depth ?? 0;
            // Higher novelty score for lower depth values
            const novelty = 1 / (depth + 1); // Add 1 to avoid division by zero
            return {task, novelty};
        });

        // Sort by novelty (highest novelty first)
        tasksWithNovelty.sort((a, b) => b.novelty - a.novelty);

        // Select the most novel task
        const selectedTask = tasksWithNovelty[0].task;
        // Remove the selected task from the bag (if supported)
        if (this.taskBag?.remove) {
            this.taskBag.remove(selectedTask);
        }
        return selectedTask;
    }

    /**
     * Update weights based on performance metrics
     */
    _updateWeightsDynamically() {
        const now = Date.now();
        // Only update weights periodically (e.g., every 1000ms)
        if (now - this.lastUpdate < 1000) {
            return;
        }

        this.lastUpdate = now;

        // Calculate effectiveness scores for each method
        for (const method in this.performanceStats) {
            const stats = this.performanceStats[method];
            if (stats.count > 0) {
                // Effectiveness is average effectiveness per sample
                const effectiveness = stats.effectiveness / stats.count;
                // Adjust weight based on effectiveness (with some decay to prevent overfitting)
                this.weights[method] = 0.9 * this.weights[method] + 0.1 * effectiveness;
            }
        }
    }

    /**
     * Record performance for a sampling method
     * @param {string} method - The sampling method used
     * @param {number} effectiveness - Effectiveness score (0-1)
     */
    recordMethodEffectiveness(method, effectiveness) {
        const stats = this.performanceStats[method];
        if (stats) {
            stats.count++;
            stats.effectiveness += effectiveness;
        }
    }

    /**
     * Wait for a task to become available
     * @returns {Promise<void>}
     */
    async _waitForTask() {
        // Use utility sleep function
        await sleep(10); // 10ms wait
    }
}