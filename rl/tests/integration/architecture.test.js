/**
 * Integration Tests for Unified Neuro-Symbolic Architecture
 */
import { strict as assert } from 'assert';
import {
    ArchitectureConfig,
    NeuroSymbolicUnit,
    NeuroSymbolicLayer,
    ArchitectureBuilder,
    NeuroSymbolicArchitecture,
    ArchitectureTemplates,
    ArchitectureFactory
} from '../../src/architecture/NeuroSymbolicArchitecture.js';

import {
    Plugin,
    PluginManager,
    SymbolicGroundingPlugin,
    AttentionPlugin,
    MemoryPlugin,
    IntrinsicMotivationPlugin,
    PluginPresets
} from '../../src/plugins/PluginSystem.js';

import {
    HyperparameterSpace,
    ConfigManager,
    HyperparameterOptimizer,
    HyperparameterSpaces,
    ConfigPresets
} from '../../src/config/ConfigManager.js';

import {
    CrossModalAttention,
    SymbolicAttention,
    NeuroSymbolicFusion
} from '../../src/attention/CrossModalAttention.js';

import {
    CausalGraph,
    CausalReasoner
} from '../../src/reasoning/CausalReasoning.js';

import {
    TrainingConfig,
    TrainingLoop,
    TrainingPresets,
    EpisodeResult
} from '../../src/training/TrainingLoop.js';

console.log('🧪 Running Integration Tests for Unified Architecture...\n');

// ========== Architecture Tests ==========
console.log('1️⃣ Architecture Tests\n');

function testArchitectureConfig() {
    console.log('  Testing ArchitectureConfig...');
    
    const config = new ArchitectureConfig({
        architecture: 'dual-process',
        learningRate: 0.001,
        hyperparams: { batchSize: 64 }
    });
    
    assert.equal(config.architecture, 'dual-process');
    assert.equal(config.hyperparams.learningRate, 0.001);
    assert.equal(config.hyperparams.batchSize, 64);
    
    const cloned = config.clone({ architecture: 'neural' });
    assert.equal(cloned.architecture, 'neural');
    assert.equal(config.architecture, 'dual-process', 'Original unchanged');
    
    console.log('  ✓ ArchitectureConfig test passed\n');
}

async function testNeuroSymbolicUnit() {
    console.log('  Testing NeuroSymbolicUnit...');
    
    const unit = new NeuroSymbolicUnit({
        inputDim: 8,
        hiddenDim: 16,
        outputDim: 4
    });
    
    await unit.initialize();
    
    const input = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    const result = await unit.process(input, { lift: true, ground: false });
    
    assert.ok(result, 'Should produce output');
    
    await unit.shutdown();
    
    console.log('  ✓ NeuroSymbolicUnit test passed\n');
}

async function testNeuroSymbolicLayer() {
    console.log('  Testing NeuroSymbolicLayer...');
    
    const layer = new NeuroSymbolicLayer({
        type: 'feedforward',
        units: 4,
        id: 'test_layer'
    });
    
    await layer.initialize();
    
    const input = [0.1, 0.2, 0.3, 0.4];
    const output = await layer.process(input);
    
    assert.ok(output, 'Should produce output');
    assert.equal(layer.units.length, 4, 'Should have 4 units');
    
    await layer.shutdown();
    
    console.log('  ✓ NeuroSymbolicLayer test passed\n');
}

async function testArchitectureBuilder() {
    console.log('  Testing ArchitectureBuilder...');
    
    const architecture = await new ArchitectureBuilder()
        .withConfig({ architecture: 'custom' })
        .addPerceptionLayer({ units: 16 })
        .addReasoningLayer({ units: 32 })
        .addActionLayer({ units: 8 })
        .chain()
        .withResidualConnections()
        .build();
    
    assert.ok(architecture, 'Should build architecture');
    assert.equal(architecture.layers.size, 3, 'Should have 3 layers');
    
    await architecture.initialize();
    await architecture.shutdown();
    
    console.log('  ✓ ArchitectureBuilder test passed\n');
}

function testArchitectureTemplates() {
    console.log('  Testing ArchitectureTemplates...');
    
    const templates = Object.keys(ArchitectureTemplates);
    assert.ok(templates.includes('dualProcess'), 'Should have dualProcess');
    assert.ok(templates.includes('neural'), 'Should have neural');
    assert.ok(templates.includes('symbolic'), 'Should have symbolic');
    assert.ok(templates.includes('hierarchical'), 'Should have hierarchical');
    assert.ok(templates.includes('attention'), 'Should have attention');
    assert.ok(templates.includes('worldModel'), 'Should have worldModel');
    
    console.log('  ✓ ArchitectureTemplates test passed\n');
}

async function testArchitectureFactory() {
    console.log('  Testing ArchitectureFactory...');
    
    const arch = await ArchitectureFactory.create('dualProcess', {
        learningRate: 0.001
    });
    
    assert.ok(arch, 'Should create architecture');
    
    const available = ArchitectureFactory.list();
    assert.ok(available.length > 0, 'Should list architectures');
    
    await arch.initialize();
    await arch.shutdown();
    
    console.log('  ✓ ArchitectureFactory test passed\n');
}

// ========== Plugin System Tests ==========
console.log('2️⃣ Plugin System Tests\n');

async function testPluginBasics() {
    console.log('  Testing Plugin basics...');
    
    const plugin = new Plugin({ name: 'test', version: '1.0.0' });
    
    plugin.hook('test-hook', (data) => data * 2);
    
    const result = await plugin.execute('test-hook', 5);
    assert.equal(result, 10, 'Should execute hook');
    
    console.log('  ✓ Plugin basics test passed\n');
}

async function testPluginManager() {
    console.log('  Testing PluginManager...');
    
    const manager = new PluginManager({ autoInstall: false });
    
    const plugin = new SymbolicGroundingPlugin();
    manager.register('grounding', plugin);
    
    assert.ok(manager.get('grounding'), 'Should get plugin');
    assert.equal(manager.list().length, 1, 'Should list plugins');
    
    await manager.installAll({ test: true });
    
    const installed = manager.get('grounding');
    assert.equal(installed.getState('installed'), true, 'Should be installed');
    
    await manager.shutdown();
    
    console.log('  ✓ PluginManager test passed\n');
}

function testPluginPresets() {
    console.log('  Testing PluginPresets...');
    
    assert.ok(PluginPresets.minimal, 'Should have minimal preset');
    assert.ok(PluginPresets.standard, 'Should have standard preset');
    assert.ok(PluginPresets.full, 'Should have full preset');
    
    assert.equal(PluginPresets.minimal.length, 1, 'Minimal should have 1 plugin');
    assert.equal(PluginPresets.standard.length, 3, 'Standard should have 3 plugins');
    assert.equal(PluginPresets.full.length, 4, 'Full should have 4 plugins');
    
    console.log('  ✓ PluginPresets test passed\n');
}

async function testIntrinsicMotivationPlugin() {
    console.log('  Testing IntrinsicMotivationPlugin...');
    
    const plugin = new IntrinsicMotivationPlugin({ mode: 'novelty', weight: 0.1 });
    
    const transition1 = { state: [1, 2, 3], reward: 1 };
    const transition2 = { state: [1, 2, 3], reward: 1 }; // Same state
    const transition3 = { state: [4, 5, 6], reward: 1 }; // Different state
    
    const reward1 = await plugin.hooks.get('reward')(1, transition1);
    plugin.hooks.get('update')(transition1);
    
    const reward2 = await plugin.hooks.get('reward')(1, transition2);
    plugin.hooks.get('update')(transition2);
    
    const reward3 = await plugin.hooks.get('reward')(1, transition3);
    
    // Novel state should get higher reward
    assert.ok(reward3 > reward2, 'Novel state should get higher reward');
    
    console.log('  ✓ IntrinsicMotivationPlugin test passed\n');
}

// ========== Configuration Tests ==========
console.log('3️⃣ Configuration Tests\n');

function testHyperparameterSpace() {
    console.log('  Testing HyperparameterSpace...');
    
    const space = new HyperparameterSpace({
        learningRate: { type: 'float', min: 0.0001, max: 0.01, default: 0.001, scale: 'log' },
        batchSize: { type: 'int', min: 8, max: 128, default: 32 },
        activation: { type: 'categorical', choices: ['relu', 'tanh', 'sigmoid'], default: 'relu' }
    });
    
    assert.equal(space.get('learningRate'), 0.001);
    assert.equal(space.get('batchSize'), 32);
    
    space.set('learningRate', 0.005);
    assert.equal(space.get('learningRate'), 0.005);
    
    const sampled = space.sample();
    assert.ok('learningRate' in sampled, 'Should sample learningRate');
    assert.ok('batchSize' in sampled, 'Should sample batchSize');
    assert.ok('activation' in sampled, 'Should sample activation');
    
    console.log('  ✓ HyperparameterSpace test passed\n');
}

function testConfigManager() {
    console.log('  Testing ConfigManager...');
    
    const config = new ConfigManager({ learningRate: 0.001, batchSize: 32 });
    
    assert.equal(config.get('learningRate'), 0.001);
    
    config.set('learningRate', 0.01);
    assert.equal(config.get('learningRate'), 0.01);
    
    config.batch({ learningRate: 0.001, batchSize: 64 });
    assert.equal(config.get('batchSize'), 64);
    
    const diff = config.getDiff();
    assert.ok('learningRate' in diff || 'batchSize' in diff, 'Should track diff');
    
    console.log('  ✓ ConfigManager test passed\n');
}

async function testHyperparameterOptimizer() {
    console.log('  Testing HyperparameterOptimizer...');
    
    const space = new HyperparameterSpace({
        x: { type: 'float', min: 0, max: 10, default: 5 },
        y: { type: 'float', min: 0, max: 10, default: 5 }
    });
    
    // Objective: maximize (x-5)^2 + (y-5)^2
    const objective = async (config) => {
        return -Math.pow(config.x - 5, 2) - Math.pow(config.y - 5, 2);
    };
    
    const optimizer = new HyperparameterOptimizer(space, objective);
    const best = await optimizer.randomSearch(20);
    
    assert.ok(best, 'Should find best config');
    assert.ok('config' in best, 'Should have config');
    assert.ok('score' in best, 'Should have score');
    
    console.log('  ✓ HyperparameterOptimizer test passed\n');
}

function testConfigPresets() {
    console.log('  Testing ConfigPresets...');
    
    assert.ok(ConfigPresets.fast, 'Should have fast preset');
    assert.ok(ConfigPresets.standard, 'Should have standard preset');
    assert.ok(ConfigPresets.performance, 'Should have performance preset');
    
    assert.equal(ConfigPresets.fast.learningRate, 0.01, 'Fast should have high LR');
    assert.equal(ConfigPresets.performance.learningRate, 0.0003, 'Performance should have low LR');
    
    console.log('  ✓ ConfigPresets test passed\n');
}

// ========== Attention Tests ==========
console.log('4️⃣ Attention Tests\n');

function testCrossModalAttention() {
    console.log('  Testing CrossModalAttention...');
    
    const attention = new CrossModalAttention({
        neuralDim: 8,
        symbolDim: 4,
        attentionDim: 8,
        heads: 2
    });
    
    const neuralInput = { data: new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) };
    const symbolicInput = { data: new Float32Array([0.9, 0.1, 0.8, 0.2]) };
    
    const output = attention.attend(neuralInput, symbolicInput);
    
    assert.ok(output, 'Should produce output');
    assert.ok(output.data, 'Should have data');
    
    console.log('  ✓ CrossModalAttention test passed\n');
}

function testSymbolicAttention() {
    console.log('  Testing SymbolicAttention...');
    
    const attention = new SymbolicAttention({ dim: 8 });
    
    const query = { data: new Float32Array([0.5, 0.5, 0.5, 0.5]) };
    const concepts = [
        { data: new Float32Array([1, 0, 0, 0]) },
        { data: new Float32Array([0, 1, 0, 0]) },
        { data: new Float32Array([0, 0, 1, 0]) }
    ];
    
    const result = attention.attend(query, concepts);
    
    assert.ok(result, 'Should produce attended output');
    
    // sparseAttend returns weighted concepts
    const sparse = attention.sparseAttend(query, concepts, 2);
    assert.ok(sparse, 'Should return sparse results');
    
    console.log('  ✓ SymbolicAttention test passed\n');
}

function testNeuroSymbolicFusion() {
    console.log('  Testing NeuroSymbolicFusion...');
    
    const fusion = new NeuroSymbolicFusion({ mode: 'gated' });
    
    const neural = { data: new Float32Array([0.8, 0.2, 0.6, 0.4]) };
    const symbolic = { data: new Float32Array([0.1, 0.9, 0.3, 0.7]) };
    
    const fused = fusion.fuse(neural, symbolic);
    
    assert.ok(fused, 'Should produce fused output');
    assert.ok(fused.data, 'Should have data');
    
    const gate = fusion.getGate();
    assert.ok(typeof gate === 'number', 'Should have gate value');
    assert.ok(gate >= 0 && gate <= 1, 'Gate should be in [0, 1]');
    
    console.log('  ✓ NeuroSymbolicFusion test passed\n');
}

// ========== Causal Reasoning Tests ==========
console.log('5️⃣ Causal Reasoning Tests\n');

function testCausalGraph() {
    console.log('  Testing CausalGraph...');
    
    const graph = new CausalGraph();
    
    graph.addNode('A', { type: 'cause' });
    graph.addNode('B', { type: 'effect' });
    graph.addNode('C', { type: 'effect' });
    
    graph.addEdge('A', 'B', 0.8);
    graph.addEdge('A', 'C', 0.6);
    graph.addEdge('B', 'C', 0.4);
    
    assert.equal(graph.nodes.size, 3, 'Should have 3 nodes');
    assert.equal(graph.edges.size, 3, 'Should have 3 edges');
    
    graph.observe('A', 0.9);
    
    const nodeA = graph.nodes.get('A');
    assert.equal(nodeA.probability, 0.9, 'Should observe value');
    assert.equal(nodeA.state, 'observed', 'Should be observed state');
    
    const effect = graph.intervene('A', 1.0);
    assert.ok(effect, 'Should compute effect');
    
    const paths = graph.findPaths('A', 'C');
    assert.ok(paths.length > 0, 'Should find paths');
    
    console.log('  ✓ CausalGraph test passed\n');
}

function testCausalReasoner() {
    console.log('  Testing CausalReasoner...');
    
    const graph = new CausalGraph();
    graph.addNode('rain');
    graph.addNode('sprinkler');
    graph.addNode('wet_grass');
    
    graph.addEdge('rain', 'wet_grass', 0.9);
    graph.addEdge('sprinkler', 'wet_grass', 0.8);
    
    const reasoner = new CausalReasoner({ graph });
    
    graph.observe('rain', 0.3);
    graph.observe('sprinkler', 0.5);
    
    const explanation = reasoner.explain('wet_grass');
    
    assert.ok(explanation, 'Should provide explanation');
    assert.ok('explanation' in explanation, 'Should have explanation text');
    assert.ok('factors' in explanation, 'Should have factors');
    
    console.log('  ✓ CausalReasoner test passed\n');
}

// ========== Training Loop Tests ==========
console.log('6️⃣ Training Loop Tests\n');

function testTrainingConfig() {
    console.log('  Testing TrainingConfig...');
    
    const config = new TrainingConfig({
        episodes: 100,
        useWorldModel: true,
        useSkillDiscovery: true
    });
    
    assert.equal(config.episodes, 100);
    assert.equal(config.useWorldModel, true);
    assert.equal(config.useSkillDiscovery, true);
    assert.ok(config.paradigms.modelFree, 'Should default to model-free');
    
    console.log('  ✓ TrainingConfig test passed\n');
}

function testTrainingPresets() {
    console.log('  Testing TrainingPresets...');
    
    assert.ok(TrainingPresets.prototype, 'Should have prototype preset');
    assert.ok(TrainingPresets.standard, 'Should have standard preset');
    assert.ok(TrainingPresets.modelBased, 'Should have modelBased preset');
    assert.ok(TrainingPresets.hierarchical, 'Should have hierarchical preset');
    assert.ok(TrainingPresets.causal, 'Should have causal preset');
    
    assert.equal(TrainingPresets.prototype.episodes, 100, 'Prototype should have 100 episodes');
    assert.equal(TrainingPresets.standard.episodes, 1000, 'Standard should have 1000 episodes');
    
    console.log('  ✓ TrainingPresets test passed\n');
}

function testEpisodeResult() {
    console.log('  Testing EpisodeResult...');
    
    const result = new EpisodeResult(5, 150.5, 200, true, { extra: 'data' });
    
    assert.equal(result.episode, 5);
    assert.equal(result.reward, 150.5);
    assert.equal(result.steps, 200);
    assert.equal(result.success, true);
    assert.ok(result.timestamp > 0, 'Should have timestamp');
    
    const json = result.toJSON();
    assert.ok('episode' in json, 'Should serialize');
    
    console.log('  ✓ EpisodeResult test passed\n');
}

// ========== Run All Tests ==========
async function runAllTests() {
    try {
        // Architecture tests
        testArchitectureConfig();
        await testNeuroSymbolicUnit();
        await testNeuroSymbolicLayer();
        await testArchitectureBuilder();
        testArchitectureTemplates();
        await testArchitectureFactory();
        
        // Plugin tests
        testPluginBasics();
        await testPluginManager();
        testPluginPresets();
        await testIntrinsicMotivationPlugin();
        
        // Configuration tests
        testHyperparameterSpace();
        testConfigManager();
        await testHyperparameterOptimizer();
        testConfigPresets();
        
        // Attention tests
        testCrossModalAttention();
        testSymbolicAttention();
        testNeuroSymbolicFusion();
        
        // Causal reasoning tests
        testCausalGraph();
        testCausalReasoner();
        
        // Training tests
        testTrainingConfig();
        testTrainingPresets();
        testEpisodeResult();
        
        console.log('✅ All Integration Tests Passed!\n');
        return true;
    } catch (error) {
        console.error('❌ Test Failed:', error);
        process.exit(1);
    }
}

runAllTests();
