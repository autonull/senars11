
// Bidirectional mapping between neural and symbolic representations
export class SymbolGrounding {
    constructor(config = {}) {
        this.config = config;
        this.conceptMap = new Map(); // Symbol -> Tensor/Value
        this.valueMap = new Map();   // Tensor/Value hash -> Symbol
        this.counter = 0;
    }

    /**
     * Lift raw observation to symbolic representation.
     * @param {*} observation
     * @returns {Object} {entities, relations, attributes} or string symbol
     */
    lift(observation) {
        // Simple heuristic:
        // If discrete, return symbol directly.
        // If continuous, discretize or find nearest concept.

        if (typeof observation === 'number') {
            return this._liftNumber(observation);
        } else if (Array.isArray(observation)) {
            return this._liftArray(observation);
        }
        return String(observation);
    }

    _liftNumber(val) {
        // Simple binning
        const bin = Math.floor(val * 10) / 10;
        return `val_${bin}`;
    }

    _liftArray(arr) {
        // Create a unique key or find nearest neighbor
        // For simplicity, just stringify
        const key = arr.map(x => Math.floor(x * 10) / 10).join('_');
        const sym = `state_${key}`;

        if (!this.conceptMap.has(sym)) {
            this.conceptMap.set(sym, arr);
        }
        return sym;
    }

    /**
     * Ground symbolic decision to action vector/tensor.
     * @param {*} symbols
     * @returns {*} action vector/tensor
     */
    ground(symbols) {
        // If symbol is known, return value
        if (this.conceptMap.has(symbols)) {
            return this.conceptMap.get(symbols);
        }

        // If symbol looks like a number, parse it
        if (!isNaN(parseFloat(symbols))) {
            return parseFloat(symbols);
        }

        // If symbol looks like a list
        if (typeof symbols === 'string' && symbols.startsWith('(')) {
             // Parse "(1.0 2.0)"
             return symbols.slice(1, -1).trim().split(/\s+/).map(Number);
        }

        // Fallback: Return index if it's an action symbol like 'action_0'
        if (typeof symbols === 'string' && symbols.startsWith('action_')) {
            return parseInt(symbols.split('_')[1]);
        }

        return symbols;
    }

    /**
     * Learn grounding from data.
     * @param {*} obs
     * @param {*} symbols
     */
    updateGrounding(obs, symbols) {
        this.conceptMap.set(symbols, obs);
        // Reverse mapping logic could go here
    }
}
