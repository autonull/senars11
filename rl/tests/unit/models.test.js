/**
 * Unit Tests for Neuro-Symbolic Primitives
 */
import {describe, expect, it} from '@jest/globals';
import {SymbolicTensor, symbolicTensor, TensorLogicBridge, termToTensor} from '@senars/tensor';
import {SymbolicDifferentiation, WorldModel} from '../../src/index.js';

// ========== SymbolicTensor Tests ==========
describe('SymbolicTensor', () => {

    it('should create tensor with symbols', () => {
        const tensor = new SymbolicTensor(
            new Float32Array([1, 2, 3, 4]),
            [2, 2],
            {symbols: new Map([['0,0', {symbol: 'a', confidence: 0.9}]])}
        );

        expect(tensor.data.length).toBe(4);
        expect(tensor.shape[0]).toBe(2);
        expect(tensor.symbols.size).toBe(1);
    });

    it('should annotate tensor', () => {
        const tensor = symbolicTensor(
            new Float32Array([0.5, 0.8, 0.3]),
            [3],
            {'0': 'first', '1': 'second'}
        );

        tensor.annotate(2, 'third', 0.7);

        const annotation = tensor.getAnnotation(2);
        expect(annotation.symbol).toBe('third');
        expect(annotation.confidence).toBe(0.7);
    });

    it('should track provenance', () => {
        const tensor = new SymbolicTensor(new Float32Array([1, 2]), [2]);
        tensor.addProvenance('source1', 'op1', {param: 1});
        tensor.addProvenance('source2', 'op2', {param: 2});

        expect(tensor.provenance.length).toBe(2);
        expect(tensor.provenance[0].source).toBe('source1');
    });

    it('should convert to Narsese term', () => {
        const tensor = symbolicTensor(
            new Float32Array([0.5, 0.8]),
            [2],
            {'0': 'x'}
        );

        const term = tensor.toNarseseTerm('obs');
        expect(term).toContain('obs');
        expect(term).toContain('x');
    });

    it('should project to symbols', () => {
        const tensor = symbolicTensor(
            new Float32Array([0.9, 0.2, 0.7, 0.1]),
            [4],
            {'0': 'high1', '2': 'high2'}
        );

        const projected = tensor.projectToSymbols(0.5);
        expect(projected.length).toBe(2);
        expect(projected.some(p => p.symbol === 'high1')).toBe(true);
    });

    it('should clone tensor', () => {
        const original = symbolicTensor(
            new Float32Array([1, 2, 3]),
            [3],
            {'0': 'a'}
        );

        const cloned = original.clone();
        expect(cloned).not.toBe(original);
        expect(cloned.data[0]).toBe(1);
        expect(cloned.symbols.size).toBe(1);

        cloned.data[0] = 999;
        expect(original.data[0]).toBe(1);
    });

    it('should serialize and deserialize', () => {
        const tensor = symbolicTensor(
            new Float32Array([1.5, 2.5, 3.5]),
            [3],
            {'0': {symbol: 'test', confidence: 0.8}}
        );
        tensor.confidence = 0.9;

        const json = tensor.toJSON();
        const restored = SymbolicTensor.fromJSON(json);

        expect(restored.data.length).toBe(3);
        expect(restored.symbols.size).toBe(1);
        expect(restored.confidence).toBe(0.9);
    });
});

// ========== TensorLogicBridge Tests ==========
describe('TensorLogicBridge', () => {

    it('should lift tensor to symbols', () => {
        const bridge = new TensorLogicBridge({defaultSymbolThreshold: 0.5});
        const tensor = new SymbolicTensor(new Float32Array([0.8, 0.2, 0.6, 0.1]), [4]);

        const symbols = bridge.liftToSymbols(tensor);
        expect(symbols.length).toBeGreaterThanOrEqual(2);
    });

    it('should ground symbols to tensor', () => {
        const bridge = new TensorLogicBridge();

        const symbols = [
            {index: 0, symbol: 'a', confidence: 0.9},
            {index: 2, symbol: 'b', confidence: 0.7}
        ];

        const tensor = bridge.groundToTensor(symbols, [4]);
        expect(tensor.data.length).toBe(4);
        expect(tensor.data[0]).toBeGreaterThan(0);
        expect(tensor.data[2]).toBeGreaterThan(0);
    });

    it('should add tensors symbolically', () => {
        const bridge = new TensorLogicBridge();

        const t1 = symbolicTensor(new Float32Array([1, 2, 3]), [3], {'0': 'a'});
        const t2 = symbolicTensor(new Float32Array([4, 5, 6]), [3], {'0': 'b'});

        const result = bridge.symbolicAdd(t1, t2, 'union');
        expect(result.data[0]).toBe(5);
        expect(result.data[1]).toBe(7);
        expect(result.symbols.has('0')).toBe(true);
    });

    it('should multiply tensors symbolically', () => {
        const bridge = new TensorLogicBridge();

        const t1 = symbolicTensor(new Float32Array([1, 0, 1]), [3], {'0': 'a', '2': 'c'});
        const t2 = symbolicTensor(new Float32Array([1, 1, 0]), [3], {'0': 'b', '1': 'd'});

        const result = bridge.symbolicMul(t1, t2, 'intersection');
        expect(result.data[0]).toBe(1);
        expect(result.data[2]).toBe(0);
        expect(result.symbols.has('0')).toBe(true);
    });

    it('should apply neural operations', () => {
        const bridge = new TensorLogicBridge();
        const tensor = symbolicTensor(new Float32Array([-1, 0, 1, 2]), [4]);

        const result = bridge.neuralOp('relu', tensor);
        expect(result.data[0]).toBe(0);
        expect(result.data[2]).toBe(1);
        expect(result.provenance.length).toBeGreaterThan(0);
    });

    it('should create attention mask', () => {
        const bridge = new TensorLogicBridge();
        const tensor = symbolicTensor(
            new Float32Array([1, 2, 3, 4]),
            [4],
            {'0': 'a', '1': 'b', '2': 'c'}
        );

        const mask = bridge.createAttentionMask(tensor, new Set(['a', 'c']));
        expect(mask.data[0]).toBe(1);
        expect(mask.data[1]).toBe(0);
        expect(mask.data[2]).toBe(1);
    });

    it('should extract rules', () => {
        const bridge = new TensorLogicBridge();
        const tensor = symbolicTensor(
            new Float32Array([0.9, 0.2, -0.8, 0.1]),
            [4],
            {'0': 'cause', '2': 'effect'}
        );

        const rules = bridge.extractRules(tensor, 0.7);
        expect(rules.length).toBeGreaterThanOrEqual(1);
    });
});

// ========== Term Parsing Tests ==========
describe('Term Parsing', () => {

    it('should parse term to tensor', () => {
        const term = '(tensor_2x2:[a:0.9,b:0.8])';
        const tensor = termToTensor(term, [2, 2]);

        expect(tensor).toBeDefined();
        expect(tensor.shape[0]).toBe(2);
        expect(tensor.symbols.size).toBeGreaterThan(0);
    });
});

// ========== SymbolicDifferentiation Tests ==========
describe('SymbolicDifferentiation', () => {

    it('should compute gradients', () => {
        const diff = new SymbolicDifferentiation();

        const param = symbolicTensor(
            new Float32Array([1, 2, 3]),
            [3],
            {'0': 'w1', '1': 'w2'}
        );

        const loss = () => param.data.reduce((sum, v) => sum + v * v, 0);
        const gradients = diff.gradient(loss, [param]);

        expect(gradients.length).toBeGreaterThan(0);
        const gradData = gradients[0].data || gradients[0];
        expect(Math.abs(gradData[0] - 2)).toBeLessThan(0.5);
    });

    it('should annotate gradients', () => {
        const diff = new SymbolicDifferentiation({symbolicThreshold: 0.1});

        const param = symbolicTensor(
            new Float32Array([0.5, 0.5]),
            [2],
            {'0': {symbol: 'weight', confidence: 0.9}}
        );

        const loss = () => param.data[0] * 2;
        diff.gradient(loss, [param]);

        const symbolicGrad = diff.symbolicGradients.get(param);
        expect(symbolicGrad).toBeDefined();
    });

    it('should explain gradients', () => {
        const diff = new SymbolicDifferentiation();

        const param = symbolicTensor(
            new Float32Array([1, -1]),
            [2],
            {'0': {symbol: 'positive', confidence: 0.9}}
        );

        const loss = () => param.data[0] + param.data[1];
        diff.gradient(loss, [param]);

        const explanation = diff.explainGradient(param);
        expect(explanation.explanation).toBeDefined();
        expect(Array.isArray(explanation.symbols)).toBe(true);
    });

    it('should analyze gradient flow', () => {
        const diff = new SymbolicDifferentiation();

        for (let i = 0; i < 5; i++) {
            const param = new SymbolicTensor(new Float32Array([0.1, 0.2]), [2]);
            const loss = () => param.data[0] * i;
            diff.gradient(loss, [param]);
        }

        const analysis = diff.analyzeGradientFlow();
        expect(analysis.totalNodes).toBe(5);
        expect(analysis.avgMagnitude).toBeGreaterThanOrEqual(0);
    });
});

// ========== WorldModel Tests ==========
describe('WorldModel', () => {

    it('should initialize', async () => {
        const wm = new WorldModel({
            horizon: 5,
            latentDim: 8,
            ensembleSize: 2
        });

        await wm.initialize();
        expect(wm.transitionModels.length).toBe(2);

        await wm.shutdown();
    });

    it('should get stats', async () => {
        const wm = new WorldModel({
            horizon: 3,
            latentDim: 4,
            ensembleSize: 2
        });

        await wm.initialize();

        expect(wm.latentDim).toBe(4);
        expect(wm.ensembleSize).toBe(2);

        await wm.shutdown();
    });

    it('should compute uncertainty', async () => {
        const wm = new WorldModel({latentDim: 4, ensembleSize: 3});
        await wm.initialize();

        expect(wm.ensembleSize).toBe(3);

        await wm.shutdown();
    });
});
