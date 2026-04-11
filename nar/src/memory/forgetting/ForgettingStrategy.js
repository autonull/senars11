/**
 * Base class for memory forgetting strategies.
 * Implements the Strategy pattern for concept forgetting policies.
 */
export class ForgettingStrategy {
    /**
     * Select a concept to forget from the given concept map.
     *
     * @param {Map} concepts - Map of terms to Concept instances
     * @param {Object} stats - Memory statistics for decision making
     * @returns {*|null} The term of the concept to forget, or null if none found
     * @abstract
     */
    forget(concepts, stats) {
        throw new Error(`${this.constructor.name}.forget() must be implemented by subclass`);
    }

    /**
     * Template method for extremum-based forgetting (min/max value search).
     * Subclasses override _getValue to provide their specific metric.
     *
     * @param {Map} concepts - Map of terms to Concept instances
     * @param {Object} stats - Memory statistics (unused by default)
     * @returns {*|null} The term of the concept with extremum value
     * @protected
     */
    _forgetByExtremum(concepts, stats) {
        let targetTerm = null;
        let extremumValue = Infinity;

        for (const [term, concept] of concepts) {
            const value = this._getValue(concept, stats);
            if (value < extremumValue) {
                extremumValue = value;
                targetTerm = term;
            }
        }

        return targetTerm;
    }

    /**
     * Get the value to compare for a given concept.
     * Override this method in subclasses to define the forgetting metric.
     *
     * @param {Object} concept - Concept instance
     * @param {Object} stats - Memory statistics
     * @returns {number} Value to compare (lower = more likely to forget)
     * @protected
     */
    _getValue(concept, stats) {
        return Infinity;
    }

    /**
     * Get the strategy name (derived from class name).
     *
     * @returns {string} Strategy name in lowercase (e.g., 'priority', 'lru', 'fifo')
     */
    getName() {
        return this.constructor.name
            .replace('ForgettingStrategy', '')
            .toLowerCase();
    }
}
