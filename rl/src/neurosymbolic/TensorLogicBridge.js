import { Tensor, TensorFunctor } from '@senars/tensor';

export class SymbolicTensor extends Tensor {
    constructor(data, shape, config = {}) {
        let tensorData = data instanceof Float32Array || data instanceof Array
            ? Array.from(data)
            : data;

        if (shape) {
            tensorData = SymbolicTensor._reshapeData(tensorData, shape);
        }

        super(tensorData, config);
        this.symbols = config.symbols || new Map();
        this.provenance = config.provenance || [];
        this.confidence = config.confidence || 1.0;
        this.type = config.type || 'tensor';

        if (shape) {
            this.shape = shape;
        }
    }

    static _reshapeData(flat, shape) {
        if (shape.length === 1) return Array.from(flat);
        if (shape.length === 2) {
            const [rows, cols] = shape;
            return Array.from({ length: rows }, (_, i) =>
                Array.from(flat.slice(i * cols, (i + 1) * cols))
            );
        }
        return Array.from(flat);
    }

    /**
     * @param {number|number[]} indices
     * @param {string} symbol
     * @param {number} confidence
     */
    annotate(indices, symbol, confidence = 1.0) {
        const key = Array.isArray(indices) ? indices.join(',') : String(indices);
        this.symbols.set(key, { symbol, confidence, timestamp: Date.now() });
        return this;
    }

    /**
     * @param {number|number[]} indices
     */
    getAnnotation(indices) {
        const key = Array.isArray(indices) ? indices.join(',') : String(indices);
        return this.symbols.get(key);
    }

    /**
     * @param {string} source
     * @param {string} operation
     * @param {Object} metadata
     */
    addProvenance(source, operation, metadata = {}) {
        this.provenance.push({ source, operation, metadata, timestamp: Date.now() });
        return this;
    }

    /**
     * @param {string} prefix
     */
    toNarseseTerm(prefix = 'tensor') {
        const flatData = this.data.map(v => v.toFixed(4));
        const symbolParts = Array.from(this.symbols)
            .map(([_, { symbol, confidence }]) => `${symbol}:${confidence.toFixed(2)}`);

        return symbolParts.length > 0
            ? `(${prefix}_${this.shape.join('x')}:[${symbolParts.join(',')}])`
            : `(${prefix}_${this.shape.join('x')}:[${flatData.join(',')}])`;
    }

    /**
     * @param {number} threshold
     */
    projectToSymbols(threshold = 0.5) {
        return Array.from(this.data).map((value, i) => {
            const annotation = this.symbols.get(String(i));
            if (annotation && annotation.confidence >= threshold) {
                return { index: i, symbol: annotation.symbol, value, confidence: annotation.confidence };
            }
            if (Math.abs(value) >= threshold) {
                return { index: i, symbol: `feature_${i}`, value, confidence: 0.5 };
            }
            return null;
        }).filter(Boolean);
    }

    clone() {
        return new SymbolicTensor(
            new Float32Array(this.data),
            this.shape,
            {
                symbols: new Map(this.symbols),
                provenance: [...this.provenance],
                confidence: this.confidence,
                type: this.type
            }
        );
    }

    toJSON() {
        return {
            data: Array.from(this.data),
            shape: this.shape,
            symbols: Array.from(this.symbols.entries()),
            provenance: this.provenance,
            confidence: this.confidence,
            type: this.type
        };
    }

    static fromJSON(json) {
        return new SymbolicTensor(json.data, json.shape, {
            symbols: new Map(json.symbols),
            provenance: json.provenance,
            confidence: json.confidence,
            type: json.type
        });
    }
}

export class TensorLogicBridge {
    constructor(config = {}) {
        this.config = {
            defaultSymbolThreshold: 0.5,
            defaultConfidence: 0.8,
            symbolGroundingFn: null,
            ...config
        };

        this.functor = new TensorFunctor();
        this.symbolRegistry = new Map();
        this.groundingModel = null;
    }

    /**
     * @param {string} name
     * @param {Function} fn
     */
    registerGrounding(name, fn) {
        this.symbolRegistry.set(name, fn);
        return this;
    }

    /**
     * @param {Tensor} tensor
     * @param {Object} config
     */
    liftToSymbols(tensor, config = {}) {
        const { threshold = this.config.defaultSymbolThreshold, useAnnotations = true } = config;

        if (tensor instanceof SymbolicTensor && useAnnotations) {
            return tensor.projectToSymbols(threshold);
        }

        return Array.from(tensor.data)
            .map((value, i) => {
                if (Math.abs(value) >= threshold) {
                    return {
                        index: i,
                        symbol: `f${i}_${value > 0 ? 'pos' : 'neg'}`,
                        value,
                        confidence: this.config.defaultConfidence
                    };
                }
                return null;
            })
            .filter(Boolean);
    }

    /**
     * @param {Array} symbols
     * @param {number[]} shape
     * @param {Object} config
     */
    groundToTensor(symbols, shape, config = {}) {
        const { aggregation = 'sum', defaultWeight = 1.0 } = config;
        const data = new Float32Array(shape.reduce((a, b) => a * b, 1));

        for (const sym of symbols) {
            const idx = typeof sym.index === 'number' ? sym.index : 0;
            const weight = sym.confidence !== undefined ? sym.confidence : defaultWeight;
            if (idx >= 0 && idx < data.length) {
                data[idx] += weight;
            }
        }

        const tensor = new SymbolicTensor(data, shape);
        tensor.addProvenance('groundToTensor', aggregation, { symbols: symbols.length });
        return tensor;
    }

    /**
     * @param {SymbolicTensor} t1
     * @param {SymbolicTensor} t2
     * @param {string} mergeFn
     */
    symbolicAdd(t1, t2, mergeFn = 'union') {
        if (!(t1 instanceof SymbolicTensor) || !(t2 instanceof SymbolicTensor)) {
            return this.functor.evaluate({ operator: 'add', components: [t1, t2] }, new Map());
        }

        const result = new SymbolicTensor(
            new Float32Array(t1.data.map((v, i) => v + t2.data[i])),
            t1.shape
        );

        const allSymbols = new Set([...t1.symbols.keys(), ...t2.symbols.keys()]);

        for (const key of allSymbols) {
            const s1 = t1.symbols.get(key);
            const s2 = t2.symbols.get(key);

            if (s1 && s2) {
                result.symbols.set(key, {
                    symbol: this.mergeSymbols(s1.symbol, s2.symbol, mergeFn),
                    confidence: (s1.confidence + s2.confidence) / 2,
                    timestamp: Date.now()
                });
            } else {
                result.symbols.set(key, { ...(s1 || s2), timestamp: Date.now() });
            }
        }

        result.addProvenance('symbolicAdd', mergeFn, { t1, t2 });
        return result;
    }

    /**
     * @param {SymbolicTensor} t1
     * @param {SymbolicTensor} t2
     * @param {string} mergeFn
     */
    symbolicMul(t1, t2, mergeFn = 'intersection') {
        if (!(t1 instanceof SymbolicTensor) || !(t2 instanceof SymbolicTensor)) {
            return this.functor.evaluate({ operator: 'mul', components: [t1, t2] }, new Map());
        }

        const result = new SymbolicTensor(
            new Float32Array(t1.data.map((v, i) => v * t2.data[i])),
            t1.shape
        );

        for (const [key, s1] of t1.symbols) {
            const s2 = t2.symbols.get(key);
            if (s2) {
                result.symbols.set(key, {
                    symbol: this.mergeSymbols(s1.symbol, s2.symbol, mergeFn),
                    confidence: s1.confidence * s2.confidence,
                    timestamp: Date.now()
                });
            }
        }

        result.addProvenance('symbolicMul', mergeFn, { t1, t2 });
        return result;
    }

    /**
     * @param {string} s1
     * @param {string} s2
     * @param {string} mode
     */
    mergeSymbols(s1, s2, mode) {
        const ops = {
            union: (a, b) => `${a}∪${b}`,
            intersection: (a, b) => `${a}∩${b}`,
            concat: (a, b) => `${a}_${b}`
        };
        return ops[mode]?.(s1, s2) ?? s1;
    }

    /**
     * @param {string} operation
     * @param {Tensor} tensor
     */
    neuralOp(operation, tensor, ...args) {
        const result = this.functor.evaluate(
            { operator: operation, components: [tensor, ...args] },
            new Map()
        );

        const symbolicResult = result instanceof Tensor
            ? new SymbolicTensor(result.data, result.shape)
            : result;

        if (symbolicResult instanceof SymbolicTensor) {
            symbolicResult.addProvenance('neuralOp', operation, { args });

            for (const [key, symbol] of tensor.symbols) {
                symbolicResult.symbols.set(key, {
                    ...symbol,
                    confidence: symbol.confidence * 0.9
                });
            }
        }

        return symbolicResult;
    }

    /**
     * @param {Tensor} tensor
     * @param {Set} symbolMask
     */
    createAttentionMask(tensor, symbolMask) {
        const mask = new Float32Array(tensor.data.length);

        for (let i = 0; i < tensor.data.length; i++) {
            const annotation = tensor.symbols.get(String(i));
            if (annotation && symbolMask.has(annotation.symbol)) {
                mask[i] = 1.0;
            }
        }

        return new SymbolicTensor(mask, tensor.shape, {
            provenance: [{ operation: 'attentionMask', timestamp: Date.now() }]
        });
    }

    /**
     * @param {Tensor} tensor
     * @param {Map} symbolWeights
     */
    symbolicSoftmax(tensor, symbolWeights = null) {
        const expData = new Float32Array(tensor.data.map(Math.exp));
        const sum = expData.reduce((a, b) => a + b, 0);

        const result = new SymbolicTensor(
            expData.map(v => v / sum),
            tensor.shape
        );

        if (symbolWeights) {
            for (const [key, weight] of symbolWeights) {
                const idx = parseInt(key);
                if (!isNaN(idx) && idx < result.data.length) {
                    result.data[idx] *= weight;
                }
            }
        }

        result.addProvenance('symbolicSoftmax', 'attention', { symbolWeights: !!symbolWeights });
        return result;
    }

    /**
     * @param {Tensor} tensor
     * @param {number} minConfidence
     */
    extractRules(tensor, minConfidence = 0.7) {
        return Array.from(tensor.symbols)
            .filter(([_, { confidence }]) => confidence >= minConfidence)
            .map(([key, { symbol, confidence }]) => {
                const idx = key.split(',').map(Number);
                const value = tensor.data[idx.reduce((a, b) => a * tensor.shape[b] + b, 0)];
                return {
                    antecedent: symbol,
                    consequent: value > 0 ? 'activate' : 'inhibit',
                    strength: confidence,
                    evidence: Math.abs(value)
                };
            });
    }

    serialize() {
        return {
            config: this.config,
            symbolRegistry: Array.from(this.symbolRegistry.entries()),
            version: '1.0.0'
        };
    }
}

/**
 * @param {Array} data
 * @param {number[]} shape
 * @param {Object} symbols
 */
export function symbolicTensor(data, shape, symbols = {}) {
    const tensor = new SymbolicTensor(data, shape);

    for (const [key, value] of Object.entries(symbols)) {
        const indices = key.split(',').map(Number);
        tensor.annotate(indices.length === 1 ? indices[0] : indices, value);
    }

    return tensor;
}

/**
 * @param {string} term
 * @param {number[]} shape
 * @param {Map} registry
 */
export function termToTensor(term, shape, registry = new Map()) {
    const match = term.match(/\((\w+)_([\d x]+):\[(.*?)\]\)/);
    if (!match) return null;

    const [, _, shapeStr, content] = match;
    const dims = shapeStr.split('x').map(Number);

    const data = new Float32Array(dims.reduce((a, b) => a * b, 1));
    const tensor = new SymbolicTensor(data, dims);

    for (const ann of content.split(',')) {
        const [symbol, confidence] = ann.split(':');
        const idx = registry.get(symbol.trim()) || 0;
        tensor.annotate([idx], symbol.trim(), parseFloat(confidence) || 1.0);
    }

    return tensor;
}
