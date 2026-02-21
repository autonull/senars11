
import { Grounding } from '../core/Grounding.js';

// Bidirectional mapping between neural and symbolic representations
export class LearnedGrounding extends Grounding {
    constructor(config = {}) {
        super(config);
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
        return `val_${String(bin).replace('.', 'd')}`;
    }

    _liftArray(arr) {
        // Create a unique key or find nearest neighbor (simplified by stringifying)
        const key = arr.map(x => String(Math.floor(x * 10) / 10).replace('.', 'd')).join('_');
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
            // Strip operation prefix
            if (symbols.startsWith('^')) {
                symbols = symbols.slice(1);
            }
            if (symbols.startsWith('op_')) {
                symbols = symbols.slice(3);
            }

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
    update(obs, symbols) {
        this.conceptMap.set(symbols, obs);
        // TODO: Reverse mapping logic
    }
}
