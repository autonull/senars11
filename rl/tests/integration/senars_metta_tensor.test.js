/**
 * Integration Tests for SeNARS-MeTTa-Tensor and Unified Environment
 */
import { strict as assert } from 'assert';
import { describe, test, afterAll } from '@jest/globals';

// SeNARS-MeTTa-Tensor Integration
import {
    UnifiedNeuroSymbolicAgent,
    UnifiedAgentFactory
} from '../../src/integration/SeNARSMettaTensor.js';
import { NeuroSymbolicBridge } from '../../src/bridges/NeuroSymbolicBridge.js';
import { TensorLogicPolicy } from '../../src/policies/TensorLogicPolicy.js';

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
import { SymbolicTensor, TensorLogicBridge } from '@senars/tensor';

describe('SeNARS-MeTTa-Tensor Integration', () => {

    describe('Action/Observation Space', () => {
        test('Discrete ActionSpace', () => {
            const space = new ActionSpace({ type: 'Discrete', n: 5 });

            assert.equal(space.type, 'Discrete');
            assert.equal(space.n, 5);

            const action = space.sample();
            assert.ok(action >= 0 && action < 5);

            assert.ok(space.contains(0));
            assert.ok(space.contains(4));
            assert.ok(!space.contains(5));
        });

        test('Continuous ActionSpace', () => {
            const space = new ActionSpace({
                type: 'Box',
                shape: [3],
                low: -1,
                high: 1
            });

            assert.equal(space.type, 'Box');
            assert.deepEqual(space.shape, [3]);

            const action = space.sample();
            assert.ok(Array.isArray(action));
            assert.equal(action.length, 3);
            assert.ok(action.every(v => v >= -1 && v <= 1));
        });

        test('ObservationSpace', () => {
            const space = new ObservationSpace({
                type: 'Box',
                shape: [4],
                low: [-Infinity, -Infinity, -Infinity, -Infinity],
                high: [Infinity, Infinity, Infinity, Infinity]
            });

            assert.equal(space.type, 'Box');
            assert.deepEqual(space.shape, [4]);

            const obs = space.sample();
            assert.ok(Array.isArray(obs));
            assert.equal(obs.length, 4);
        });
    });

    describe('Environment Adapter', () => {
        test('EnvironmentAdapter', () => {
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

            assert.ok(adapter.isDiscrete);
            assert.ok(!adapter.isContinuous);

            const result = adapter.reset();
            assert.ok(Array.isArray(result.observation));

            const stepResult = adapter.step(2);
            assert.equal(stepResult.reward, 1.0);
            assert.equal(stepResult.terminated, false);
        });

        test('DiscreteWrapper', () => {
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

            assert.equal(wrapper.actionSpace.type, 'Discrete');
            assert.equal(wrapper.actionSpace.n, 5);

            const result = wrapper.step(3);
            assert.ok(typeof result.reward === 'number');
        });

        test('ContinuousWrapper', () => {
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

            assert.equal(wrapper.actionSpace.type, 'Box');
            assert.deepEqual(wrapper.actionSpace.shape, [1]);

            const result = wrapper.step([0.5]);
            assert.ok(typeof result.reward === 'number');
        });

        test('HybridEnvironment', () => {
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
            assert.ok(actionSpaces.discrete);
            assert.ok(actionSpaces.continuous);
            assert.ok(actionSpaces.hybrid);

            hybrid.setMode('discrete');
            const discreteResult = hybrid.step(2);
            assert.ok(discreteResult);

            hybrid.setMode('continuous');
            const continuousResult = hybrid.step([0.5]);
            assert.ok(continuousResult);
        });
    });

    describe('Tensor Logic Bridge', () => {
        test('TensorLogicBridge', () => {
            const bridge = new TensorLogicBridge();

            const tensor = new SymbolicTensor(
                new Float32Array([0.8, 0.2, 0.6, 0.4]),
                [4],
                { symbols: new Map([['0', { symbol: 'high', confidence: 0.9 }]]) }
            );

            const symbols = bridge.liftToSymbols(tensor, { threshold: 0.3 });
            assert.ok(symbols.length >= 2);

            const grounded = bridge.groundToTensor(symbols, [4]);
            assert.ok(grounded.data.length === 4);

            const tensor2 = new SymbolicTensor(new Float32Array([0.1, 0.9, 0.3, 0.7]), [4]);
            const sum = bridge.symbolicAdd(tensor, tensor2, 'union');
            assert.ok(sum.data[0] > 0.8);
        });

        test('Narsese conversion', () => {
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
            assert.ok(narsese.includes('obs'));
            assert.ok(narsese.includes('feature'));
        });
    });

    describe('NeuroSymbolic Bridge', () => {
        test('NeuroSymbolicBridge basics', async () => {
            const bridge = new NeuroSymbolicBridge({
                senarsConfig: {},
                autoGround: true,
                useSeNARS: true
            });

            await bridge.initialize();

            const result = await bridge.inputNarsese('<test --> concept>.');
            assert.ok(result);

            await bridge.achieveGoal('test_goal');
            const state = bridge.getState();
            assert.ok(state.goals.length > 0);

            bridge.clear();
            assert.equal(bridge.getState().goals.length, 0);

            await bridge.shutdown();
        });

        test('SeNARS observation conversion', async () => {
            const bridge = new NeuroSymbolicBridge();

            const arrayObs = [0.8, -0.5, 0.9, -0.2];
            const arrayNarsese = bridge.observationToNarsese(arrayObs, { simple: true });
            assert.ok(arrayNarsese.includes('obs'));

            const objectObs = { position: 5, velocity: 2 };
            const objectNarsese = bridge.observationToNarsese(objectObs, { simple: true });
            assert.ok(objectNarsese.includes('obs'));

            const actionNarsese = bridge.actionToNarsese(3);
            assert.ok(actionNarsese.startsWith('^'));
        });
    });

    describe('TensorLogicPolicy (MeTTa mode)', () => {
        test('TensorLogicPolicy in MeTTa mode', async () => {
            const network = new TensorLogicPolicy({
                inputDim: 4,
                outputDim: 2,
                actionType: 'discrete',
                policyType: 'metta'
            });

            await network.initialize();

            const observation = [0.1, 0.5, -0.3, 0.8];
            const result = await network.selectAction(observation);

            assert.ok(typeof result.action === 'number');

            const transition = {
                state: observation,
                action: 0,
                reward: 1.0,
                nextState: observation,
                done: false
            };

            const updateResult = await network.update(transition);
            assert.ok(updateResult);

            await network.shutdown();
        });
    });

    describe('Unified Neuro-Symbolic Agent', () => {
        test('UnifiedNeuroSymbolicAgent', async () => {
            const agent = new UnifiedNeuroSymbolicAgent({
                actionSpace: { type: 'Discrete', n: 4 },
                integrationMode: 'metta-only',
                reasoningCycles: 10,
                mettaConfig: { inputDim: 4 }
            });

            await agent.initialize();

            const observation = [0.1, 0.5, -0.3, 0.8];
            const action = await agent.act(observation);
            assert.ok(action !== null);

            const transition = {
                state: observation,
                action,
                reward: 1.0,
                nextState: [0.2, 0.6, -0.2, 0.9],
                done: false
            };

            const learnResult = await agent.learn(transition, 1.0);
            assert.ok(learnResult.stored);

            agent.setGoal('maximize_reward');
            assert.equal(agent.getGoal(), 'maximize_reward');

            agent.clearGoal();
            assert.equal(agent.getGoal(), null);

            const stats = agent.getStats();
            assert.ok('experienceCount' in stats);
            assert.ok('actionType' in stats);

            await agent.shutdown();
        });

        test('UnifiedNeuroSymbolicAgent (continuous)', async () => {
            const agent = new UnifiedNeuroSymbolicAgent({
                actionSpace: { type: 'Box', shape: [2], low: -1, high: 1 },
                actionType: 'continuous',
                integrationMode: 'metta-only',
                mettaConfig: { inputDim: 4, outputDim: 2 }
            });

            await agent.initialize();

            const observation = [0.1, 0.5, -0.3, 0.8];
            const action = await agent.act(observation);

            assert.ok(Array.isArray(action));
            assert.ok(action.length >= 1);

            await agent.shutdown();
        });
    });

    describe('Agent Factory', () => {
        test('UnifiedAgentFactory', async () => {
            const discreteAgent = UnifiedAgentFactory.createDiscrete({
                actionSpace: { type: 'Discrete', n: 4 },
                integrationMode: 'metta-only',
                mettaConfig: { inputDim: 4 }
            });
            await discreteAgent.initialize();

            const discreteAction = await discreteAgent.act([0.1, 0.2, 0.3, 0.4]);
            assert.ok(typeof discreteAction === 'number');

            await discreteAgent.shutdown();

            const continuousAgent = UnifiedAgentFactory.createContinuous({
                actionSpace: { type: 'Box', shape: [2], low: -1, high: 1 },
                integrationMode: 'metta-only',
                mettaConfig: { inputDim: 4, outputDim: 2 }
            });
            await continuousAgent.initialize();

            const continuousAction = await continuousAgent.act([0.1, 0.2, 0.3, 0.4]);
            assert.ok(Array.isArray(continuousAction));

            await continuousAgent.shutdown();
        });
    });

    describe('Environment Registry', () => {
        test('EnvironmentRegistry', () => {
            const registry = new EnvironmentRegistry();

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
            assert.ok(env);

            const list = registry.list();
            assert.ok(list.includes('MockEnv'));
        });
    });
});
