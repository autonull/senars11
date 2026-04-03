/**
 * @file PremiseFormationStrategy.js
 * @description Base interface for premise formation strategies.
 *
 * Premise formation strategies generate secondary premise candidates for pairing
 * with a primary task. This enables flexible, modular, and composable premise
 * formation that can be controlled by high-level reasoning controllers.
 */

/**
 * Base class for premise formation strategies.
 * Subclasses implement different methods of finding premise candidates:
 * - Decomposition: extracting subterms from compound statements
 * - Term linking: using conceptual associations
 * - Task matching: pairing with existing tasks in focus/memory
 */
export class PremiseFormationStrategy {
    /**
     * @param {object} config - Configuration options
     * @param {number} config.priority - Base priority weight for this strategy (0-1)
     * @param {boolean} config.enabled - Whether this strategy is active
     */
    constructor(config = {}) {
        this._priority = config.priority ?? 1.0;
        this._enabled = config.enabled ?? true;
        this._stats = {
            candidatesGenerated: 0,
            successfulPairs: 0,
            lastUsed: null
        };
    }

    /**
     * Priority weight for this strategy (0-1).
     * Higher priority strategies are sampled more frequently.
     * Can be adjusted at runtime for adaptive control.
     */
    get priority() {
        return this._priority;
    }

    set priority(value) {
        this._priority = Math.max(0, Math.min(1, value));
    }

    get enabled() {
        return this._enabled;
    }

    set enabled(value) {
        this._enabled = Boolean(value);
    }

    get stats() {
        return {...this._stats};
    }

    /**
     * Calculate effectiveness ratio for adaptive control.
     * @returns {number} Ratio of successful pairs to candidates generated
     */
    get effectiveness() {
        if (this._stats.candidatesGenerated === 0) return 0;
        return this._stats.successfulPairs / this._stats.candidatesGenerated;
    }

    /**
     * Generate secondary premise candidates for a primary task.
     *
     * @param {Task} primaryTask - The primary premise task
     * @param {object} context - Context for candidate generation
     * @param {TermFactory} context.termFactory - Factory for creating terms
     * @param {Memory} context.memory - Memory containing beliefs/concepts
     * @param {TermLayer} context.termLayer - Term linking layer
     * @param {Focus} context.focus - Current focus set with active tasks
     * @yields {{term: Term, type: string, priority: number, sourceTask?: Task}}
     */
    async* generateCandidates(primaryTask, context) {
        // Abstract method - to be implemented by subclasses
        throw new Error('generateCandidates must be implemented by subclass');
    }

    /**
     * Record that a candidate was generated.
     * @protected
     */
    _recordCandidate() {
        this._stats.candidatesGenerated++;
        this._stats.lastUsed = Date.now();
    }

    /**
     * Record that a pair formed from this strategy led to a derivation.
     * Used for adaptive priority adjustment.
     */
    recordSuccess() {
        this._stats.successfulPairs++;
    }

    /**
     * Reset statistics.
     */
    resetStats() {
        this._stats = {
            candidatesGenerated: 0,
            successfulPairs: 0,
            lastUsed: null
        };
    }

    /**
     * Get status information about the strategy.
     * @returns {object} Status information
     */
    getStatus() {
        return {
            type: this.constructor.name,
            priority: this._priority,
            enabled: this._enabled,
            stats: this.stats,
            effectiveness: this.effectiveness
        };
    }

    /**
     * Get a string representation for debugging.
     */
    toString() {
        return `${this.constructor.name}(priority=${this._priority}, enabled=${this._enabled})`;
    }
}
