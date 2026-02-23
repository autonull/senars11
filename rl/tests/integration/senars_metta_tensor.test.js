/**
 * Integration Tests for SeNARS-MeTTa-Tensor and Unified Environment
 */
import { strict as assert } from 'assert';

// SeNARS-MeTTa-Tensor Integration
import {
    EnhancedSeNARSBridge,
    MeTTaPolicyNetwork,
    UnifiedNeuroSymbolicAgent,
    UnifiedAgentFactory
} from '../../src/integration/SeNARSMettaTensor.js';

// Unified Environment
import {
    ActionSpace,
    ObservationSpace,
    EnvironmentAdapter,
    DiscreteWrapper,
    ContinuousWrapper,
    HybridEnvironment,
    EnvironmentRegistry
} from '../../src/environments/UnifiedEnvironment.js';

// Tensor Logic
import { SymbolicTensor, TensorLogicBridge } from '../../src/neurosymbolic/TensorLogicBridge.js';

console.log('🧪 Running SeNARS-MeTTa-Tensor Integration Tests...\n');

// ========== Action/Observation Space Tests ==========
console.log('1️⃣ Action/Observation Space Tests\n');

function testActionSpaceDiscrete() {
    console.log('  Testing Discrete ActionSpace...');
    
    const space = new ActionSpace({ type: 'Discrete', n: 5 });
    
    assert.equal(space.type, 'Discrete', 'Type is Discrete');
    assert.equal(space.n, 5, 'Has 5 actions');
    
    const action = space.sample();
    assert.ok(action >= 0 && action < 5, 'Sampled action in range');
    
    assert.ok(space.contains(0), 'Contains 0');
    assert.ok(space.contains(4), 'Contains 4');
    assert.ok(!space.contains(5), 'Does not contain 5');
    
    const json = space.toJSON();
    assert.equal(json.type, 'Discrete');
    assert.equal(json.n, 5);
    
    console.log('  ✓ Discrete ActionSpace test passed\n');
}

function testActionSpaceContinuous() {
    console.log('  Testing Continuous ActionSpace...');
    
    const space = new ActionSpace({
        type: 'Box',
        shape: [3],
        low: -1,
        high: 1
    });
    
    assert.equal(space.type, 'Box', 'Type is Box');
    assert.deepEqual(space.shape, [3], 'Shape is [3]');
    
    const action = space.sample();
    assert.ok(Array.isArray(action), 'Sample is array');
    assert.equal(action.length, 3, 'Has 3 dimensions');
    assert.ok(action.every(v => v >= -1 && v <= 1), 'All values in range');
    
    assert.ok(space.contains([0, 0, 0]), 'Contains zero vector');
    assert.ok(space.contains([1, -1, 0.5]), 'Contains boundary values');
    assert.ok(!space.contains([2, 0, 0]), 'Does not contain out of range');
    
    const json = space.toJSON();
    assert.equal(json.type, 'Box');
    assert.deepEqual(json.shape, [3]);
    
    console.log('  ✓ Continuous ActionSpace test passed\n');
}

function testObservationSpace() {
    console.log('  Testing ObservationSpace...');
    
    const space = new ObservationSpace({
        type: 'Box',
        shape: [4],
        low: [-Infinity, -Infinity, -Infinity, -Infinity],
        high: [Infinity, Infinity, Infinity, Infinity]
    });
    
    assert.equal(space.type, 'Box');
    assert.deepEqual(space.shape, [4]);
    
    const obs = space.sample();
    assert.ok(Array.isArray(obs), 'Sample is array');
    assert.equal(obs.length, 4, 'Has 4 dimensions');
    
    console.log('  ✓ ObservationSpace test passed\n');
}

// ========== Environment Adapter Tests ==========
console.log('2️⃣ Environment Adapter Tests\n');

function testEnvironmentAdapter() {
    console.log('  Testing EnvironmentAdapter...');
    
    // Mock environment
    const mockEnv = {
        actionSpace: { type: 'Discrete', n: 4 },
        observationSpace: { type: 'Box', shape: [4], low: -1, high: 1 },
        reset: () => ({ observation: [0.1, 0.2, 0.3, 0.4] }),
        step: (action) => ({
            observation: [0.2, 0.3, 0.4, 0.5],
            reward: 1.0,
            terminated: false,
            done: false
        })
    };
    
    const adapter = new EnvironmentAdapter(mockEnv);
    
    assert.ok(adapter.isDiscrete, 'Is discrete');
    assert.ok(!adapter.isContinuous, 'Is not continuous');
    
    const result = adapter.reset();
    assert.ok(Array.isArray(result.observation), 'Observation is array');
    
    const stepResult = adapter.step(2);
    assert.equal(stepResult.reward, 1.0, 'Reward is 1.0');
    assert.equal(stepResult.terminated, false, 'Not terminated');
    
    const info = adapter.getInfo();
    assert.equal(info.isDiscrete, true);
    
    console.log('  ✓ EnvironmentAdapter test passed\n');
}

function testDiscreteWrapper() {
    console.log('  Testing DiscreteWrapper...');
    
    // Mock continuous environment
    const mockEnv = {
        actionSpace: { type: 'Box', shape: [2], low: -1, high: 1 },
        observationSpace: { type: 'Box', shape: [4] },
        reset: () => ({ observation: [0.1, 0.2, 0.3, 0.4] }),
        step: (action) => ({
            observation: [0.2, 0.3, 0.4, 0.5],
            reward: Array.isArray(action) ? action[0] : 0,
            terminated: false,
            done: false
        })
    };
    
    const wrapper = new DiscreteWrapper(mockEnv, { numBins: 5 });
    
    // Check action space type (wrapper creates discrete action space)
    assert.equal(wrapper.actionSpace.type, 'Discrete', 'Action space is Discrete');
    assert.equal(wrapper.actionSpace.n, 5, 'Has 5 discrete actions');
    
    // Test action conversion
    const result = wrapper.step(3);
    assert.ok(typeof result.reward === 'number', 'Returns reward');
    
    console.log('  ✓ DiscreteWrapper test passed\n');
}

function testContinuousWrapper() {
    console.log('  Testing ContinuousWrapper...');
    
    // Mock discrete environment
    const mockEnv = {
        actionSpace: { type: 'Discrete', n: 4 },
        observationSpace: { type: 'Box', shape: [4] },
        reset: () => ({ observation: [0.1, 0.2, 0.3, 0.4] }),
        step: (action) => ({
            observation: [0.2, 0.3, 0.4, 0.5],
            reward: typeof action === 'number' ? action * 0.1 : 0,
            terminated: false,
            done: false
        })
    };
    
    const wrapper = new ContinuousWrapper(mockEnv, { scale: [-1, 1] });
    
    // Check action space type (wrapper creates continuous action space)
    assert.equal(wrapper.actionSpace.type, 'Box', 'Action space is Box');
    assert.deepEqual(wrapper.actionSpace.shape, [1], 'Has 1D continuous action');
    
    // Test action conversion
    const result = wrapper.step([0.5]);
    assert.ok(typeof result.reward === 'number', 'Returns reward');
    
    console.log('  ✓ ContinuousWrapper test passed\n');
}

function testHybridEnvironment() {
    console.log('  Testing HybridEnvironment...');
    
    const mockEnv = {
        actionSpace: { type: 'Discrete', n: 4 },
        observationSpace: { type: 'Box', shape: [4] },
        reset: () => ({ observation: [0.1, 0.2, 0.3, 0.4] }),
        step: (action) => ({
            observation: [0.2, 0.3, 0.4, 0.5],
            reward: 1.0,
            terminated: false,
            done: false
        })
    };
    
    const hybrid = new HybridEnvironment(mockEnv);
    
    const actionSpaces = hybrid.actionSpace;
    assert.ok(actionSpaces.discrete, 'Has discrete action space');
    assert.ok(actionSpaces.continuous, 'Has continuous action space');
    assert.ok(actionSpaces.hybrid, 'Has hybrid info');
    
    // Test in discrete mode
    hybrid.setMode('discrete');
    const discreteResult = hybrid.step(2);
    assert.ok(discreteResult, 'Discrete step works');
    
    // Test in continuous mode
    hybrid.setMode('continuous');
    const continuousResult = hybrid.step([0.5]);
    assert.ok(continuousResult, 'Continuous step works');
    
    console.log('  ✓ HybridEnvironment test passed\n');
}

// ========== Tensor Logic Bridge Tests ==========
console.log('3️⃣ Tensor Logic Bridge Tests\n');

function testTensorLogicBridge() {
    console.log('  Testing TensorLogicBridge...');
    
    const bridge = new TensorLogicBridge();
    
    // Create symbolic tensor
    const tensor = new SymbolicTensor(
        new Float32Array([0.8, 0.2, 0.6, 0.4]),
        [4],
        { symbols: new Map([['0', { symbol: 'high', confidence: 0.9 }]]) }
    );
    
    // Lift to symbols
    const symbols = bridge.liftToSymbols(tensor, { threshold: 0.3 });
    assert.ok(symbols.length >= 2, 'Lifts significant values');
    
    // Ground back to tensor
    const grounded = bridge.groundToTensor(symbols, [4]);
    assert.ok(grounded.data.length === 4, 'Grounded tensor has correct size');
    
    // Symbolic operations
    const tensor2 = new SymbolicTensor(new Float32Array([0.1, 0.9, 0.3, 0.7]), [4]);
    const sum = bridge.symbolicAdd(tensor, tensor2, 'union');
    assert.ok(sum.data[0] > 0.8, 'Addition works');
    
    console.log('  ✓ TensorLogicBridge test passed\n');
}

function testNarseseConversion() {
    console.log('  Testing Narsese conversion...');
    
    const bridge = new TensorLogicBridge();
    const tensor = new SymbolicTensor(
        new Float32Array([0.9, 0.1, 0.8, 0.2]),
        [4],
        { symbols: new Map([
            ['0', { symbol: 'feature_0', confidence: 0.9 }],
            ['2', { symbol: 'feature_2', confidence: 0.8 }]
        ]) }
    );
    
    const narsese = tensor.toNarseseTerm('obs');
    assert.ok(narsese.includes('obs'), 'Includes prefix');
    assert.ok(narsese.includes('feature'), 'Includes symbols');
    
    console.log('  ✓ Narsese conversion test passed\n');
}

// ========== Enhanced SeNARS Bridge Tests ==========
console.log('4️⃣ Enhanced SeNARS Bridge Tests\n');

async function testSeNARSBridgeBasics() {
    console.log('  Testing EnhancedSeNARSBridge basics...');
    
    const bridge = new EnhancedSeNARSBridge({
        senarsConfig: {},
        autoGround: true
    });
    
    await bridge.initialize();
    
    // Test input (may use fallback if SeNARS not available)
    const result = await bridge.input('<test --> concept>.');
    assert.ok(result, 'Input accepted');
    
    // Test beliefs
    const beliefs = bridge.getBeliefs();
    assert.ok(Array.isArray(beliefs), 'Returns beliefs array');
    
    // Test goal stack
    bridge.goalStack.push({ goal: 'test_goal' });
    const goals = bridge.getGoals();
    assert.ok(goals.length > 0, 'Has goals');
    
    bridge.clearGoals();
    assert.equal(bridge.getGoals().length, 0, 'Goals cleared');
    
    await bridge.shutdown();
    
    console.log('  ✓ EnhancedSeNARSBridge basics test passed\n');
}

async function testSeNARSObservationConversion() {
    console.log('  Testing SeNARS observation conversion...');
    
    const bridge = new EnhancedSeNARSBridge();
    
    // Array observation
    const arrayObs = [0.8, -0.5, 0.9, -0.2];
    const arrayNarsese = bridge.observationToNarsese(arrayObs);
    assert.ok(arrayNarsese.includes('obs'), 'Array observation converted');
    
    // Object observation
    const objectObs = { position: 5, velocity: 2 };
    const objectNarsese = bridge.observationToNarsese(objectObs);
    assert.ok(objectNarsese.includes('obs'), 'Object observation converted');
    
    // Action to Narsese
    const actionNarsese = bridge.actionToNarsese(3);
    assert.ok(actionNarsese.startsWith('^'), 'Action starts with ^');
    
    console.log('  ✓ SeNARS observation conversion test passed\n');
}

// ========== MeTTa Policy Network Tests ==========
console.log('5️⃣ MeTTa Policy Network Tests\n');

async function testMeTTaPolicyNetwork() {
    console.log('  Testing MeTTaPolicyNetwork...');
    
    const network = new MeTTaPolicyNetwork({
        inputDim: 4,
        outputDim: 2,
        actionType: 'discrete'
    });
    
    await network.initialize();
    
    // Test action selection
    const observation = [0.1, 0.5, -0.3, 0.8];
    const action = await network.selectAction(observation);
    assert.ok(typeof action === 'number', 'Returns numeric action');
    
    // Test continuous action
    const continuousAction = await network.selectContinuousAction(observation);
    assert.ok(Array.isArray(continuousAction), 'Returns array for continuous');
    
    // Test policy update
    const transition = {
        state: observation,
        action: 0,
        reward: 1.0,
        nextState: observation,
        done: false
    };
    
    const updateResult = await network.updatePolicy(transition);
    assert.ok(updateResult, 'Policy update attempted');
    
    await network.shutdown();
    
    console.log('  ✓ MeTTaPolicyNetwork test passed\n');
}

// ========== Unified Agent Tests ==========
console.log('6️⃣ Unified Neuro-Symbolic Agent Tests\n');

async function testUnifiedAgent() {
    console.log('  Testing UnifiedNeuroSymbolicAgent...');
    
    const agent = new UnifiedNeuroSymbolicAgent({
        actionSpace: { type: 'Discrete', n: 4 },
        integrationMode: 'metta-only', // Use only MeTTa (SeNARS may not be available)
        reasoningCycles: 10
    });
    
    await agent.initialize();
    
    // Test action selection
    const observation = [0.1, 0.5, -0.3, 0.8];
    const action = await agent.act(observation);
    assert.ok(action !== null, 'Returns action');
    
    // Test learning
    const transition = {
        state: observation,
        action,
        reward: 1.0,
        nextState: [0.2, 0.6, -0.2, 0.9],
        done: false
    };
    
    const learnResult = await agent.learn(transition, 1.0);
    assert.ok(learnResult.stored, 'Experience stored');
    
    // Test goal setting
    agent.setGoal('maximize_reward');
    assert.equal(agent.getGoal(), 'maximize_reward', 'Goal set');
    
    agent.clearGoal();
    assert.equal(agent.getGoal(), null, 'Goal cleared');
    
    // Test stats
    const stats = agent.getStats();
    assert.ok('experienceCount' in stats, 'Has experience count');
    assert.ok('actionType' in stats, 'Has action type');
    
    await agent.shutdown();
    
    console.log('  ✓ UnifiedNeuroSymbolicAgent test passed\n');
}

async function testUnifiedAgentContinuous() {
    console.log('  Testing UnifiedNeuroSymbolicAgent (continuous)...');
    
    const agent = new UnifiedNeuroSymbolicAgent({
        actionSpace: { type: 'Box', shape: [2], low: -1, high: 1 },
        actionType: 'continuous',
        integrationMode: 'metta-only',
        outputDim: 2
    });
    
    await agent.initialize();
    
    const observation = [0.1, 0.5, -0.3, 0.8];
    const action = await agent.act(observation);
    
    assert.ok(Array.isArray(action), 'Returns array for continuous');
    // Action dimension depends on policy network configuration
    assert.ok(action.length >= 1, 'Has action dimensions');
    
    await agent.shutdown();
    
    console.log('  ✓ UnifiedNeuroSymbolicAgent (continuous) test passed\n');
}

// ========== Agent Factory Tests ==========
console.log('7️⃣ Agent Factory Tests\n');

async function testAgentFactory() {
    console.log('  Testing UnifiedAgentFactory...');

    // Test discrete agent creation
    const discreteAgent = UnifiedAgentFactory.createDiscrete({
        actionSpace: { type: 'Discrete', n: 4 },
        integrationMode: 'metta-only'
    });
    await discreteAgent.initialize();

    const discreteAction = await discreteAgent.act([0.1, 0.2, 0.3, 0.4]);
    assert.ok(typeof discreteAction === 'number', 'Discrete agent returns number');

    await discreteAgent.shutdown();

    // Test continuous agent creation
    const continuousAgent = UnifiedAgentFactory.createContinuous({
        actionSpace: { type: 'Box', shape: [2], low: -1, high: 1 },
        integrationMode: 'metta-only'
    });
    await continuousAgent.initialize();

    const continuousAction = await continuousAgent.act([0.1, 0.2, 0.3, 0.4]);
    assert.ok(Array.isArray(continuousAction), 'Continuous agent returns array');

    await continuousAgent.shutdown();

    console.log('  ✓ UnifiedAgentFactory test passed\n');
}

// ========== Environment Registry Tests ==========
console.log('8️⃣ Environment Registry Tests\n');

function testEnvironmentRegistry() {
    console.log('  Testing EnvironmentRegistry...');
    
    const registry = new EnvironmentRegistry();
    
    // Register mock environment
    class MockEnv {
        constructor() {
            this.actionSpace = { type: 'Discrete', n: 4 };
            this.observationSpace = { type: 'Box', shape: [4] };
        }
        reset() { return { observation: [0, 0, 0, 0] }; }
        step(action) { return { observation: [1, 1, 1, 1], reward: 1, terminated: false }; }
    }
    
    registry.register('MockEnv', MockEnv);
    
    const env = registry.create('MockEnv');
    assert.ok(env, 'Environment created');
    
    const list = registry.list();
    assert.ok(list.includes('MockEnv'), 'Environment listed');
    
    console.log('  ✓ EnvironmentRegistry test passed\n');
}

// ========== Run All Tests ==========
async function runAllTests() {
    try {
        // Action/Observation Space tests
        testActionSpaceDiscrete();
        testActionSpaceContinuous();
        testObservationSpace();
        
        // Environment Adapter tests
        testEnvironmentAdapter();
        testDiscreteWrapper();
        testContinuousWrapper();
        testHybridEnvironment();
        
        // Tensor Logic tests
        testTensorLogicBridge();
        testNarseseConversion();
        
        // SeNARS Bridge tests
        await testSeNARSBridgeBasics();
        await testSeNARSObservationConversion();
        
        // MeTTa Policy Network tests
        await testMeTTaPolicyNetwork();
        
        // Unified Agent tests
        await testUnifiedAgent();
        await testUnifiedAgentContinuous();
        
        // Agent Factory tests
        await testAgentFactory();
        
        // Environment Registry tests
        testEnvironmentRegistry();
        
        console.log('✅ All SeNARS-MeTTa-Tensor Integration Tests Passed!\n');
        return true;
    } catch (error) {
        console.error('❌ Test Failed:', error);
        process.exit(1);
    }
}

runAllTests();
