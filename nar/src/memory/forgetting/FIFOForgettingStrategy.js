import {ForgettingStrategy} from './ForgettingStrategy.js';

/**
 * First-In-First-Out (FIFO) forgetting strategy.
 * Removes the first concept that was added to memory (insertion order).
 */
export class FIFOForgettingStrategy extends ForgettingStrategy {
    /**
     * Return the first concept in the map (relies on Map's insertion order).
     *
     * @param {Map} concepts - Map of terms to Concept instances (maintains insertion order)
     * @param {Object} stats - Memory statistics (unused for this strategy)
     * @returns {*|null} The term of the first concept, or null if no concepts
     */
    forget(concepts, stats) {
        const firstEntry = concepts.keys().next();
        return firstEntry.done ? null : firstEntry.value;
    }
}
