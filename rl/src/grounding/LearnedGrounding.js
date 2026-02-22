import { Grounding } from '../core/Grounding.js';

const GroundingUtils = {
    liftNumber(val) {
        const bin = Math.floor(val * 10) / 10;
        return `val_${String(bin).replace('.', 'd')}`;
    },

    liftArray(arr) {
        const key = arr.map(x => String(Math.floor(x * 10) / 10).replace('.', 'd')).join('_');
        return `state_${key}`;
    },

    parseActionSymbol(symbols) {
        if (typeof symbols !== 'string') return symbols;

        const stripped = symbols.startsWith('^') ? symbols.slice(1)
            : symbols.startsWith('op_') ? symbols.slice(3)
            : symbols;

        if (stripped.startsWith('(')) {
            const content = stripped.slice(1, -1).trim();
            if (!/[a-zA-Z>]/.test(content)) {
                const numbers = content.split(/[\s,]+/).filter(s => s).map(Number);
                if (numbers.every(n => !isNaN(n))) return numbers;
            }
        }

        if (stripped.startsWith('action_')) {
            return parseInt(stripped.split('_')[1], 10);
        }

        const num = parseFloat(stripped);
        return isNaN(num) ? symbols : num;
    }
};

export class LearnedGrounding extends Grounding {
    constructor(config = {}) {
        super(config);
        this.conceptMap = new Map();
        this.valueMap = new Map();
        this.counter = 0;
    }

    lift(observation) {
        return typeof observation === 'number' ? GroundingUtils.liftNumber(observation)
            : Array.isArray(observation) ? GroundingUtils.liftArray(observation)
            : String(observation);
    }

    ground(symbols) {
        if (this.conceptMap.has(symbols)) {
            return this.conceptMap.get(symbols);
        }
        return GroundingUtils.parseActionSymbol(symbols);
    }

    update(obs, symbols) {
        this.conceptMap.set(symbols, obs);
    }

    clear() {
        this.conceptMap.clear();
        this.valueMap.clear();
        this.counter = 0;
    }

    has(symbol) {
        return this.conceptMap.has(symbol);
    }

    get(symbol) {
        return this.conceptMap.get(symbol);
    }

    set(symbol, value) {
        this.conceptMap.set(symbol, value);
    }
}
