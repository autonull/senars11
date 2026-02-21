
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
        return typeof observation === 'number' ? this._liftNumber(observation)
             : Array.isArray(observation) ? this._liftArray(observation)
             : String(observation);
    }

    _liftNumber(val) {
        // Simple binning
        const bin = Math.floor(val * 10) / 10;
        return `val_${bin}`;
    }

    _liftArray(arr) {
        // Create a unique key or find nearest neighbor (simplified by stringifying)
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
        if (this.conceptMap.has(symbols)) {
            return this.conceptMap.get(symbols);
        }

        if (typeof symbols === 'string') {
            if (symbols.startsWith('(')) {
                const content = symbols.slice(1, -1).trim();
                // Check if it looks like a vector (numbers separated by space or comma)
                // Heuristic: if it contains letters or '-->', it's likely a Narsese term
                if (!/[a-zA-Z>]/.test(content)) {
                    const parts = content.split(/[\s,]+/).filter(s => s.length > 0);
                    const numbers = parts.map(Number);
                    if (numbers.every(n => !isNaN(n))) {
                         return numbers;
                    }
                }
            }
            if (symbols.startsWith('action_')) {
                return parseInt(symbols.split('_')[1], 10);
            }
            const num = parseFloat(symbols);
            if (!isNaN(num)) return num;
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
        // TODO: Reverse mapping logic
    }
}
