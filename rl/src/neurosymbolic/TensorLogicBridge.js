/**
 * Tensor-Logic Bridge for Neuro-Symbolic Integration
 * Provides bidirectional conversion between tensor operations and symbolic reasoning.
 */
import { Tensor, TensorFunctor } from '@senars/tensor';

/**
 * SymbolicTensor: Tensor with symbolic annotations and provenance.
 */
export class SymbolicTensor extends Tensor {
    constructor(data, shape, config = {}) {
        // Convert Float32Array to regular array for Tensor constructor
        let tensorData = data;
        if (data instanceof Float32Array || data instanceof Array) {
            tensorData = Array.from(data);
        }
        
        // Reshape if shape is provided and different from inferred
        if (shape) {
            tensorData = SymbolicTensor._reshapeData(tensorData, shape);
        }
        
        super(tensorData, config);
        this.symbols = config.symbols || new Map();
        this.provenance = config.provenance || [];
        this.confidence = config.confidence || 1.0;
        this.type = config.type || 'tensor';
        
        // Override shape if provided
        if (shape) {
            this.shape = shape;
        }
    }
    
    static _reshapeData(flat, shape) {
        if (shape.length === 1) return Array.from(flat);
        if (shape.length === 2) {
            const [rows, cols] = shape;
            const result = [];
            for (let i = 0; i < rows; i++) {
                result.push(Array.from(flat.slice(i * cols, (i + 1) * cols)));
            }
            return result;
        }
        // For higher dimensions, use nested approach
        return Array.from(flat);
    }

    /**
     * Attach symbolic annotation to tensor element.
     */
    annotate(indices, symbol, confidence = 1.0) {
        const key = Array.isArray(indices) ? indices.join(',') : String(indices);
        this.symbols.set(key, { symbol, confidence, timestamp: Date.now() });
        return this;
    }

    /**
     * Get symbolic annotation for tensor element.
     */
    getAnnotation(indices) {
        const key = Array.isArray(indices) ? indices.join(',') : String(indices);
        return this.symbols.get(key);
    }

    /**
     * Add provenance information.
     */
    addProvenance(source, operation, metadata = {}) {
        this.provenance.push({
            source,
            operation,
            metadata,
            timestamp: Date.now()
        });
        return this;
    }

    /**
     * Convert to Narsese-like term.
     */
    toNarseseTerm(prefix = 'tensor') {
        const flatData = this.data.map(v => v.toFixed(4));
        const symbolParts = [];
        
        for (const [key, { symbol, confidence }] of this.symbols) {
            symbolParts.push(`${symbol}:${confidence.toFixed(2)}`);
        }
        
        if (symbolParts.length > 0) {
            return `(${prefix}_${this.shape.join('x')}:[${symbolParts.join(',')}])`;
        }
        
        return `(${prefix}_${this.shape.join('x')}:[${flatData.join(',')}])`;
    }

    /**
     * Create symbolic projection.
     */
    projectToSymbols(threshold = 0.5) {
        const result = [];
        
        for (let i = 0; i < this.data.length; i++) {
            const value = this.data[i];
            const annotation = this.symbols.get(String(i));
            
            if (annotation && annotation.confidence >= threshold) {
                result.push({
                    index: i,
                    symbol: annotation.symbol,
                    value,
                    confidence: annotation.confidence
                });
            } else if (Math.abs(value) >= threshold) {
                result.push({
                    index: i,
                    symbol: `feature_${i}`,
                    value,
                    confidence: 0.5
                });
            }
        }
        
        return result;
    }

    /**
     * Clone with deep copy of symbols.
     */
    clone() {
        const cloned = new SymbolicTensor(
            new Float32Array(this.data),
            this.shape,
            {
                symbols: new Map(this.symbols),
                provenance: [...this.provenance],
                confidence: this.confidence,
                type: this.type
            }
        );
        return cloned;
    }

    /**
     * Serialize to JSON.
     */
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

    /**
     * Deserialize from JSON.
     */
    static fromJSON(json) {
        const tensor = new SymbolicTensor(json.data, json.shape, {
            symbols: new Map(json.symbols),
            provenance: json.provenance,
            confidence: json.confidence,
            type: json.type
        });
        return tensor;
    }
}

/**
 * Neuro-Symbolic Bridge Operations.
 */
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
     * Register symbol grounding function.
     */
    registerGrounding(name, fn) {
        this.symbolRegistry.set(name, fn);
        return this;
    }

    /**
     * Lift tensor to symbolic representation.
     */
    liftToSymbols(tensor, config = {}) {
        const {
            threshold = this.config.defaultSymbolThreshold,
            useAnnotations = true
        } = config;

        if (tensor instanceof SymbolicTensor && useAnnotations) {
            return tensor.projectToSymbols(threshold);
        }

        // Automatic symbol extraction
        const symbols = [];
        for (let i = 0; i < tensor.data.length; i++) {
            const value = tensor.data[i];
            if (Math.abs(value) >= threshold) {
                symbols.push({
                    index: i,
                    symbol: `f${i}_${value > 0 ? 'pos' : 'neg'}`,
                    value,
                    confidence: this.config.defaultConfidence
                });
            }
        }

        return symbols;
    }

    /**
     * Ground symbols to tensor.
     */
    groundToTensor(symbols, shape, config = {}) {
        const {
            aggregation = 'sum',
            defaultWeight = 1.0
        } = config;

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
     * Symbolic tensor operation: addition with symbol merging.
     */
    symbolicAdd(t1, t2, mergeFn = 'union') {
        if (!(t1 instanceof SymbolicTensor) || !(t2 instanceof SymbolicTensor)) {
            return this.functor.evaluate({ operator: 'add', components: [t1, t2] }, new Map());
        }

        const result = new SymbolicTensor(
            new Float32Array(t1.data.map((v, i) => v + t2.data[i])),
            t1.shape
        );

        // Merge symbols
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
            } else if (s1) {
                result.symbols.set(key, { ...s1, timestamp: Date.now() });
            } else {
                result.symbols.set(key, { ...s2, timestamp: Date.now() });
            }
        }

        result.addProvenance('symbolicAdd', mergeFn, { t1, t2 });
        return result;
    }

    /**
     * Symbolic tensor operation: multiplication with symbol intersection.
     */
    symbolicMul(t1, t2, mergeFn = 'intersection') {
        if (!(t1 instanceof SymbolicTensor) || !(t2 instanceof SymbolicTensor)) {
            return this.functor.evaluate({ operator: 'mul', components: [t1, t2] }, new Map());
        }

        const result = new SymbolicTensor(
            new Float32Array(t1.data.map((v, i) => v * t2.data[i])),
            t1.shape
        );

        // Intersect symbols
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

    mergeSymbols(s1, s2, mode) {
        switch (mode) {
            case 'union':
                return `${s1}∪${s2}`;
            case 'intersection':
                return `${s1}∩${s2}`;
            case 'concat':
                return `${s1}_${s2}`;
            default:
                return s1;
        }
    }

    /**
     * Apply neural operation with symbolic tracking.
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
            
            // Propagate relevant symbols
            for (const [key, symbol] of tensor.symbols) {
                symbolicResult.symbols.set(key, {
                    ...symbol,
                    confidence: symbol.confidence * 0.9 // Decay confidence through operations
                });
            }
        }

        return symbolicResult;
    }

    /**
     * Create symbolic attention mask.
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
     * Symbolic softmax with attention to annotated regions.
     */
    symbolicSoftmax(tensor, symbolWeights = null) {
        const expData = new Float32Array(tensor.data.map(Math.exp));
        const sum = expData.reduce((a, b) => a + b, 0);
        
        const result = new SymbolicTensor(
            expData.map(v => v / sum),
            tensor.shape
        );

        // Apply symbol weights if provided
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
     * Extract symbolic rules from tensor patterns.
     */
    extractRules(tensor, minConfidence = 0.7) {
        const rules = [];
        
        for (const [key, { symbol, confidence }] of tensor.symbols) {
            if (confidence >= minConfidence) {
                const idx = key.split(',').map(Number);
                const value = tensor.data[idx.reduce((a, b) => a * tensor.shape[b] + b, 0)];
                
                rules.push({
                    antecedent: symbol,
                    consequent: value > 0 ? 'activate' : 'inhibit',
                    strength: confidence,
                    evidence: Math.abs(value)
                });
            }
        }

        return rules;
    }

    /**
     * Serialize bridge state.
     */
    serialize() {
        return {
            config: this.config,
            symbolRegistry: Array.from(this.symbolRegistry.entries()),
            version: '1.0.0'
        };
    }
}

/**
 * Create a symbolic tensor from raw data.
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
 * Convert Narsese-like term to symbolic tensor.
 */
export function termToTensor(term, shape, registry = new Map()) {
    // Parse term like "(tensor_2x2:[f1:0.9,f2:0.8])"
    const match = term.match(/\((\w+)_([\d x]+):\[(.*?)\]\)/);
    if (!match) return null;

    const [, prefix, shapeStr, content] = match;
    const dims = shapeStr.split('x').map(Number);
    
    const data = new Float32Array(dims.reduce((a, b) => a * b, 1));
    const tensor = new SymbolicTensor(data, dims);

    // Parse symbol annotations
    const annotations = content.split(',');
    for (const ann of annotations) {
        const [symbol, confidence] = ann.split(':');
        const idx = registry.get(symbol.trim()) || 0;
        tensor.annotate([idx], symbol.trim(), parseFloat(confidence) || 1.0);
    }

    return tensor;
}
