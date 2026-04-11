import {ForgettingStrategy} from './ForgettingStrategy.js';

/**
 * Least Recently Used (LRU) forgetting strategy.
 * Removes the concept that was accessed least recently.
 */
export class LRUForgettingStrategy extends ForgettingStrategy {
    /**
     * Find and return the concept with the oldest lastAccessed timestamp.
     *
     * @param {Map} concepts - Map of terms to Concept instances
     * @param {Object} stats - Memory statistics (unused for this strategy)
     * @returns {*|null} The term of the least recently used concept, or null if no concepts
     */
    forget(concepts, stats) {
        return this._forgetByExtremum(concepts, stats);
    }

    /**
     * Get the last accessed timestamp for comparison.
     *
     * @param {Object} concept - Concept instance
     * @param {Object} stats - Memory statistics (unused)
     * @returns {number} Last accessed timestamp (default 0 if undefined)
     * @protected
     */
    _getValue(concept, stats) {
        return concept.lastAccessed ?? 0;
    }
}
