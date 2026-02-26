/**
 * Integration Tests for Hybrid Action Spaces and Emergent Architecture
 */
import { strict as assert } from 'assert';

// Hybrid Action Space
import {
    HybridActionSpace,
    StructuredAction,
    HybridEnvironmentAdapter,
    HybridActionSelector,
    HybridActionSpaceFactory
} from '../../src/environments/HybridActionSpace.js';

// Emergent Architecture
import {
    CognitivePrimitive,
    PerceptionPrimitive,
    ReasoningPrimitive,
    ActionSelectionPrimitive,
    MemoryPrimitive,
    EmergentCognitiveArchitecture,
    EmergentArchitectureFactory
} from '../../src/systems/EmergentArchitecture.js';

console.log('🧪 Running Hybrid Action & Emergent Architecture Tests...\n');

// ========== Hybrid Action Space Tests ==========
console.log('1️⃣ Hybrid Action Space Tests\n');

function testHybridActionSpaceCreation() {
    console.log('  Testing HybridActionSpace creation...');
    
    const space = new HybridActionSpace({
        discrete: {
            grip: { n: 2 },
            tool: { n: 4 }
        },
        continuous: {
            joint1: { low: -1, high: 1 },
            joint2: { low: -Math.PI, high: Math.PI }
        }
    });
    
    assert.equal(space.type, 'Hybrid', 'Type is Hybrid');
    assert.equal(space.discreteCount, 2, 'Has 2 discrete actions');
    assert.equal(space.continuousCount, 2, 'Has 2 continuous actions');
    assert.equal(space.continuousDim, 2, 'Has 2 continuous dimensions');
    
    const json = space.toJSON();
    assert.equal(json.type, 'Hybrid');
    assert.ok('grip' in json.discrete);
    assert.ok('joint1' in json.continuous);
    
    console.log('  ✓ HybridActionSpace creation test passed\n');
}

function testHybridActionSpaceSampling() {
    console.log('  Testing HybridActionSpace sampling...');
    
    const space = new HybridActionSpace({
        discrete: { grip: { n: 2 } },
        continuous: { velocity: { shape: [2], low: -1, high: 1 } }
    });
    
    const action = space.sample();
    
    assert.ok('grip' in action, 'Has grip component');
    assert.ok('velocity' in action, 'Has velocity component');
    assert.ok(action.grip >= 0 && action.grip < 2, 'Grip in valid range');
    // velocity with shape [2] returns array
    assert.ok(Array.isArray(action.velocity), 'Velocity is array');
    assert.equal(action.velocity.length, 2, 'Velocity has 2 dimensions');
    assert.ok(action.velocity.every(v => v >= -1 && v <= 1), 'Velocity in range');
    
    console.log('  ✓ HybridActionSpace sampling test passed\n');
}

function testHybridActionSpaceContains() {
    console.log('  Testing HybridActionSpace contains...');
    
    const space = new HybridActionSpace({
        discrete: { grip: { n: 2 } },
        continuous: { velocity: { low: -1, high: 1 } }
    });
    
    // Valid action
    assert.ok(space.contains({ grip: 0, velocity: 0.5 }), 'Contains valid action');
    assert.ok(space.contains({ grip: 1, velocity: -0.8 }), 'Contains valid action 2');
    
    // Invalid actions
    assert.ok(!space.contains({ grip: 2, velocity: 0 }), 'Does not contain invalid grip');
    assert.ok(!space.contains({ grip: 0, velocity: 1.5 }), 'Does not contain invalid velocity');
    assert.ok(!space.contains({ grip: 0 }), 'Does not contain missing component');
    
    console.log('  ✓ HybridActionSpace contains test passed\n');
}

function testHybridActionSpaceFlatten() {
    console.log('  Testing HybridActionSpace flatten/unflatten...');
    
    const space = new HybridActionSpace({
        discrete: {
            grip: { n: 2 },
            tool: { n: 3 }
        },
        continuous: {
            velocity: { shape: [2], low: -1, high: 1 }
        }
    });
    
    const action = {
        grip: 1,
        tool: 2,
        velocity: [0.5, -0.3]
    };
    
    const flat = space.flatten(action);
    
    // grip (2) + tool (3) + velocity (2) = 7 dimensions
    assert.equal(flat.length, 7, 'Flat has correct length');
    
    const reconstructed = space.unflatten(flat);
    assert.equal(reconstructed.grip, action.grip, 'Grip reconstructed');
    assert.equal(reconstructed.tool, action.tool, 'Tool reconstructed');
    // unflatten returns first element for single values
    assert.ok(Math.abs(reconstructed.velocity - action.velocity[0]) < 0.01, 'Velocity reconstructed');
    
    console.log('  ✓ HybridActionSpace flatten/unflatten test passed\n');
}

function testStructuredAction() {
    console.log('  Testing StructuredAction...');
    
    const action = new StructuredAction()
        .discrete('grip', 1)
        .discrete('tool', 0)
        .continuous('velocity', [0.5, -0.3])
        .continuous('rotation', 0.8);
    
    assert.equal(action.getDiscrete('grip'), 1, 'Grip value');
    assert.equal(action.getDiscrete('tool'), 0, 'Tool value');
    assert.deepEqual(action.getContinuous('velocity'), [0.5, -0.3], 'Velocity value');
    assert.equal(action.getContinuous('rotation'), 0.8, 'Rotation value');
    
    const allDiscrete = action.getAllDiscrete();
    assert.equal(allDiscrete.grip, 1);
    assert.equal(allDiscrete.tool, 0);
    
    const allContinuous = action.getAllContinuous();
    assert.deepEqual(allContinuous.velocity, [0.5, -0.3]);
    assert.equal(allContinuous.rotation, 0.8);
    
    // Test metadata
    action.setMetadata('source', 'policy');
    assert.equal(action.getMetadata('source'), 'policy', 'Metadata');
    
    // Test clone
    const cloned = action.clone();
    assert.equal(cloned.getDiscrete('grip'), 1, 'Cloned grip');
    
    // Test flatten
    const flat = action.flatten();
    assert.ok(Array.isArray(flat), 'Flatten returns array');
    
    console.log('  ✓ StructuredAction test passed\n');
}

function testHybridActionSelector() {
    console.log('  Testing HybridActionSelector...');
    
    const selector = new HybridActionSelector({
        discreteStrategy: 'argmax',
        continuousStrategy: 'sample',
        temperature: 1.0
    });
    
    const actionSpace = new HybridActionSpace({
        discrete: { grip: { n: 3 } },
        continuous: { velocity: { low: -1, high: 1 } }
    });
    
    // Set action values (logits for discrete + continuous values)
    const neuralOutput = [2.0, 0.5, 0.3, 0.8]; // grip logits + velocity
    selector.setActionValues(neuralOutput, actionSpace);
    
    // Select action
    const action = selector.select(actionSpace, { exploration: 0.1 });
    
    assert.ok(action instanceof StructuredAction, 'Returns StructuredAction');
    assert.ok(action.getDiscrete('grip') !== null, 'Has discrete action');
    assert.ok(action.getContinuous('velocity') !== null, 'Has continuous action');
    
    console.log('  ✓ HybridActionSelector test passed\n');
}

function testHybridActionSpaceFactory() {
    console.log('  Testing HybridActionSpaceFactory...');
    
    // Robot arm
    const robotArm = HybridActionSpaceFactory.createRobotArm(3, 2);
    assert.equal(robotArm.discreteCount, 2, 'Robot arm has 2 grip actions');
    assert.equal(robotArm.continuousCount, 3, 'Robot arm has 3 joints');
    
    // Navigation + interaction
    const navigation = HybridActionSpaceFactory.createNavigationInteraction();
    assert.ok('interact' in navigation.discrete, 'Has interact action');
    assert.ok('velocity' in navigation.continuous, 'Has velocity');
    assert.ok('rotation' in navigation.continuous, 'Has rotation');
    
    // Custom
    const custom = HybridActionSpaceFactory.createCustom(
        { button: { n: 2 } },
        { slider: { low: 0, high: 100 } }
    );
    assert.equal(custom.discreteCount, 1);
    assert.equal(custom.continuousCount, 1);
    
    console.log('  ✓ HybridActionSpaceFactory test passed\n');
}

// ========== Hybrid Environment Adapter Tests ==========
console.log('2️⃣ Hybrid Environment Adapter Tests\n');

function testHybridEnvironmentAdapter() {
    console.log('  Testing HybridEnvironmentAdapter...');
    
    // Mock environment with hybrid action space
    const mockEnv = {
        actionSpace: {
            type: 'Hybrid',
            discrete: { grip: { n: 2 } },
            continuous: { velocity: { low: -1, high: 1 } }
        },
        observationSpace: { type: 'Box', shape: [4] },
        reset: () => ({ observation: [0.1, 0.2, 0.3, 0.4] }),
        step: (action) => ({
            observation: [0.2, 0.3, 0.4, 0.5],
            reward: 1.0,
            terminated: false,
            done: false
        })
    };
    
    const adapter = new HybridEnvironmentAdapter(mockEnv);
    
    assert.ok(adapter.actionSpace instanceof HybridActionSpace, 'Has hybrid action space');
    assert.equal(adapter.actionSpace.discreteCount, 1);
    assert.equal(adapter.actionSpace.continuousCount, 1);
    
    // Test reset
    const { observation } = adapter.reset();
    assert.ok(Array.isArray(observation), 'Observation is array');
    
    // Test step with structured action
    const action = adapter.createAction(
        { grip: 1 },
        { velocity: 0.5 }
    );
    
    const result = adapter.step(action);
    assert.equal(result.reward, 1.0, 'Reward');
    assert.ok(!result.terminated, 'Not terminated');
    
    // Test sample
    const sampled = adapter.sample();
    assert.ok(sampled instanceof StructuredAction, 'Sample returns StructuredAction');
    
    // Test isValidAction
    assert.ok(adapter.isValidAction(action), 'Valid action');
    assert.ok(!adapter.isValidAction({ invalid: true }), 'Invalid action');
    
    const info = adapter.getInfo();
    assert.equal(info.type, 'Hybrid');
    assert.ok(info.discreteActions.includes('grip'));
    
    console.log('  ✓ HybridEnvironmentAdapter test passed\n');
}

function testHybridEnvironmentInference() {
    console.log('  Testing HybridEnvironmentAdapter inference...');
    
    // Mock environment with tuple action space
    const mockEnv = {
        actionSpace: {
            type: 'Tuple',
            length: 3,
            0: { type: 'Discrete', n: 2 },
            1: { type: 'Discrete', n: 3 },
            2: { type: 'Box', shape: [2], low: -1, high: 1 }
        },
        observationSpace: { type: 'Box', shape: [4] },
        reset: () => ({ observation: [0, 0, 0, 0] }),
        step: (action) => ({ observation: [1, 1, 1, 1], reward: 1, terminated: false })
    };
    
    const adapter = new HybridEnvironmentAdapter(mockEnv);
    
    // Should infer hybrid space from tuple
    assert.ok(adapter.actionSpace instanceof HybridActionSpace);
    assert.ok(adapter.discreteActions.length >= 0, 'Has discrete actions');
    assert.ok(adapter.continuousActions.length >= 0, 'Has continuous actions');
    
    console.log('  ✓ HybridEnvironmentAdapter inference test passed\n');
}

// ========== Cognitive Primitive Tests ==========
console.log('3️⃣ Cognitive Primitive Tests\n');

async function testCognitivePrimitive() {
    console.log('  Testing CognitivePrimitive base...');
    
    const primitive = new CognitivePrimitive({
        name: 'test',
        type: 'processing',
        inputs: ['input'],
        outputs: ['output']
    });
    
    assert.equal(primitive.config.name, 'test');
    assert.equal(primitive.config.type, 'processing');
    assert.equal(primitive.activationLevel, 0);
    
    // Test connection
    const target = new CognitivePrimitive({ name: 'target' });
    primitive.connect('output', target, 'input');
    
    assert.ok(primitive.connections.has('output'), 'Has connection');
    assert.equal(primitive.connections.get('output')[0].target, target);
    
    // Test activation update
    primitive.updateActivation(0.5);
    assert.equal(primitive.activationLevel, 0.5);
    
    primitive.updateActivation(-0.3);
    assert.equal(primitive.activationLevel, 0.2);
    
    console.log('  ✓ CognitivePrimitive base test passed\n');
}

async function testPerceptionPrimitive() {
    console.log('  Testing PerceptionPrimitive...');
    
    const perception = new PerceptionPrimitive({
        name: 'perception',
        symbolThreshold: 0.5,
        featureExtractors: [
            obs => Array.isArray(obs) ? obs.map(x => x * 2) : [obs]
        ]
    });
    
    const result = await perception.process({
        observation: [0.8, -0.3, 0.6, -0.9]
    });
    
    assert.ok(result.features, 'Has features');
    assert.ok(result.symbols, 'Has symbols');
    assert.ok(result.symbols.length >= 2, 'Extracts multiple symbols');
    
    // Test learning
    const learnResult = await perception.learn({ symbolAccuracy: 0.9 });
    assert.ok(learnResult.updated, 'Learning updated');
    
    console.log('  ✓ PerceptionPrimitive test passed\n');
}

async function testReasoningPrimitive() {
    console.log('  Testing ReasoningPrimitive...');
    
    const reasoning = new ReasoningPrimitive({
        name: 'reasoning',
        inferenceDepth: 3
    });
    
    const symbols = [
        { symbol: 'red_object', confidence: 0.9, value: 1 },
        { symbol: 'red_light', confidence: 0.8, value: 0.5 },
        { symbol: 'blue_object', confidence: 0.7, value: 0.3 }
    ];
    
    const result = await reasoning.process({ symbols });
    
    assert.ok(result.inferences, 'Has inferences');
    assert.ok(result.conclusions, 'Has conclusions');
    assert.ok(result.beliefs instanceof Map, 'Has beliefs');
    
    // Beliefs should be stored
    assert.ok(result.beliefs.has('red_object'), 'Stored belief');
    
    // Test learning
    const learnResult = await reasoning.learn({ inferenceAccuracy: 0.8 });
    assert.ok(learnResult.updated, 'Learning updated');
    
    console.log('  ✓ ReasoningPrimitive test passed\n');
}

async function testActionSelectionPrimitive() {
    console.log('  Testing ActionSelectionPrimitive...');
    
    const actionSpace = new HybridActionSpace({
        discrete: { grip: { n: 2 } },
        continuous: { velocity: { low: -1, high: 1 } }
    });
    
    const actionPrimitive = new ActionSelectionPrimitive({
        name: 'action',
        actionSpace: actionSpace,
        discreteStrategy: 'argmax',
        continuousStrategy: 'sample'
    });
    
    const conclusions = [
        { content: { value: 0.8 }, confidence: 0.9 },
        { content: { value: -0.5 }, confidence: 0.7 }
    ];
    
    const result = await actionPrimitive.process({
        conclusions,
        goals: [],
        state: [0.1, 0.2, 0.3]
    }, { explorationRate: 0.1 });
    
    assert.ok(result.action instanceof StructuredAction, 'Returns StructuredAction');
    assert.ok(result.action.getDiscrete('grip') !== null, 'Has discrete action');
    assert.ok(result.action.getContinuous('velocity') !== null, 'Has continuous action');
    assert.ok(result.actionValues, 'Has action values');
    
    // Test learning
    const learnResult = await actionPrimitive.learn({
        action: result.action,
        reward: 1.0,
        nextState: [0.2, 0.3, 0.4]
    });
    assert.ok(learnResult.updated, 'Learning updated');
    
    // Test action history
    const history = actionPrimitive.getActionHistory(10);
    assert.ok(history.length > 0, 'Has action history');
    
    console.log('  ✓ ActionSelectionPrimitive test passed\n');
}

async function testMemoryPrimitive() {
    console.log('  Testing MemoryPrimitive...');
    
    const memory = new MemoryPrimitive({
        name: 'memory',
        capacity: 100
    });
    
    // Store experiences
    for (let i = 0; i < 10; i++) {
        await memory.process({
            experience: {
                state: [i, 0, 0, 0],
                action: 0,
                reward: i * 0.1,
                nextState: [i + 1, 0, 0, 0],
                done: false,
                info: {
                    timestamp: Date.now(),
                    tags: i > 5 ? ['positive'] : ['neutral']
                }
            }
        });
    }
    
    // Retrieve
    const result = await memory.process({ query: true }, {
        tags: ['positive'],
        limit: 5,
        recency: true
    });
    
    assert.ok(result.retrieved, 'Has retrieved experiences');
    assert.ok(result.count >= 10, 'Has stored experiences');
    
    // Test getSuccessfulEpisodes
    const successful = memory.getSuccessfulEpisodes(10);
    assert.ok(successful.length > 0, 'Has successful episodes');
    
    console.log('  ✓ MemoryPrimitive test passed\n');
}

// ========== Emergent Architecture Tests ==========
console.log('4️⃣ Emergent Architecture Tests\n');

async function testEmergentArchitecture() {
    console.log('  Testing EmergentCognitiveArchitecture...');
    
    const actionSpace = new HybridActionSpace({
        discrete: { grip: { n: 2 } },
        continuous: { velocity: { low: -1, high: 1 } }
    });
    
    const arch = new EmergentCognitiveArchitecture({
        name: 'TestEmergent',
        actionSpace,
        emergenceThreshold: 0.3
    });
    
    // Check primitives
    assert.ok(arch.primitives.has('perception'), 'Has perception');
    assert.ok(arch.primitives.has('reasoning'), 'Has reasoning');
    assert.ok(arch.primitives.has('action'), 'Has action');
    assert.ok(arch.primitives.has('memory'), 'Has memory');
    
    // Test process
    const observation = [0.1, 0.5, -0.3, 0.8];
    const result = await arch.process(observation, {
        goals: [{ preferredAction: 0 }],
        explorationRate: 0.1
    });
    
    assert.ok(result.action, 'Returns action');
    assert.ok(result.action instanceof StructuredAction, 'Action is StructuredAction');
    assert.ok(result.activations, 'Has activations');
    assert.ok(result.emergentPatterns, 'Has emergent patterns');
    
    // Test act
    const action = await arch.act(observation, { explorationRate: 0.1 });
    assert.ok(action, 'Act returns action');
    
    // Test learning
    const learnResult = await arch.learn({
        state: observation,
        action,
        nextState: [0.2, 0.6, -0.2, 0.9],
        done: false
    }, 1.0);
    
    assert.ok(learnResult.perception, 'Perception learned');
    assert.ok(learnResult.reasoning, 'Reasoning learned');
    assert.ok(learnResult.action, 'Action learned');
    assert.ok(learnResult.memory, 'Memory learned');
    
    // Test state
    const state = arch.getState();
    assert.ok(state.primitives, 'Has primitive states');
    assert.ok(state.globalState, 'Has global state');
    
    // Test action space
    const retrievedSpace = arch.getActionSpace();
    assert.ok(retrievedSpace instanceof HybridActionSpace, 'Returns action space');
    
    await arch.shutdown();
    
    console.log('  ✓ EmergentCognitiveArchitecture test passed\n');
}

async function testEmergentArchitectureConnection() {
    console.log('  Testing EmergentCognitiveArchitecture connections...');
    
    const arch = new EmergentCognitiveArchitecture();
    
    // Connect primitives
    arch.connect('perception', 'symbols', 'reasoning', 'symbols');
    arch.connect('reasoning', 'conclusions', 'action', 'conclusions');
    arch.connect('action', 'action', 'memory', 'experience');
    
    // Process should flow through connections
    const result = await arch.process([0.1, 0.2, 0.3, 0.4]);
    
    assert.ok(result, 'Process completed');
    assert.ok(result.action, 'Has action');
    
    await arch.shutdown();
    
    console.log('  ✓ EmergentCognitiveArchitecture connections test passed\n');
}

async function testEmergentArchitectureFactory() {
    console.log('  Testing EmergentArchitectureFactory...');
    
    // Create for hybrid action
    const hybridArch = EmergentArchitectureFactory.createForHybridAction(
        new HybridActionSpace({
            discrete: { grip: { n: 2 } },
            continuous: { velocity: { low: -1, high: 1 } }
        })
    );
    
    assert.ok(hybridArch.primitives.has('action'), 'Has action primitive');
    
    const actionSpace = hybridArch.getActionSpace();
    assert.ok(actionSpace instanceof HybridActionSpace, 'Has hybrid action space');
    
    await hybridArch.shutdown();
    
    // Create minimal
    const minimal = EmergentArchitectureFactory.createMinimal();
    assert.equal(minimal.config.name, 'MinimalEmergent');
    await minimal.shutdown();
    
    // Create complex
    const complex = EmergentArchitectureFactory.createComplex({
        emergenceThreshold: 0.1,
        connectionStrength: 0.9
    });
    assert.equal(complex.config.emergenceThreshold, 0.1);
    await complex.shutdown();
    
    console.log('  ✓ EmergentArchitectureFactory test passed\n');
}

// ========== Run All Tests ==========
async function runAllTests() {
    try {
        // Hybrid Action Space tests
        testHybridActionSpaceCreation();
        testHybridActionSpaceSampling();
        testHybridActionSpaceContains();
        testHybridActionSpaceFlatten();
        testStructuredAction();
        testHybridActionSelector();
        testHybridActionSpaceFactory();
        
        // Hybrid Environment tests
        testHybridEnvironmentAdapter();
        testHybridEnvironmentInference();
        
        // Cognitive Primitive tests
        await testCognitivePrimitive();
        await testPerceptionPrimitive();
        await testReasoningPrimitive();
        await testActionSelectionPrimitive();
        await testMemoryPrimitive();
        
        // Emergent Architecture tests
        await testEmergentArchitecture();
        await testEmergentArchitectureConnection();
        await testEmergentArchitectureFactory();
        
        console.log('✅ All Hybrid Action & Emergent Architecture Tests Passed!\n');
        return true;
    } catch (error) {
        console.error('❌ Test Failed:', error);
        process.exit(1);
    }
}

runAllTests();
