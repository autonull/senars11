
// Bidirectional mapping between neural and symbolic representations
export class SymbolGrounding {
    constructor() {}

    /**
     * Lift raw observation to symbolic representation.
     * @param {*} observation
     * @returns {Object} {entities, relations, attributes}
     */
    lift(observation) {
        throw new Error("Method 'lift(observation)' must be implemented.");
    }

    /**
     * Ground symbolic decision to action vector/tensor.
     * @param {*} symbols
     * @returns {*} action vector/tensor
     */
    ground(symbols) {
        throw new Error("Method 'ground(symbols)' must be implemented.");
    }

    /**
     * Learn grounding from data.
     * @param {*} obs
     * @param {*} symbols
     */
    updateGrounding(obs, symbols) {
        // Optional
    }
}
