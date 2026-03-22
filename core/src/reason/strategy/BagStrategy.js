/**
 * BagStrategy (NARS-style): Priority-sampled bag approach for anytime reasoning.
 * 
 * DESIGN NOTE: This strategy intentionally bypasses the Formation Strategy framework
 * defined in the parent Strategy class. Instead of using formationStrategies and
 * candidateBag, it maintains its own priority-sampled bag (this.bag) for efficient
 * NARS-style anytime reasoning under resource constraints.
 * 
 * Rationale:
 * - Simpler implementation matching original NARS semantics
 * - Direct priority-based sampling without formation strategy overhead
 * - Fixed-size bag with automatic eviction of lowest-priority items
 * 
 * This is a deliberate architectural choice, not an oversight. The BagStrategy
 * provides a lightweight alternative to the more complex formation strategy framework.
 * 
 * Maintains a priority-sampled bag of tasks and beliefs. In each step, it randomly draws
 * a task and a belief from the bag and attempts to combine them.
 * This supports "anytime" reasoning under resource constraints.
 */
import {Strategy} from '../Strategy.js';
import {Logger} from '../../util/Logger.js';

export class BagStrategy extends Strategy {
    /**
     * @param {object} config - Configuration options
     * @param {number} config.bagSize - Size of the sampling bag
     * @param {Function} config.samplingFunction - Function to sample from the bag (defaults to priority-based)
     */
    constructor(config = {}) {
        super({
            bagSize: config.bagSize || 100,
            samplingFunction: config.samplingFunction || null,
            ...config
        });

        this.bag = [];
        this.bagSize = this.config.bagSize;
    }

    /**
     * Generate premise pairs using bag-based sampling
     * @param {AsyncGenerator<Task>} premiseStream - Stream of primary premises
     * @returns {AsyncGenerator<Array<Task>>} - Stream of premise pairs [primary, secondary]
     */
    async* generatePremisePairs(premiseStream) {
        for await (const primaryPremise of premiseStream) {
            try {
                this.updateBag(primaryPremise);
                const secondaryPremises = await this.selectSecondaryPremisesFromBag(primaryPremise);

                for (const secondaryPremise of secondaryPremises) {
                    yield [primaryPremise, secondaryPremise];
                }
            } catch (error) {
                Logger.error(`Error processing primary premise in ${this.constructor.name}:`, error);

            }
        }
    }

    /**
     * Update the internal bag with a new task
     * @param {Task} task - The task to add to the bag
     */
    updateBag(task) {
        if (!task?.budget) return;

        this.bag.push(task);

        if (this.bag.length > this.bagSize) {
            // Find and remove the lowest priority item
            const minPriorityIndex = this.bag.reduce((minIdx, currTask, idx, arr) => {
                const currPriority = currTask.budget?.priority ?? 0;
                const minPriority = arr[minIdx].budget?.priority ?? 0;
                return currPriority < minPriority ? idx : minIdx;
            }, 0);

            this.bag.splice(minPriorityIndex, 1);
        }
    }

    /**
     * Select secondary premises from the internal bag
     * @param {Task} primaryPremise - The primary premise
     * @returns {Promise<Array<Task>>} - Array of secondary premises
     */
    async selectSecondaryPremisesFromBag(primaryPremise) {
        // Use the configured sampling function or default to priority-based sampling
        if (this.config.samplingFunction) {
            return this.config.samplingFunction(primaryPremise, this.bag);
        }

        const validSecondaryTasks = this.bag.filter(task =>
            task &&
            task !== primaryPremise &&  // Don't pair a task with itself
            task.term &&  // Has a valid term
            task.term !== primaryPremise.term &&  // Different terms
            task.budget &&  // Has budget information
            (task.budget.priority || 0) > 0  // Has positive priority
        );

        // Sort by priority (descending) and limit to maxSecondaryPremises
        validSecondaryTasks.sort((a, b) => (b.budget.priority || 0) - (a.budget.priority || 0));

        return validSecondaryTasks.slice(0, this.config.maxSecondaryPremises || 10);
    }

    /**
     * Select secondary premises (override parent method)
     * @param {Task} primaryPremise - The primary premise
     * @returns {Promise<Array<Task>>} - Array of secondary premises
     */
    async selectSecondaryPremises(primaryPremise) {
        return this.selectSecondaryPremisesFromBag(primaryPremise);
    }

    /**
     * Get status information about the strategy
     * @returns {object} Status information
     */
    getStatus() {
        return {
            ...super.getStatus(),
            bagSize: this.bag.length,
            bagCapacity: this.bagSize,
            type: 'BagStrategy'
        };
    }
}