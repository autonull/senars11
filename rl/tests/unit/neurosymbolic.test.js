/**
 * Unit Tests for Neuro-Symbolic Primitives
 */
import { strict as assert } from 'assert';
import {
    SymbolicTensor,
    TensorLogicBridge,
    symbolicTensor,
    termToTensor,
    SymbolicDifferentiation,
    WorldModel
} from '../../src/index.js';

console.log('🧪 Running Neuro-Symbolic Primitives Tests...\n');

// ========== SymbolicTensor Tests ==========
console.log('1️⃣ SymbolicTensor Tests\n');

function testSymbolicTensorCreation() {
    console.log('  Testing SymbolicTensor creation...');
    
    const tensor = new SymbolicTensor(
        new Float32Array([1, 2, 3, 4]),
        [2, 2],
        { symbols: new Map([['0,0', { symbol: 'a', confidence: 0.9 }]]) }
    );
    
    assert.equal(tensor.data.length, 4, 'Should have 4 elements');
    assert.equal(tensor.shape[0], 2, 'Should have correct shape');
    assert.equal(tensor.symbols.size, 1, 'Should have 1 symbol');
    
    console.log('  ✓ SymbolicTensor creation test passed\n');
}

function testSymbolicTensorAnnotation() {
    console.log('  Testing SymbolicTensor annotation...');
    
    const tensor = symbolicTensor(
        new Float32Array([0.5, 0.8, 0.3]),
        [3],
        { '0': 'first', '1': 'second' }
    );
    
    tensor.annotate(2, 'third', 0.7);
    
    const annotation = tensor.getAnnotation(2);
    assert.equal(annotation.symbol, 'third', 'Should have symbol');
    assert.equal(annotation.confidence, 0.7, 'Should have confidence');
    
    console.log('  ✓ SymbolicTensor annotation test passed\n');
}

function testSymbolicTensorProvenance() {
    console.log('  Testing SymbolicTensor provenance...');
    
    const tensor = new SymbolicTensor(new Float32Array([1, 2]), [2]);
    tensor.addProvenance('source1', 'op1', { param: 1 });
    tensor.addProvenance('source2', 'op2', { param: 2 });
    
    assert.equal(tensor.provenance.length, 2, 'Should have 2 provenance entries');
    assert.equal(tensor.provenance[0].source, 'source1', 'Should have correct source');
    
    console.log('  ✓ SymbolicTensor provenance test passed\n');
}

function testSymbolicTensorNarsese() {
    console.log('  Testing SymbolicTensor Narsese term...');

    const tensor = symbolicTensor(
        new Float32Array([0.5, 0.8]),
        [2],
        { '0': 'x' }  // symbolicTensor expects symbol strings, not objects
    );

    const term = tensor.toNarseseTerm('obs');
    assert.ok(term.includes('obs'), 'Should include prefix');
    assert.ok(term.includes('x'), 'Should include symbol');

    console.log('  ✓ SymbolicTensor Narsese term test passed\n');
}

function testSymbolicTensorProjection() {
    console.log('  Testing SymbolicTensor projection...');

    const tensor = symbolicTensor(
        new Float32Array([0.9, 0.2, 0.7, 0.1]),
        [4],
        {
            '0': 'high1',
            '2': 'high2'
        }
    );

    const projected = tensor.projectToSymbols(0.5);

    assert.equal(projected.length, 2, 'Should project 2 symbols');
    assert.ok(projected.some(p => p.symbol === 'high1'), 'Should include high1');

    console.log('  ✓ SymbolicTensor projection test passed\n');
}

function testSymbolicTensorClone() {
    console.log('  Testing SymbolicTensor clone...');
    
    const original = symbolicTensor(
        new Float32Array([1, 2, 3]),
        [3],
        { '0': 'a' }
    );
    
    const cloned = original.clone();
    
    assert.notEqual(original, cloned, 'Should be different objects');
    assert.equal(cloned.data[0], 1, 'Should have same data');
    assert.equal(cloned.symbols.size, 1, 'Should have same symbols');
    
    // Modify clone
    cloned.data[0] = 999;
    assert.equal(original.data[0], 1, 'Original should be unchanged');
    
    console.log('  ✓ SymbolicTensor clone test passed\n');
}

function testSymbolicTensorSerialization() {
    console.log('  Testing SymbolicTensor serialization...');
    
    const tensor = symbolicTensor(
        new Float32Array([1.5, 2.5, 3.5]),
        [3],
        { '0': { symbol: 'test', confidence: 0.8 } }
    );
    tensor.confidence = 0.9;
    
    const json = tensor.toJSON();
    const restored = SymbolicTensor.fromJSON(json);
    
    assert.equal(restored.data.length, 3, 'Should have same length');
    assert.equal(restored.symbols.size, 1, 'Should have same symbols');
    assert.equal(restored.confidence, 0.9, 'Should have same confidence');
    
    console.log('  ✓ SymbolicTensor serialization test passed\n');
}

// ========== TensorLogicBridge Tests ==========
console.log('2️⃣ TensorLogicBridge Tests\n');

function testBridgeLiftToSymbols() {
    console.log('  Testing bridge lift to symbols...');

    const bridge = new TensorLogicBridge({ defaultSymbolThreshold: 0.5 });
    const tensor = new SymbolicTensor(new Float32Array([0.8, 0.2, 0.6, 0.1]), [4]);

    const symbols = bridge.liftToSymbols(tensor);

    assert.ok(symbols.length >= 2, 'Should lift significant values');
    assert.ok(symbols.some(s => Math.abs(s.value - 0.8) < 0.01 || s.index === 0), 'Should include 0.8');

    console.log('  ✓ Bridge lift to symbols test passed\n');
}

function testBridgeGroundToTensor() {
    console.log('  Testing bridge ground to tensor...');
    
    const bridge = new TensorLogicBridge();
    
    const symbols = [
        { index: 0, symbol: 'a', confidence: 0.9 },
        { index: 2, symbol: 'b', confidence: 0.7 }
    ];
    
    const tensor = bridge.groundToTensor(symbols, [4]);
    
    assert.equal(tensor.data.length, 4, 'Should have correct size');
    assert.ok(tensor.data[0] > 0, 'Should have value at index 0');
    assert.ok(tensor.data[2] > 0, 'Should have value at index 2');
    
    console.log('  ✓ Bridge ground to tensor test passed\n');
}

function testBridgeSymbolicAdd() {
    console.log('  Testing bridge symbolic addition...');
    
    const bridge = new TensorLogicBridge();
    
    const t1 = symbolicTensor(new Float32Array([1, 2, 3]), [3], { '0': 'a' });
    const t2 = symbolicTensor(new Float32Array([4, 5, 6]), [3], { '0': 'b' });
    
    const result = bridge.symbolicAdd(t1, t2, 'union');
    
    assert.equal(result.data[0], 5, 'Should add values');
    assert.equal(result.data[1], 7, 'Should add values');
    assert.ok(result.symbols.has('0'), 'Should have merged symbols');
    
    console.log('  ✓ Bridge symbolic addition test passed\n');
}

function testBridgeSymbolicMul() {
    console.log('  Testing bridge symbolic multiplication...');
    
    const bridge = new TensorLogicBridge();
    
    const t1 = symbolicTensor(new Float32Array([1, 0, 1]), [3], { '0': 'a', '2': 'c' });
    const t2 = symbolicTensor(new Float32Array([1, 1, 0]), [3], { '0': 'b', '1': 'd' });
    
    const result = bridge.symbolicMul(t1, t2, 'intersection');
    
    assert.equal(result.data[0], 1, 'Should multiply values');
    assert.equal(result.data[2], 0, 'Should multiply values');
    assert.ok(result.symbols.has('0'), 'Should have intersection symbols');
    
    console.log('  ✓ Bridge symbolic multiplication test passed\n');
}

function testBridgeNeuralOp() {
    console.log('  Testing bridge neural operations...');
    
    const bridge = new TensorLogicBridge();
    const tensor = symbolicTensor(new Float32Array([-1, 0, 1, 2]), [4]);
    
    const result = bridge.neuralOp('relu', tensor);
    
    assert.equal(result.data[0], 0, 'ReLU should zero negative');
    assert.equal(result.data[2], 1, 'ReLU should keep positive');
    assert.ok(result.provenance.length > 0, 'Should track provenance');
    
    console.log('  ✓ Bridge neural operations test passed\n');
}

function testBridgeAttentionMask() {
    console.log('  Testing bridge attention mask...');
    
    const bridge = new TensorLogicBridge();
    const tensor = symbolicTensor(
        new Float32Array([1, 2, 3, 4]),
        [4],
        { '0': 'a', '1': 'b', '2': 'c' }
    );
    
    const mask = bridge.createAttentionMask(tensor, new Set(['a', 'c']));
    
    assert.equal(mask.data[0], 1, 'Should attend to a');
    assert.equal(mask.data[1], 0, 'Should not attend to b');
    assert.equal(mask.data[2], 1, 'Should attend to c');
    
    console.log('  ✓ Bridge attention mask test passed\n');
}

function testBridgeExtractRules() {
    console.log('  Testing bridge rule extraction...');

    const bridge = new TensorLogicBridge();
    const tensor = symbolicTensor(
        new Float32Array([0.9, 0.2, -0.8, 0.1]),
        [4],
        {
            '0': 'cause',
            '2': 'effect'
        }
    );

    const rules = bridge.extractRules(tensor, 0.7);

    assert.ok(rules.length >= 1, 'Should extract rules');
    assert.ok(rules.some(r => r.antecedent.includes('cause') || r.antecedent.includes('effect')), 'Should have symbolic rule');

    console.log('  ✓ Bridge rule extraction test passed\n');
}

// ========== Term Parsing Tests ==========
console.log('3️⃣ Term Parsing Tests\n');

function testTermToTensor() {
    console.log('  Testing term to tensor parsing...');
    
    const term = '(tensor_2x2:[a:0.9,b:0.8])';
    const tensor = termToTensor(term, [2, 2]);
    
    assert.ok(tensor, 'Should parse term');
    assert.equal(tensor.shape[0], 2, 'Should have correct shape');
    assert.ok(tensor.symbols.size > 0, 'Should have symbols');
    
    console.log('  ✓ Term to tensor parsing test passed\n');
}

// ========== SymbolicDifferentiation Tests ==========
console.log('4️⃣ SymbolicDifferentiation Tests\n');

function testDiffGradientComputation() {
    console.log('  Testing gradient computation...');

    const diff = new SymbolicDifferentiation();

    const param = symbolicTensor(
        new Float32Array([1, 2, 3]),
        [3],
        { '0': 'w1', '1': 'w2' }
    );

    const loss = () => param.data.reduce((sum, v) => sum + v * v, 0);
    const gradients = diff.gradient(loss, [param]);

    // gradients is an array of Float32Arrays
    assert.ok(gradients.length > 0, 'Should have gradients');
    assert.ok(gradients[0].data || gradients[0].length > 0, 'Should have gradient values');
    
    const gradData = gradients[0].data || gradients[0];
    assert.ok(Math.abs(gradData[0] - 2) < 0.5, 'Gradient should be ~2*w1');

    console.log('  ✓ Gradient computation test passed\n');
}

function testDiffGradientAnnotation() {
    console.log('  Testing gradient annotation...');
    
    const diff = new SymbolicDifferentiation({ symbolicThreshold: 0.1 });
    
    const param = symbolicTensor(
        new Float32Array([0.5, 0.5]),
        [2],
        { '0': { symbol: 'weight', confidence: 0.9 } }
    );
    
    const loss = () => param.data[0] * 2;
    const gradients = diff.gradient(loss, [param]);
    
    const symbolicGrad = diff.symbolicGradients.get(param);
    assert.ok(symbolicGrad, 'Should have symbolic gradient');
    
    console.log('  ✓ Gradient annotation test passed\n');
}

function testDiffExplainGradient() {
    console.log('  Testing gradient explanation...');
    
    const diff = new SymbolicDifferentiation();
    
    const param = symbolicTensor(
        new Float32Array([1, -1]),
        [2],
        { '0': { symbol: 'positive', confidence: 0.9 } }
    );
    
    const loss = () => param.data[0] + param.data[1];
    diff.gradient(loss, [param]);
    
    const explanation = diff.explainGradient(param);
    
    assert.ok(explanation.explanation, 'Should have explanation');
    assert.ok(Array.isArray(explanation.symbols), 'Should have symbols list');
    
    console.log('  ✓ Gradient explanation test passed\n');
}

function testDiffGradientFlowAnalysis() {
    console.log('  Testing gradient flow analysis...');
    
    const diff = new SymbolicDifferentiation();
    
    // Compute some gradients
    for (let i = 0; i < 5; i++) {
        const param = new SymbolicTensor(new Float32Array([0.1, 0.2]), [2]);
        const loss = () => param.data[0] * i;
        diff.gradient(loss, [param]);
    }
    
    const analysis = diff.analyzeGradientFlow();
    
    assert.equal(analysis.totalNodes, 5, 'Should track all nodes');
    assert.ok(analysis.avgMagnitude >= 0, 'Should have magnitude');
    
    console.log('  ✓ Gradient flow analysis test passed\n');
}

// ========== WorldModel Tests ==========
console.log('5️⃣ WorldModel Tests\n');

async function testWorldModelInitialization() {
    console.log('  Testing WorldModel initialization...');
    
    const wm = new WorldModel({
        horizon: 5,
        latentDim: 8,
        ensembleSize: 2
    });
    
    await wm.initialize();
    
    assert.equal(wm.models.length, 2, 'Should have ensemble');
    assert.equal(wm.getState('trained'), false, 'Should not be trained');
    
    await wm.shutdown();
    
    console.log('  ✓ WorldModel initialization test passed\n');
}

async function testWorldModelPrediction() {
    console.log('  Testing WorldModel prediction...');
    
    const wm = new WorldModel({
        horizon: 3,
        latentDim: 4,
        ensembleSize: 2
    });
    
    await wm.initialize();
    
    const state = new Float32Array([0.5, 0.3, 0.8, 0.2]);
    const { predictions, uncertainties, horizon } = wm.predict(state, 0, 2);
    
    assert.ok(predictions.length <= 2, 'Should predict up to horizon');
    assert.ok(uncertainties.length <= 2, 'Should have uncertainties');
    
    await wm.shutdown();
    
    console.log('  ✓ WorldModel prediction test passed\n');
}

async function testWorldModelTraining() {
    console.log('  Testing WorldModel training...');
    
    const wm = new WorldModel({ latentDim: 4, ensembleSize: 2 });
    await wm.initialize();
    
    const transitions = [];
    for (let i = 0; i < 20; i++) {
        transitions.push({
            state: new Float32Array([Math.random(), Math.random(), Math.random(), Math.random()]),
            action: Math.floor(Math.random() * 2),
            nextState: new Float32Array([Math.random(), Math.random(), Math.random(), Math.random()])
        });
    }
    
    await wm.train(transitions, 10);
    
    assert.equal(wm.getState('trained'), true, 'Should be trained');
    assert.ok(wm.getState('trainingStep') > 0, 'Should have training steps');
    
    await wm.shutdown();
    
    console.log('  ✓ WorldModel training test passed\n');
}

async function testWorldModelImagination() {
    console.log('  Testing WorldModel imagination...');
    
    const wm = new WorldModel({
        latentDim: 4,
        ensembleSize: 2,
        uncertaintyThreshold: 0.5
    });
    await wm.initialize();
    
    const state = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    const imagination = wm.imagine(state, [0, 1, 0, 1]);
    
    assert.ok('trajectory' in imagination, 'Should have trajectory');
    assert.ok('totalUncertainty' in imagination, 'Should have uncertainty');
    assert.ok('reliable' in imagination, 'Should have reliability');
    
    await wm.shutdown();
    
    console.log('  ✓ WorldModel imagination test passed\n');
}

async function testWorldModelUncertainty() {
    console.log('  Testing WorldModel uncertainty...');
    
    const wm = new WorldModel({ latentDim: 4, ensembleSize: 3 });
    await wm.initialize();
    
    const state = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const uncertainty = wm.getUncertainty(state, 0);
    
    assert.ok(typeof uncertainty === 'number', 'Should return number');
    assert.ok(uncertainty >= 0, 'Should be non-negative');
    
    await wm.shutdown();
    
    console.log('  ✓ WorldModel uncertainty test passed\n');
}

// ========== Run All Tests ==========
async function runAllTests() {
    try {
        // SymbolicTensor tests
        testSymbolicTensorCreation();
        testSymbolicTensorAnnotation();
        testSymbolicTensorProvenance();
        testSymbolicTensorNarsese();
        testSymbolicTensorProjection();
        testSymbolicTensorClone();
        testSymbolicTensorSerialization();
        
        // TensorLogicBridge tests
        testBridgeLiftToSymbols();
        testBridgeGroundToTensor();
        testBridgeSymbolicAdd();
        testBridgeSymbolicMul();
        testBridgeNeuralOp();
        testBridgeAttentionMask();
        testBridgeExtractRules();
        
        // Term parsing tests
        testTermToTensor();
        
        // SymbolicDifferentiation tests
        testDiffGradientComputation();
        testDiffGradientAnnotation();
        testDiffExplainGradient();
        testDiffGradientFlowAnalysis();
        
        // WorldModel tests
        await testWorldModelInitialization();
        await testWorldModelPrediction();
        await testWorldModelTraining();
        await testWorldModelImagination();
        await testWorldModelUncertainty();
        
        console.log('✅ All Neuro-Symbolic Primitives Tests Passed!\n');
        return true;
    } catch (error) {
        console.error('❌ Test Failed:', error);
        process.exit(1);
    }
}

runAllTests();
