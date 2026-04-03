/**
 * Abstract base class for Reasoner execution strategies.
 */
export class Runner {
    /**
     * @param {Reasoner} reasoner - The reasoner instance to execute
     * @param {object} config - Configuration options
     */
    constructor(reasoner, config = {}) {
        this.reasoner = reasoner;
        this.config = config;
    }

    start() {
        throw new Error('Method start() must be implemented');
    }

    stop() {
        throw new Error('Method stop() must be implemented');
    }
}
