
/**
 * Base class for Symbol Grounding strategies.
 * Converts between raw observation/action space and symbolic representation.
 */
export class Grounding {
    constructor(config = {}) {
        this.config = config;
    }

    /**
     * Lift raw data to symbol.
     * @param {*} raw
     * @returns {string|Object} Symbol
     */
    lift(raw) {
        throw new Error("lift() not implemented");
    }

    /**
     * Ground symbol to raw data.
     * @param {*} symbol
     * @returns {*} Raw data
     */
    ground(symbol) {
        throw new Error("ground() not implemented");
    }

    /**
     * Update internal mappings based on experience.
     * @param {*} raw
     * @param {*} symbol
     */
    update(raw, symbol) {
        // Optional
    }
}
