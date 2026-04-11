/**
 * Manages memory resource tracking and memory pressure detection.
 * Extracted from Memory.js to improve separation of concerns.
 */
export class MemoryResourceManager {
    /**
     * @param {Object} config - Memory configuration
     * @param {number} config.maxConcepts - Maximum number of concepts
     * @param {number} config.maxTasksPerConcept - Maximum tasks per concept
     * @param {number} config.resourceBudget - Total resource budget
     * @param {number} config.memoryPressureThreshold - Threshold for memory pressure (0.0-1.0)
     */
    constructor(config) {
        this._config = config;
        this._resourceTracker = new Map();
        this._stats = {
            totalResourceUsage: 0,
            peakResourceUsage: 0,
            memoryPressureEvents: 0
        };
    }

    /**
     * Update resource usage for a concept.
     *
     * @param {Concept} concept - The concept being updated
     * @param {number} change - Resource usage change (positive or negative)
     */
    updateResourceUsage(concept, change) {
        const conceptKey = concept.term.toString();
        const currentUsage = this._resourceTracker.get(conceptKey) || 0;
        const newUsage = Math.max(0, currentUsage + change);

        this._resourceTracker.set(conceptKey, newUsage);
        this._stats.totalResourceUsage += change;

        if (this._stats.totalResourceUsage > this._stats.peakResourceUsage) {
            this._stats.peakResourceUsage = this._stats.totalResourceUsage;
        }
    }

    /**
     * Check if memory is under pressure based on various metrics.
     *
     * @param {Object} memoryStats - Current memory statistics
     * @param {number} memoryStats.totalConcepts - Current number of concepts
     * @param {number} memoryStats.totalTasks - Current number of tasks
     * @returns {boolean} True if memory is under pressure
     */
    isUnderMemoryPressure(memoryStats) {
        const conceptPressure = memoryStats.totalConcepts / this._config.maxConcepts;
        const resourcePressure = this._stats.totalResourceUsage / this._config.resourceBudget;
        const taskPressure = memoryStats.totalTasks /
            (this._config.maxConcepts * this._config.maxTasksPerConcept);

        return Math.max(conceptPressure, resourcePressure, taskPressure) >=
            this._config.memoryPressureThreshold;
    }

    /**
     * Apply adaptive forgetting when memory is under pressure.
     *
     * @param {Memory} memory - The Memory instance to apply forgetting to
     */
    applyAdaptiveForgetting(memory) {
        this._stats.memoryPressureEvents++;

        const memoryStats = memory.stats;
        const conceptsToForget = Math.min(
            Math.floor(memoryStats.totalConcepts * 0.1),
            5
        );

        // Trigger forgetting multiple times using modern iteration
        Array.from({length: conceptsToForget}).forEach(() => {
            memory._applyConceptForgetting();
        });
    }

    /**
     * Clean up resource tracker by removing entries for non-existent concepts.
     *
     * @param {Map} conceptMap - Map of current concepts (term -> Concept)
     */
    cleanup(conceptMap) {
        const existingTerms = new Set();
        for (const term of conceptMap.keys()) {
            existingTerms.add(term.toString());
        }

        for (const [termStr, usage] of this._resourceTracker.entries()) {
            if (!existingTerms.has(termStr)) {
                this._resourceTracker.delete(termStr);
                this._stats.totalResourceUsage -= usage;
            }
        }
    }

    /**
     * Get detailed memory pressure statistics.
     *
     * @param {Object} memoryStats - Current memory statistics
     * @returns {Object} Detailed pressure statistics
     */
    getMemoryPressureStats(memoryStats) {
        const totalPossibleTasks = this._config.maxConcepts * this._config.maxTasksPerConcept;

        return {
            conceptPressure: memoryStats.totalConcepts / this._config.maxConcepts,
            taskPressure: memoryStats.totalTasks / totalPossibleTasks,
            resourcePressure: this._stats.totalResourceUsage / this._config.resourceBudget,
            memoryPressureEvents: this._stats.memoryPressureEvents,
            isUnderPressure: this.isUnderMemoryPressure(memoryStats),
            resourceBudget: this._config.resourceBudget,
            currentResourceUsage: this._stats.totalResourceUsage,
            peakResourceUsage: this._stats.peakResourceUsage
        };
    }

    /**
     * Get concepts sorted by resource usage.
     *
     * @param {Map} conceptMap - Map of concepts (term -> Concept)
     * @param {boolean} ascending - Sort in ascending order (default: false = descending)
     * @returns {Array<{term, concept, resourceUsage}>} Sorted array of concept info
     */
    getConceptsByResourceUsage(conceptMap, ascending = false) {
        const concepts = Array.from(conceptMap.entries()).map(([term, concept]) => ({
            term,
            concept,
            resourceUsage: this._resourceTracker.get(term.toString()) || 0
        }));

        concepts.sort((a, b) =>
            ascending ? a.resourceUsage - b.resourceUsage : b.resourceUsage - a.resourceUsage
        );

        return concepts;
    }

    /**
     * Get resource usage for a specific concept.
     *
     * @param {*} term - The concept's term
     * @returns {number} Resource usage for the concept
     */
    getResourceUsage(term) {
        return this._resourceTracker.get(term.toString()) || 0;
    }

    /**
     * Get internal statistics.
     *
     * @returns {Object} Resource manager statistics
     */
    getStats() {
        return {...this._stats};
    }

    /**
     * Get the resource tracker map (for serialization).
     *
     * @returns {Map} Resource tracker map
     */
    getResourceTracker() {
        return new Map(this._resourceTracker);
    }

    /**
     * Set the resource tracker map (for deserialization).
     *
     * @param {Map} tracker - Resource tracker map to restore
     */
    setResourceTracker(tracker) {
        this._resourceTracker = new Map(tracker);

        // Recalculate total usage
        this._stats.totalResourceUsage = 0;
        for (const usage of this._resourceTracker.values()) {
            this._stats.totalResourceUsage += usage;
        }
    }
}
