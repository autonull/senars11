/**
 * Tests for Neuro-Symbolic RL Framework
 * 
 * Comprehensive test suite for the neuro-symbolic integration components.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Import modules to test
import {
    NeuroSymbolicBridge,
    NeuroSymbolicBridgeFactory
} from '../src/bridges/NeuroSymbolicBridge.js';

import {
    TensorLogicPolicy,
    TensorLogicPolicyFactory
} from '../src/policies/TensorLogicPolicy.js';

import {
    HierarchicalSkillSystem,
    Skill,
    SkillSystemFactory
} from '../src/skills/HierarchicalSkillDiscovery.js';

import {
    DistributedExperienceBuffer,
    CausalExperience,
    ExperienceBufferFactory
} from '../src/experience/DistributedExperienceBuffer.js';

import {
    MetaController,
    MetaControllerFactory,
    ModificationOperator
} from '../src/meta/MetaController.js';

describe('Neuro-Symbolic RL Framework', () => {
    
    describe('NeuroSymbolicBridge', () => {
        let bridge;

        beforeEach(async () => {
            bridge = NeuroSymbolicBridgeFactory.createBalanced({
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
            expect(bridge.initialized).toBe(true);
        });

        it('should convert tensor to symbols', () => {
            const tensor = { data: [0.8, 0.2, 0.9, 0.1], shape: [4] };
            const symbolic = bridge.liftToSymbols(tensor, { threshold: 0.5 });
            
            expect(symbolic).toBeDefined();
            expect(symbolic.symbols).toBeDefined();
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
            
            // In fallback mode, should attempt pattern matching
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
            policy = TensorLogicPolicyFactory.createDiscrete(8, 4, {
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
            expect(output.logits.shape).toEqual([4]);
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

            expect(success).toBe(true);
            expect(loss).toBeDefined();
            expect(typeof loss).toBe('number');
        });

        it('should compute entropy', () => {
            const state = Array.from({ length: 8 }, Math.random);
            const { logits } = policy.forward(state);
            const entropy = policy._computeEntropy(logits);

            expect(entropy).toBeDefined();
            expect(entropy.data).toBeDefined();
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
        let skillSystem;

        beforeEach(async () => {
            skillSystem = SkillSystemFactory.createMinimal({
                minSupport: 2,
                maxLevels: 2
            });
            await skillSystem.initialize();
        });

        afterEach(async () => {
            await skillSystem.shutdown();
        });

        it('should initialize with primitive skills', () => {
            expect(skillSystem).toBeDefined();
            const primitives = skillSystem.getPrimitiveSkills();
            expect(primitives.length).toBeGreaterThan(0);
        });

        it('should create skill', () => {
            const skill = new Skill({
                name: 'test_skill',
                precondition: '<pre --> condition>.',
                postcondition: '<post --> condition>.',
                level: 0
            });

            expect(skill).toBeDefined();
            expect(skill.id).toBeDefined();
            expect(skill.name).toBe('test_skill');
        });

        it('should discover skills from experience', async () => {
            const experiences = Array.from({ length: 10 }, () => ({
                state: Array.from({ length: 8 }, Math.random),
                action: Math.floor(Math.random() * 4),
                reward: Math.random(),
                nextState: Array.from({ length: 8 }, Math.random),
                done: false
            }));

            const newSkills = await skillSystem.discoverSkills(experiences);
            
            // May or may not discover skills depending on clustering
            expect(newSkills).toBeDefined();
            expect(Array.isArray(newSkills)).toBe(true);
        });

        it('should get applicable skills', () => {
            const state = Array.from({ length: 8 }, Math.random);
            const applicable = skillSystem.getApplicableSkills(state);

            expect(applicable).toBeDefined();
            expect(Array.isArray(applicable)).toBe(true);
        });

        it('should export to MeTTa format', () => {
            const metta = skillSystem.exportToMetta();
            
            expect(metta).toBeDefined();
            expect(typeof metta).toBe('string');
        });

        it('should compute skill statistics', () => {
            const skill = new Skill({
                name: 'test',
                successCount: 8,
                failureCount: 2,
                totalReward: 100,
                usageCount: 10
            });

            expect(skill.getSuccessRate()).toBe(0.8);
            expect(skill.getAverageReward()).toBe(10);
        });
    });

    describe('DistributedExperienceBuffer', () => {
        let buffer;

        beforeEach(async () => {
            buffer = ExperienceBufferFactory.createMinimal(1000, {
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
            // First store some experiences
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
            metaController = MetaControllerFactory.createMinimal({
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
                ]
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
                ]
            };
            metaController.setArchitecture(architecture);

            const modification = await metaController.proposeModification();
            
            // May return null if no suitable modification found
            expect(modification).toBeDefined();
        });

        it('should evaluate performance', async () => {
            const architecture = { components: [] };
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
            // Create components
            const bridge = NeuroSymbolicBridgeFactory.createMinimal();
            const policy = TensorLogicPolicyFactory.createMinimal(8, 4);
            const skillSystem = SkillSystemFactory.createMinimal();

            // Initialize
            await bridge.initialize();
            await policy.initialize();
            await skillSystem.initialize();

            // Use bridge to process observation
            const observation = Array.from({ length: 8 }, Math.random);
            const symbolic = bridge.liftToSymbols({ data: observation, shape: [8] });

            // Use policy to select action
            const { action } = await policy.selectAction(observation);

            // Store experience
            const experience = {
                state: observation,
                action,
                reward: 1.0,
                nextState: observation,
                done: false
            };

            // Discover skills
            await skillSystem.discoverSkills([experience]);

            // Cleanup
            await bridge.shutdown();
            await policy.shutdown();
            await skillSystem.shutdown();

            expect(action).toBeDefined();
        });
    });
});
