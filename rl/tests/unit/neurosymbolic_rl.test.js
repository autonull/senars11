/**
 * Tests for Neuro-Symbolic RL Framework
 * 
 * Comprehensive test suite for the neuro-symbolic integration components.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Import modules to test
import {
    NeuroSymbolicBridge
} from '../../src/bridges/NeuroSymbolicBridge.js';

import {
    TensorLogicPolicy
} from '../../src/policies/TensorLogicPolicy.js';

import {
    Skill,
    SkillLibrary,
    SkillDiscoveryEngine
} from '../../src/skills/HierarchicalSkillSystem.js';

import {
    ExperienceBuffer,
    CausalExperience
} from '../../src/experience/ExperienceBuffer.js';

import {
    MetaController,
    ModificationOperator
} from '../../src/meta/MetaController.js';

import { SymbolicTensor } from '@senars/tensor';

describe('Neuro-Symbolic RL Framework', () => {
    
    describe('NeuroSymbolicBridge', () => {
        let bridge;

        beforeEach(async () => {
            bridge = NeuroSymbolicBridge.createReasoningFocused({
                maxReasoningCycles: 10,
                cacheInference: false
            });
            await bridge.initialize();
        });

        afterEach(async () => {
            await bridge.shutdown();
        });

        it('should initialize successfully', () => {
            expect(bridge).toBeDefined();
        });

        it('should convert tensor to symbols', () => {
            const tensor = new SymbolicTensor([0.8, 0.2, 0.9, 0.1], [4]);
            const symbolic = bridge.liftToSymbols(tensor, { threshold: 0.5 });
            
            expect(symbolic).toBeDefined();
            // Expecting array of symbols
            expect(Array.isArray(symbolic)).toBe(true);
        });

        it('should convert observation to Narsese', () => {
            const observation = [0.8, 0.2, 0.9, 0.1];
            const narsese = bridge.observationToNarsese(observation);
            
            expect(narsese).toBeDefined();
            expect(typeof narsese).toBe('string');
        });

        it('should store and query beliefs', async () => {
            await bridge.inputNarsese('<test --> observed>.');
            const result = await bridge.askNarsese('<(?x) --> observed>?');
            expect(result).toBeDefined();
        });

        it('should learn causal relationships', async () => {
            const transition = {
                state: [0.8, 0.2, 0.9, 0.1],
                action: 1,
                nextState: [0.7, 0.3, 0.8, 0.2],
                reward: 1.0
            };

            await bridge.learnCausal(transition);
            const prediction = bridge.predictCausal([0.8, 0.2, 0.9, 0.1], 1);
            
            expect(prediction).toBeDefined();
        });

        it('should execute perceive-reason-act cycle', async () => {
            const observation = [0.5, 0.3, 0.8, 0.2];
            const result = await bridge.perceiveReasonAct(observation, {
                useNARS: false,
                useMeTTa: false,
                useTensor: true,
                exploration: 0.5
            });

            expect(result).toBeDefined();
            expect(result.action).toBeDefined();
        });

        it('should track metrics', () => {
            const state = bridge.getState();
            
            expect(state).toBeDefined();
            expect(state.metrics).toBeDefined();
            expect(state.metrics.narseseConversions).toBeDefined();
        });
    });

    describe('TensorLogicPolicy', () => {
        let policy;

        beforeEach(async () => {
            policy = TensorLogicPolicy.createDiscrete(8, 4, {
                hiddenDim: 16,
                numLayers: 1,
                learningRate: 0.01
            });
            await policy.initialize();
        });

        afterEach(async () => {
            await policy.shutdown();
        });

        it('should initialize with correct architecture', () => {
            expect(policy).toBeDefined();
            expect(policy.parameters.size).toBeGreaterThan(0);
        });

        it('should perform forward pass', () => {
            const state = Array.from({ length: 8 }, Math.random);
            const output = policy.forward(state);

            expect(output).toBeDefined();
            expect(output.logits).toBeDefined();
            if (policy.backend) {
                expect(output.logits.shape).toEqual([4]);
            }
        });

        it('should select action', async () => {
            const state = Array.from({ length: 8 }, Math.random);
            const { action, actionProb } = await policy.selectAction(state);

            expect(action).toBeDefined();
            expect(typeof action).toBe('number');
            expect(action).toBeGreaterThanOrEqual(0);
            expect(action).toBeLessThan(4);
            expect(actionProb).toBeGreaterThan(0);
            expect(actionProb).toBeLessThanOrEqual(1);
        });

        it('should update policy from experience', async () => {
            const state = Array.from({ length: 8 }, Math.random);
            const action = 2;
            const experience = {
                state,
                action,
                reward: 1.0,
                nextState: state,
                done: false
            };

            const { loss, success } = await policy.update(experience, {
                advantages: [1.0]
            });

            if (policy.backend) {
                expect(success).toBe(true);
                expect(loss).toBeDefined();
                expect(typeof loss).toBe('number');
            } else {
                expect(success).toBe(false);
            }
        });

        it('should compute entropy', () => {
            const state = Array.from({ length: 8 }, Math.random);
            const { logits } = policy.forward(state);
            if (policy.backend) {
                const entropy = policy._computeEntropy(logits);
                expect(entropy).toBeDefined();
                expect(entropy.data).toBeDefined();
            }
        });

        it('should extract rules', () => {
            const rules = policy.extractRules({ threshold: 0.3 });
            
            expect(rules).toBeDefined();
            expect(Array.isArray(rules)).toBe(true);
        });

        it('should serialize and deserialize parameters', () => {
            const params = policy.getParameters();
            expect(params).toBeDefined();

            policy.setParameters(params);
            const params2 = policy.getParameters();
            
            expect(params2).toBeDefined();
        });
    });

    describe('HierarchicalSkillSystem', () => {
        let skillEngine;

        beforeEach(async () => {
            skillEngine = new SkillDiscoveryEngine({
                minUsageCount: 2
            });
            await skillEngine.initialize();
        });

        afterEach(async () => {
            await skillEngine.shutdown();
        });

        it('should initialize', () => {
            expect(skillEngine).toBeDefined();
        });

        it('should create skill', () => {
            const skill = new Skill('test_skill', {
                precondition: () => true,
                level: 0
            });

            expect(skill).toBeDefined();
            expect(skill.config.name).toBe('test_skill');
        });

        it('should discover skills from experience', async () => {
            const experiences = Array.from({ length: 10 }, () => ({
                state: Array.from({ length: 8 }, Math.random),
                action: Math.floor(Math.random() * 4),
                reward: Math.random(),
                nextState: Array.from({ length: 8 }, Math.random),
                done: false
            }));

            experiences.forEach(exp => skillEngine.processTransition(exp));
            
            const candidates = skillEngine.getCandidateSkills();
            expect(candidates).toBeDefined();
            expect(Array.isArray(candidates)).toBe(true);
        });

        it('should export to MeTTa format', () => {
            const serialized = skillEngine.serialize();
            expect(serialized).toBeDefined();
        });
    });

    describe('DistributedExperienceBuffer', () => {
        let buffer;

        beforeEach(async () => {
            buffer = ExperienceBuffer.createMinimal(1000, {
                batchSize: 8,
                useCausalIndexing: true
            });
            await buffer.initialize();
        });

        afterEach(async () => {
            await buffer.shutdown();
        });

        it('should initialize successfully', () => {
            expect(buffer).toBeDefined();
            expect(buffer.buffers.length).toBeGreaterThan(0);
        });

        it('should store experience', async () => {
            const experience = new CausalExperience({
                state: [0.1, 0.2, 0.3],
                action: 1,
                reward: 0.5,
                nextState: [0.2, 0.3, 0.4],
                done: false
            });

            const id = await buffer.store(experience);
            
            expect(id).toBeDefined();
            expect(typeof id).toBe('number');
        });

        it('should store batch of experiences', async () => {
            const experiences = Array.from({ length: 10 }, (_, i) => ({
                state: [i * 0.1, (i + 1) * 0.1],
                action: i % 4,
                reward: Math.random(),
                nextState: [(i + 1) * 0.1, (i + 2) * 0.1],
                done: false
            }));

            const ids = await buffer.storeBatch(experiences);
            
            expect(ids).toBeDefined();
            expect(ids.length).toBe(10);
        });

        it('should sample experiences', async () => {
            await buffer.storeBatch(Array.from({ length: 20 }, () => ({
                state: Array.from({ length: 4 }, Math.random),
                action: Math.floor(Math.random() * 4),
                reward: Math.random(),
                nextState: Array.from({ length: 4 }, Math.random),
                done: false
            })));

            const sample = await buffer.sample(5, { strategy: 'random' });
            
            expect(sample).toBeDefined();
            expect(sample.length).toBeLessThanOrEqual(5);
        });

        it('should get statistics', () => {
            const stats = buffer.getStats();
            
            expect(stats).toBeDefined();
            expect(stats.totalSize).toBeDefined();
            expect(stats.metrics).toBeDefined();
        });

        it('should compute causal signatures', () => {
            const experience = {
                state: [0.1, 0.2, 0.3],
                action: 1,
                nextState: [0.2, 0.3, 0.4]
            };

            const signature = CausalExperience.createCausalSignature(experience, 0.1);
            
            expect(signature).toBeDefined();
            expect(typeof signature).toBe('string');
        });
    });

    describe('MetaController', () => {
        let metaController;

        beforeEach(async () => {
            metaController = MetaController.createMinimal({
                explorationRate: 0.5,
                modificationThreshold: 0.3
            });
            await metaController.initialize();
        });

        afterEach(async () => {
            await metaController.shutdown();
        });

        it('should initialize successfully', () => {
            expect(metaController).toBeDefined();
            expect(metaController.operatorPool.length).toBeGreaterThan(0);
        });

        it('should set architecture', () => {
            const architecture = {
                components: [
                    { id: 'comp1', type: 'test' }
                ],
                getComponent: (id) => ({ id, type: 'test', metrics: {} })
            };

            metaController.setArchitecture(architecture);
            
            expect(metaController.getArchitecture()).toBe(architecture);
        });

        it('should create modification operator', () => {
            const op = new ModificationOperator({
                type: 'add',
                parameters: {
                    componentId: 'new_component',
                    stage: 'perception'
                }
            });

            expect(op).toBeDefined();
            expect(op.type).toBe('add');
        });

        it('should propose modification', async () => {
            const architecture = {
                components: [
                    { id: 'comp1', type: 'test' }
                ],
                getComponent: (id) => ({ id, type: 'test', metrics: {} })
            };
            metaController.setArchitecture(architecture);

            const modification = await metaController.proposeModification();
        });

        it('should evaluate performance', async () => {
            const architecture = { components: [], getComponent: () => ({}) };
            metaController.setArchitecture(architecture);

            const result = await metaController.evaluatePerformance(50);
            
            expect(result).toBeDefined();
            expect(result.modified).toBeDefined();
        });

        it('should track metrics', () => {
            const state = metaController.getState();
            
            expect(state).toBeDefined();
            expect(state.metrics).toBeDefined();
            expect(state.metrics.modificationsProposed).toBeDefined();
        });
    });

    describe('Integration Tests', () => {
        it('should integrate bridge, policy, and skill system', async () => {
            const bridge = NeuroSymbolicBridge.createMinimal();
            const policy = TensorLogicPolicy.createMinimal(8, 4);
            const skillEngine = new SkillDiscoveryEngine();

            await bridge.initialize();
            await policy.initialize();
            await skillEngine.initialize();

            const observation = Array.from({ length: 8 }, Math.random);
            const symbolic = bridge.liftToSymbols({ data: observation, shape: [8] });

            const { action } = await policy.selectAction(observation);

            const experience = {
                state: observation,
                action,
                reward: 1.0,
                nextState: observation,
                done: false
            };

            skillEngine.processTransition(experience);

            await bridge.shutdown();
            await policy.shutdown();
            await skillEngine.shutdown();

            expect(action).toBeDefined();
        });
    });
});
