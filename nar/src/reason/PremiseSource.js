/**
 * @interface
 * PremiseSource generates a continuous stream of premises/tasks for reasoning.
 * @param {Memory} memory - The memory to draw from.
 * @param {object} samplingObjectives - Configuration for the sampling strategy.
 */
export class PremiseSource {
    /**
     * @param {Memory} memory - The memory to draw from.
     * @param {object} samplingObjectives - Configuration for the sampling strategy.
     */
    constructor(memory, samplingObjectives) {
        this.memory = memory;
        this.samplingObjectives = samplingObjectives || {};
    }

    /**
     * Returns an async stream of premises.
     * @param {AbortSignal} [signal] - Optional signal to abort the stream
     * @returns {AsyncGenerator<Task>}
     */
    async* stream(signal = null) {
        // This is a stub implementation - to be overridden by subclasses
        throw new Error('Method stream() must be implemented by subclasses');
    }
}