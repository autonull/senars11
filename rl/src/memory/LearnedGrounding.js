import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';

const GROUNDING_DEFAULTS = {
    precision: 10,
    prefix: 'state',
    valuePrefix: 'val',
    actionPrefix: 'op',
    useLearnedGrounding: true,
    groundingThreshold: 0.5
};

export class LearnedGrounding extends Component {
    constructor(config = {}) {
        super(mergeConfig(GROUNDING_DEFAULTS, config));
        this.conceptMap = new Map();
        this.valueMap = new Map();
        this.actionMap = new Map();
        this.counter = 0;
        this._metricsTracker = new MetricsTracker({ liftsPerformed: 0, groundingsPerformed: 0 });
    }

    get metrics() { return this._metricsTracker; }

    lift(observation, options = {}) {
        const { precision = this.config.precision, prefix = this.config.prefix } = options;
        this.metrics.increment('liftsPerformed');

        if (typeof observation === 'number') {
            return this._liftNumber(observation, precision, this.config.valuePrefix);
        }
        if (Array.isArray(observation)) {
            return this._liftArray(observation, precision, prefix);
        }
        return String(observation);
    }

    _liftNumber(val, precision, prefix) {
        const bin = Math.floor(val * precision) / precision;
        return `${prefix}_${String(bin).replace('.', 'd')}`;
    }

    _liftArray(arr, precision, prefix) {
        const key = arr.map(x => String(Math.floor(x * precision) / precision).replace('.', 'd')).join('_');
        return `${prefix}_${key}`;
    }

    ground(symbols, options = {}) {
        this.metrics.increment('groundingsPerformed');
        if (this.conceptMap.has(symbols)) return this.conceptMap.get(symbols);
        return this._parseActionSymbol(symbols);
    }

    _parseActionSymbol(symbols) {
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

    learnGrounding(symbol, value, type = 'concept') {
        (type === 'concept' ? this.conceptMap : type === 'value' ? this.valueMap : this.actionMap).set(symbol, value);
        return this;
    }

    getGrounding(symbol) {
        return this.conceptMap.get(symbol) ?? this.valueMap.get(symbol) ?? this.actionMap.get(symbol);
    }

    hasGrounding(symbol) {
        return this.conceptMap.has(symbol) || this.valueMap.has(symbol) || this.actionMap.has(symbol);
    }

    update(obs, symbols) {
        this.conceptMap.set(symbols, obs);
    }

    clear() {
        this.conceptMap.clear();
        this.valueMap.clear();
        this.actionMap.clear();
        this.counter = 0;
        this.metrics.reset();
    }

    getStats() {
        return {
            conceptMappings: this.conceptMap.size,
            valueMappings: this.valueMap.size,
            actionMappings: this.actionMap.size,
            metrics: this.metrics.getAll()
        };
    }
}
