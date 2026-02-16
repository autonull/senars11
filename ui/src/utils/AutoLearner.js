/**
 * AutoLearner tracks user interactions to evolve UI heuristics (e.g., concept prominence)
 * fulfilling the "learn from experience" and "evolve heuristics" requirement.
 */
export class AutoLearner {
    constructor() {
        this.preferences = this._loadPreferences();
    }

    _loadPreferences() {
        try {
            const stored = localStorage.getItem('senars-ui-learner');
            return stored ? JSON.parse(stored) : { conceptWeights: {} };
        } catch (e) {
            console.warn('AutoLearner: Failed to load preferences', e);
            return { conceptWeights: {} };
        }
    }

    _savePreferences() {
        try {
            localStorage.setItem('senars-ui-learner', JSON.stringify(this.preferences));
        } catch (e) {
            console.warn('AutoLearner: Failed to save preferences', e);
        }
    }

    /**
     * Record an interaction with a concept (e.g., selection, expansion)
     * @param {string} term - The concept term
     * @param {number} weight - Interaction weight (default 1)
     */
    recordInteraction(term, weight = 1) {
        if (!term) return;

        // Simple decay/growth heuristic
        const current = this.preferences.conceptWeights[term] || 0;
        this.preferences.conceptWeights[term] = Math.min(current + weight, 100); // Cap at 100

        this._savePreferences();
    }

    /**
     * Get the learned weight modifier for a concept
     * @param {string} term
     * @returns {number} The weight modifier (0-100)
     */
    getConceptModifier(term) {
        return this.preferences.conceptWeights[term] || 0;
    }

    /**
     * Reset learned heuristics
     */
    reset() {
        this.preferences = { conceptWeights: {} };
        this._savePreferences();
    }
}
