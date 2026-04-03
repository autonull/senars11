import {PremiseSource} from './PremiseSource.js';
import {Logger} from '@senars/core/src/util/Logger.js';

/**
 * A Bag of PremiseSources that samples from the sources based on configurable objectives.
 * This implementation uses weighted selection to sample from sources in proportion to their priority.
 */
export class PremiseSources extends PremiseSource {
    /**
     * @param {Memory} memory - The memory to draw from.
     * @param {Array<{source: PremiseSource, priority: number}>} sources - Array of source objects with priority.
     * @param {object} samplingObjectives - Configuration for the sampling strategy.
     */
    constructor(memory, sources, samplingObjectives) {
        super(memory, samplingObjectives);

        // Initialize sources with default priority if not provided
        this.sources = [];
        if (Array.isArray(sources)) {
            for (const item of sources) {
                if (item.source) {
                    this.sources.push({
                        source: item.source,
                        priority: typeof item.priority === 'number' ? item.priority : 1.0
                    });
                } else {
                    // Direct source provided (backward compatibility)
                    this.sources.push({
                        source: item,
                        priority: 1.0
                    });
                }
            }
        }
    }

    /**
     * Adds a premise source to the collection with the specified priority.
     * @param {PremiseSource} source - The premise source to add.
     * @param {number} priority - Priority of the source (default: 1.0).
     */
    addSource(source, priority = 1.0) {
        this.sources.push({source, priority});
    }

    /**
     * Removes a premise source from the collection.
     * @param {PremiseSource} source - The premise source to remove.
     * @returns {boolean} True if the source was removed, false otherwise.
     */
    removeSource(source) {
        const initialLength = this.sources.length;
        this.sources = this.sources.filter(item => item.source !== source);
        return this.sources.length < initialLength;
    }

    /**
     * Selects a source based on weighted random selection according to priorities.
     * @returns {PremiseSource|null} The selected source or null if no sources exist.
     */
    _selectSourceByPriority() {
        try {
            if (this.sources.length === 0) {
                return null;
            }

            // Calculate total priority
            const totalPriority = this.sources.reduce((sum, item) => sum + item.priority, 0);

            if (totalPriority <= 0) {
                // If all priorities are zero or negative, select randomly
                const randomIndex = Math.floor(Math.random() * this.sources.length);
                return this.sources[randomIndex].source;
            }

            // Select based on weighted probability
            let random = Math.random() * totalPriority;
            for (const item of this.sources) {
                random -= item.priority;
                if (random <= 0) {
                    return item.source;
                }
            }

            // Fallback (shouldn't happen due to floating point precision issues)
            return this.sources[this.sources.length - 1].source;
        } catch (error) {
            Logger.error('Error in _selectSourceByPriority:', error);
            // Fallback to first source if selection fails
            return this.sources.length > 0 ? this.sources[0].source : null;
        }
    }

    /**
     * Returns an async stream of premises by sampling from the contained sources based on their priority.
     * @returns {AsyncGenerator<Task>}
     */
    async* stream() {
        while (true) {
            try {
                // Select a source based on its priority weight
                const source = this._selectSourceByPriority();
                if (!source) {
                    // If no sources are available, wait a bit before trying again
                    await new Promise(resolve => setTimeout(resolve, 10));
                    continue;
                }

                // Get a stream from the selected source and yield its next task
                const sourceStream = source.stream();
                for await (const task of sourceStream) {
                    yield task;
                    // Break after getting one task to return control and allow other sources to be selected
                    break;
                }
            } catch (error) {
                Logger.error('Error in PremiseSources stream:', error);
                // Wait before continuing to avoid tight error loop
                await new Promise(resolve => setTimeout(resolve, 10));

            }
        }
    }
}