export class Grounding {
    constructor(config = {}) {
        this.config = config;
    }

    /**
     * @param {*} raw
     * @returns {string|Object} Symbol
     */
    lift(raw) {
        throw new Error('lift() not implemented');
    }

    /**
     * @param {*} symbol
     * @returns {*} Raw data
     */
    ground(symbol) {
        throw new Error('ground() not implemented');
    }

    /**
     * @param {*} raw
     * @param {*} symbol
     */
    update(raw, symbol) {}
}
