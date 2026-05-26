import {ForgettingStrategy} from './ForgettingStrategy.js';

/**
 * Forgetting strategy that removes concepts with the lowest activation/priority.
 * This is the default strategy used by SeNARS.
 */
export class PriorityForgettingStrategy extends ForgettingStrategy {
    /**
     * Find and return the concept with the lowest activation value.
     *
     * @param {Map} concepts - Map of terms to Concept instances
     * @param {Object} stats - Memory statistics (unused for this strategy)
     * @returns {*|null} The term of the concept with lowest activation, or null if no concepts
     */
    forget(concepts, stats) {
        return this._forgetByExtremum(concepts, stats);
    }

    /**
     * Get the activation value for comparison.
     *
     * @param {Object} concept - Concept instance
     * @param {Object} stats - Memory statistics (unused)
     * @returns {number} Activation value (default 0.1 if undefined)
     * @protected
     */
    _getValue(concept, stats) {
        return concept.activation ?? 0.1;
    }
}
