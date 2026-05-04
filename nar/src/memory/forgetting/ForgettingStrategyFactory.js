import {PriorityForgettingStrategy} from './PriorityForgettingStrategy.js';
import {LRUForgettingStrategy} from './LRUForgettingStrategy.js';
import {FIFOForgettingStrategy} from './FIFOForgettingStrategy.js';

/**
 * Factory for creating forgetting strategy instances based on policy name.
 */
export class ForgettingStrategyFactory {
    static STRATEGIES = {
        'priority': PriorityForgettingStrategy,
        'lru': LRUForgettingStrategy,
        'fifo': FIFOForgettingStrategy
    };

    /**
     * Create a forgetting strategy instance based on the policy name.
     *
     * @param {string} policyName - The forgetting policy name ('priority', 'lru', or 'fifo')
     * @returns {ForgettingStrategy} An instance of the appropriate strategy
     * @throws {Error} If policy name is invalid
     */
    static create(policyName) {
        const StrategyClass = this.STRATEGIES[policyName];

        if (!StrategyClass) {
            throw new Error(
                `Unknown forgetting policy: ${policyName}. ` +
                `Valid options: ${Object.keys(this.STRATEGIES).join(', ')}`
            );
        }

        return new StrategyClass();
    }

    /**
     * Get list of available strategy names.
     *
     * @returns {string[]} Array of valid policy names
     */
    static getAvailableStrategies() {
        return Object.keys(this.STRATEGIES);
    }
}
