/**
 * Example: Neuro-Symbolic Integration with Tensor-Logic Bridge
 *
 * This example demonstrates bidirectional conversion between
 * neural tensors and symbolic reasoning for explainable AI.
 */

import {
    SymbolicDifferentiation,
    symbolicTensor,
    SymbolicTensor,
    TensorLogicBridge,
    termToTensor,
    WorldModel
} from '../src/index.js';

async function main() {
    console.log('🔗 Neuro-Symbolic Integration Example\n');

    // Create tensor-logic bridge
    const bridge = new TensorLogicBridge({
        defaultSymbolThreshold: 0.5,
        defaultConfidence: 0.8
    });

    // Register custom grounding functions
    bridge.registerGrounding('vision', (tensor) => {
        // Convert visual features to symbols
        const symbols = [];
        for (let i = 0; i < tensor.data.length; i++) {
            if (tensor.data[i] > 0.7) {
                symbols.push(`feature_${i}_active`);
            }
        }
        return symbols;
    });

    // ========== Symbolic Tensor Creation ==========
    console.log('1️⃣ Creating Symbolic Tensors\n');

    const tensor1 = symbolicTensor(
        new Float32Array([0.8, 0.2, 0.9, 0.1]),
        [2, 2],
        {
            '0,0': {symbol: 'goal_visible', confidence: 0.95},
            '1,1': {symbol: 'obstacle_near', confidence: 0.8}
        }
    );

    console.log('Tensor 1:');
    console.log(`  Shape: [${tensor1.shape}]`);
    console.log(`  Data: [${tensor1.data.join(', ')}]`);
    console.log(`  Narsese Term: ${tensor1.toNarseseTerm('obs')}`);
    console.log(`  Symbols: ${Array.from(tensor1.symbols.entries()).map(([k, v]) => `${k}=${v.symbol}`).join(', ')}`);
    console.log();

    const tensor2 = symbolicTensor(
        new Float32Array([0.3, 0.7, 0.2, 0.85]),
        [2, 2],
        {
            '0,1': {symbol: 'path_clear', confidence: 0.85},
            '1,0': {symbol: 'danger_zone', confidence: 0.7}
        }
    );

    console.log('Tensor 2:');
    console.log(`  Shape: [${tensor2.shape}]`);
    console.log(`  Data: [${tensor2.data.join(', ')}]`);
    console.log(`  Narsese Term: ${tensor2.toNarseseTerm('obs')}`);
    console.log();

    // ========== Symbolic Operations ==========
    console.log('2️⃣ Symbolic Tensor Operations\n');

    // Symbolic addition with union
    const sum = bridge.symbolicAdd(tensor1, tensor2, 'union');
    console.log('Symbolic Addition (Union):');
    console.log(`  Result Data: [${sum.data.join(', ')}]`);
    console.log(`  Result Symbols: ${Array.from(sum.symbols.entries()).map(([k, v]) => `${k}=${v.symbol}`).join(', ')}`);
    console.log();

    // Symbolic multiplication with intersection
    const product = bridge.symbolicMul(tensor1, tensor2, 'intersection');
    console.log('Symbolic Multiplication (Intersection):');
    console.log(`  Result Data: [${product.data.join(', ')}]`);
    console.log(`  Result Symbols: ${Array.from(product.symbols.entries()).map(([k, v]) => `${k}=${v.symbol}`).join(', ')}`);
    console.log();

    // ========== Neural Operations with Symbolic Tracking ==========
    console.log('3️⃣ Neural Operations with Symbolic Tracking\n');

    // Apply ReLU with symbol propagation
    const reluResult = bridge.neuralOp('relu', tensor1);
    console.log('ReLU Operation:');
    console.log(`  Result Data: [${reluResult.data.join(', ')}]`);
    console.log(`  Provenance: ${reluResult.provenance.map(p => p.operation).join(' → ')}`);
    console.log();

    // Symbolic softmax
    const softmaxResult = bridge.symbolicSoftmax(tensor1);
    console.log('Symbolic Softmax:');
    console.log(`  Result Data: [${softmaxResult.data.map(v => v.toFixed(4)).join(', ')}]`);
    console.log();

    // ========== Symbol to Tensor and Back ==========
    console.log('4️⃣ Bidirectional Conversion\n');

    // Lift tensor to symbols
    const symbols = bridge.liftToSymbols(tensor1, {threshold: 0.3});
    console.log('Lifted Symbols:');
    for (const sym of symbols) {
        console.log(`  Index ${sym.index}: ${sym.symbol} (confidence: ${sym.confidence}, value: ${sym.value})`);
    }
    console.log();

    // Ground symbols back to tensor
    const grounded = bridge.groundToTensor(symbols, [4]);
    console.log('Grounded Tensor:');
    console.log(`  Data: [${grounded.data.join(', ')}]`);
    console.log();

    // ========== Rule Extraction ==========
    console.log('5️⃣ Rule Extraction\n');

    const rules = bridge.extractRules(tensor1, 0.5);
    console.log('Extracted Rules:');
    for (const rule of rules) {
        console.log(`  ${rule.antecedent} → ${rule.consequent} (strength: ${rule.strength}, evidence: ${rule.evidence})`);
    }
    console.log();

    // ========== Attention Masking ==========
    console.log('6️⃣ Symbolic Attention\n');

    const symbolMask = new Set(['goal_visible', 'path_clear']);
    const attentionMask = bridge.createAttentionMask(tensor1, symbolMask);
    console.log('Attention Mask:');
    console.log(`  Mask Data: [${attentionMask.data.join(', ')}]`);

    const attended = bridge.symbolicMul(tensor1, attentionMask, 'intersection');
    console.log(`  Attended Result: [${attended.data.join(', ')}]`);
    console.log();

    // ========== Symbolic Differentiation ==========
    console.log('7️⃣ Symbolic Differentiation\n');

    const diff = new SymbolicDifferentiation({
        trackProvenance: true,
        symbolicThreshold: 0.3
    });

    // Create parameter tensor with symbols
    const param = symbolicTensor(
        new Float32Array([0.5, 0.3, 0.8, 0.2]),
        [2, 2],
        {
            '0,0': {symbol: 'weight_goal', confidence: 0.9},
            '1,0': {symbol: 'weight_danger', confidence: 0.7}
        }
    );

    // Define loss function
    const loss = () => {
        return param.data.reduce((sum, v) => sum + v * v, 0);
    };

    // Compute gradient
    const gradients = diff.gradient(loss, [param]);
    console.log('Gradient Computation:');
    console.log(`  Gradient: [${gradients[0].join(', ')}]`);
    console.log();

    // Explain gradient
    const explanation = diff.explainGradient(param);
    console.log('Gradient Explanation:');
    console.log(`  ${explanation.explanation}`);
    for (const sym of explanation.symbols) {
        console.log(`    ${sym.symbol}: ${sym.gradient.toFixed(4)} (${sym.interpretation})`);
    }
    console.log();

    // Analyze gradient flow
    const flowAnalysis = diff.analyzeGradientFlow();
    console.log('Gradient Flow Analysis:');
    console.log(`  Total Nodes: ${flowAnalysis.totalNodes}`);
    console.log(`  Avg Magnitude: ${flowAnalysis.avgMagnitude.toFixed(6)}`);
    console.log(`  Vanishing: ${flowAnalysis.vanishingGradients}`);
    console.log(`  Exploding: ${flowAnalysis.explodingGradients}`);
    console.log();

    // ========== World Model ==========
    console.log('8️⃣ World Model Learning\n');

    const worldModel = new WorldModel({
        horizon: 5,
        latentDim: 8,
        ensembleSize: 3,
        uncertaintyThreshold: 0.3
    });

    await worldModel.initialize();

    // Generate synthetic training data
    const transitions = [];
    for (let i = 0; i < 100; i++) {
        const state = new Float32Array(8).map(() => Math.random());
        const action = Math.floor(Math.random() * 4);
        const nextState = state.map((v, idx) => (v + Math.random() * 0.1) % 1);

        transitions.push({
            state: symbolicTensor(state, [8], {
                '0': {symbol: `state_${i}`, confidence: 0.8}
            }),
            action,
            nextState: symbolicTensor(nextState, [8])
        });
    }

    // Train world model
    console.log('Training World Model...');
    await worldModel.train(transitions, 50);
    console.log(`  Training Complete (step: ${worldModel.getState('trainingStep')})`);
    console.log();

    // Predict with world model
    const testState = symbolicTensor(
        new Float32Array([0.5, 0.3, 0.8, 0.2, 0.6, 0.4, 0.9, 0.1]),
        [8],
        {'0': {symbol: 'test_state', confidence: 0.9}}
    );

    const prediction = worldModel.predict(testState, 1, 3);
    console.log('World Model Prediction:');
    console.log(`  Horizon: ${prediction.horizon}`);
    console.log(`  Final Uncertainty: ${prediction.uncertainties[prediction.uncertainties.length - 1]?.toFixed(4)}`);
    console.log();

    // Imagine trajectory
    const imagination = worldModel.imagine(testState, [0, 1, 2, 3]);
    console.log('Imagined Trajectory:');
    for (const step of imagination.trajectory) {
        console.log(`  ${step.state} --a_${step.action}--> ${step.nextState} (uncertainty: ${step.uncertainty.toFixed(4)})`);
    }
    console.log(`  Total Uncertainty: ${imagination.totalUncertainty.toFixed(4)}`);
    console.log(`  Reliable: ${imagination.reliable}`);
    console.log();

    // Get symbolic rules from world model
    const wmRules = worldModel.getSymbolicRules();
    console.log('World Model Symbolic Rules:');
    for (const [model, rules] of wmRules.slice(0, 2)) {
        console.log(`  ${model}: ${rules.length} rules`);
        for (const rule of rules.slice(0, 3)) {
            console.log(`    ${rule.from} → ${rule.to} (strength: ${rule.strength.toFixed(3)})`);
        }
    }
    console.log();

    // ========== Term Parsing ==========
    console.log('9️⃣ Narsese Term Parsing\n');

    const term = '(obs_2x2:[goal_visible:0.95,obstacle_near:0.80])';
    const parsed = termToTensor(term, [2, 2]);

    if (parsed) {
        console.log(`Parsed Term: ${term}`);
        console.log(`  Shape: [${parsed.shape}]`);
        console.log(`  Symbols: ${Array.from(parsed.symbols.entries()).map(([k, v]) => `${k}=${v.symbol}:${v.confidence}`).join(', ')}`);
    }
    console.log();

    // ========== Serialization ==========
    console.log('🔟 Serialization\n');

    const serialized = tensor1.toJSON();
    console.log('Serialized SymbolicTensor:');
    console.log(`  ${JSON.stringify(serialized, null, 2).slice(0, 200)}...`);
    console.log();

    const deserialized = SymbolicTensor.fromJSON(serialized);
    console.log('Deserialized Tensor:');
    console.log(`  Data matches: ${tensor1.data.every((v, i) => v === deserialized.data[i])}`);
    console.log(`  Symbols match: ${tensor1.symbols.size === deserialized.symbols.size}`);
    console.log();

    // Cleanup
    await worldModel.shutdown();

    console.log('✅ Neuro-Symbolic Integration Example Complete!\n');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Error:', err);
            process.exit(1);
        });
}

export {main};
