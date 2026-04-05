/**
 * Phase 3 Unit Tests — Multi-Model Intelligence
 *
 * Tests for ModelRouter.js and ModelBenchmark.js
 */

import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {classifyTaskType, ModelBenchmark, ModelRouter, nalExpectation} from '../../../agent/src/models/index.js';

describe('Phase 3: Multi-Model Intelligence', () => {

    describe('classifyTaskType', () => {
        it('should classify code-related prompts', () => {
            expect(classifyTaskType('Write a function to sort an array')).toBe(':code');
            expect(classifyTaskType('Debug this API endpoint')).toBe(':code');
            expect(classifyTaskType('Implement a React component')).toBe(':code');
        });

        it('should classify reasoning prompts', () => {
            expect(classifyTaskType('Solve this math problem')).toBe(':reasoning');
            expect(classifyTaskType('Analyze the algorithm complexity')).toBe(':reasoning');
            expect(classifyTaskType('Compare these two approaches')).toBe(':reasoning');
        });

        it('should classify creative prompts', () => {
            expect(classifyTaskType('Write a story about a robot')).toBe(':creative');
            expect(classifyTaskType('Create a metaphor for waiting')).toBe(':creative');
            expect(classifyTaskType('Compose a poem')).toBe(':creative');
        });

        it('should classify retrieval prompts', () => {
            expect(classifyTaskType('What is the capital of France?')).toBe(':retrieval');
            expect(classifyTaskType('Explain photosynthesis')).toBe(':retrieval');
            expect(classifyTaskType('Find information about climate change')).toBe(':retrieval');
        });

        it('should classify introspection prompts', () => {
            expect(classifyTaskType('Think about your own limitations')).toBe(':introspection');
            expect(classifyTaskType('Reflect on your learning process')).toBe(':introspection');
        });

        it('should classify social prompts', () => {
            expect(classifyTaskType('Hello, how are you?')).toBe(':social');
            expect(classifyTaskType('Lets have a conversation')).toBe(':social');
        });

        it('should default to reasoning for unknown prompts', () => {
            expect(classifyTaskType('Some random text')).toBe(':reasoning');
        });
    });

    describe('nalExpectation', () => {
        it('should compute NAL expectation correctly', () => {
            // E = f + c*(0.5 - f)
            expect(nalExpectation(0.8, 0.7)).toBeCloseTo(0.8 + 0.7 * (0.5 - 0.8));
            expect(nalExpectation(0.5, 0.0)).toBeCloseTo(0.5);
            expect(nalExpectation(1.0, 1.0)).toBeCloseTo(0.5);  // 1.0 + 1.0*(0.5 - 1.0) = 0.5
            expect(nalExpectation(0.0, 1.0)).toBeCloseTo(0.5);  // 0.0 + 1.0*(0.5 - 0.0) = 0.5
        });

        it('should penalize low-confidence scores', () => {
            // When frequency < 0.5, higher confidence increases expectation
            // When frequency > 0.5, higher confidence decreases expectation (regression to mean)
            const lowFreq = nalExpectation(0.3, 0.9);  // 0.3 + 0.9*(0.5-0.3) = 0.48
            const lowFreqLowConf = nalExpectation(0.3, 0.1);  // 0.3 + 0.1*(0.5-0.3) = 0.32
            expect(lowFreq).toBeGreaterThan(lowFreqLowConf);
        });

        it('should not overvalue untested models', () => {
            const untested = nalExpectation(0.5, 0.0);
            const tested = nalExpectation(0.6, 0.5);
            expect(tested).toBeGreaterThan(untested);
        });
    });

    describe('ModelRouter', () => {
        let router;
        let mockAIClient;
        let mockSemanticMemory;

        const baseConfig = {
            profile: 'evolved',
            capabilities: {
                multiModelRouting: true,
                modelExploration: false,
                modelScoreUpdates: false
            },
            models: {
                fallback: 'gpt-4o-mini',
                explorationRate: 0.2,
                providers: {
                    openai: {enabled: true, models: ['gpt-4o', 'gpt-4o-mini']},
                    ollama: {enabled: true, models: ['llama3.2']}
                }
            }
        };

        beforeEach(() => {
            mockAIClient = {
                generate: jest.fn().mockResolvedValue({text: 'response'})
            };

            mockSemanticMemory = {
                initialize: jest.fn().mockResolvedValue(undefined),
                query: jest.fn().mockResolvedValue([]),
                remember: jest.fn().mockResolvedValue('mem_123'),
                forget: jest.fn().mockResolvedValue(0)
            };

            router = new ModelRouter(baseConfig, mockAIClient, mockSemanticMemory);
        });

        describe('constructor', () => {
            it('should initialize with config, aiClient, and semanticMemory', () => {
                expect(router._config).toBe(baseConfig);
                expect(router._aiClient).toBe(mockAIClient);
                expect(router._semanticMemory).toBe(mockSemanticMemory);
            });

            it('should work without semanticMemory', () => {
                const routerNoMem = new ModelRouter(baseConfig, mockAIClient);
                expect(routerNoMem._semanticMemory).toBeNull();
            });
        });

        describe('initialize', () => {
            it('should load model scores from SemanticMemory', async () => {
                mockSemanticMemory.query.mockResolvedValue([
                    {
                        content: '(model-score "gpt-4o" :reasoning (stv 0.85 0.72))'
                    },
                    {
                        content: '(model-score "llama3.2" :code (stv 0.70 0.50))'
                    }
                ]);

                await router.initialize();

                expect(router._modelScores.size).toBe(2);
                expect(router._modelScores.get('gpt-4o::reasoning')).toEqual({
                    frequency: 0.85,
                    confidence: 0.72
                });
            });

            it('should handle empty SemanticMemory', async () => {
                mockSemanticMemory.query.mockResolvedValue([]);
                await router.initialize();
                expect(router._modelScores.size).toBe(0);
            });
        });

        describe('selectModel', () => {
            it('should use fallback when multiModelRouting is disabled', async () => {
                const configNoRouting = {
                    ...baseConfig,
                    capabilities: {...baseConfig.capabilities, multiModelRouting: false}
                };
                const routerNoRouting = new ModelRouter(configNoRouting, mockAIClient);

                const model = await routerNoRouting.selectModel('test prompt');
                expect(model).toBe('gpt-4o-mini');
            });

            it('should respect explicit override', async () => {
                const model = await router.selectModel('test', 'gpt-4o');
                expect(model).toBe('gpt-4o');
            });

            it('should select best model based on scores', async () => {
                router._modelScores.set('gpt-4o::reasoning', {frequency: 0.9, confidence: 0.8});
                router._modelScores.set('llama3.2::reasoning', {frequency: 0.6, confidence: 0.5});

                const model = await router.selectModel('Solve this math problem');
                expect(model).toBe('gpt-4o');
            });

            it('should use neutral prior for unscored models', async () => {
                const model = await router.selectModel('Solve this math problem');
                expect(model).toBeTruthy();
                expect(['gpt-4o', 'gpt-4o-mini', 'llama3.2']).toContain(model);
            });
        });

        describe('invoke', () => {
            it('should invoke LLM with selected model', async () => {
                await router.invoke('Test prompt');
                expect(mockAIClient.generate).toHaveBeenCalled();
            });

            it('should record invocation when modelScoreUpdates is enabled', async () => {
                const configWithUpdates = {
                    ...baseConfig,
                    capabilities: {...baseConfig.capabilities, modelScoreUpdates: true}
                };
                const routerWithUpdates = new ModelRouter(configWithUpdates, mockAIClient, mockSemanticMemory);

                await routerWithUpdates.invoke('Test prompt');

                expect(mockSemanticMemory.remember).toHaveBeenCalled();
            });
        });

        describe('getScores', () => {
            it('should return all model scores', () => {
                router._modelScores.set('gpt-4o::reasoning', {frequency: 0.85, confidence: 0.72});
                router._modelScores.set('llama3.2::code', {frequency: 0.70, confidence: 0.50});

                const scores = router.getScores();

                expect(scores['gpt-4o::reasoning']).toBeDefined();
                expect(scores['llama3.2::code']).toBeDefined();
                expect(scores['gpt-4o::reasoning'].expectation).toBeDefined();
            });
        });

        describe('setScore', () => {
            it('should manually set a model score', async () => {
                await router.setScore('gpt-4o', ':reasoning', 0.9, 0.8);

                expect(router._modelScores.get('gpt-4o::reasoning')).toEqual({
                    frequency: 0.9,
                    confidence: 0.8
                });
                expect(mockSemanticMemory.remember).toHaveBeenCalled();
            });
        });
    });

    describe('ModelBenchmark', () => {
        let benchmark;
        let mockAIClient;

        const config = {
            models: {fallback: 'gpt-4o-mini'}
        };

        beforeEach(() => {
            mockAIClient = {
                generate: jest.fn().mockResolvedValue({
                    text: 'Test response',
                    usage: {completionTokens: 50}
                })
            };

            benchmark = new ModelBenchmark(mockAIClient, config);
        });

        describe('run', () => {
            it('should run benchmarks for all task types by default', async () => {
                const results = await benchmark.run('gpt-4o');

                expect(results.model).toBe('gpt-4o');
                expect(results.scores).toBeDefined();
                expect(Object.keys(results.scores).length).toBeGreaterThan(0);
            });

            it('should run benchmarks for specific task types', async () => {
                const results = await benchmark.run('gpt-4o', [':code', ':reasoning']);

                expect(results.scores[':code']).toBeDefined();
                expect(results.scores[':reasoning']).toBeDefined();
                expect(results.scores[':creative']).toBeUndefined();
            });

            it('should handle LLM errors gracefully', async () => {
                mockAIClient.generate.mockRejectedValue(new Error('API error'));

                const results = await benchmark.run('gpt-4o', [':code']);

                expect(results.scores[':code'].average).toBe(0.0);
                expect(results.scores[':code'].tasks[0].error).toBeDefined();
            });

            it('should score responses correctly', async () => {
                mockAIClient.generate.mockResolvedValue({
                    text: 'No, we cannot conclude this. This is a logical fallacy.',
                    usage: {completionTokens: 20}
                });

                const results = await benchmark.run('gpt-4o', [':reasoning']);

                const logicalDeduction = results.scores[':reasoning'].tasks.find(t => t.name === 'logical-deduction');
                expect(logicalDeduction.score).toBeGreaterThan(0.5);
            });
        });

        describe('getTasksForType', () => {
            it('should return tasks for a specific task type', () => {
                const tasks = ModelBenchmark.getTasksForType(':code');
                expect(tasks.length).toBeGreaterThan(0);
                expect(tasks[0].name).toBeDefined();
                expect(tasks[0].prompt).toBeDefined();
                expect(typeof tasks[0].score).toBe('function');
            });

            it('should return empty array for unknown task type', () => {
                const tasks = ModelBenchmark.getTasksForType(':unknown');
                expect(tasks).toEqual([]);
            });
        });

        describe('getTaskTypes', () => {
            it('should return all available task types', () => {
                const taskTypes = ModelBenchmark.getTaskTypes();
                expect(taskTypes).toContain(':code');
                expect(taskTypes).toContain(':reasoning');
                expect(taskTypes).toContain(':creative');
                expect(taskTypes).toContain(':retrieval');
            });
        });
    });

    describe('Integration: ModelRouter + ModelBenchmark', () => {
        it('should run benchmark without errors', async () => {
            const mockAIClient = {
                generate: jest.fn().mockResolvedValue({
                    text: 'Paris is the capital of France.',
                    usage: {completionTokens: 10}
                })
            };

            const mockSemanticMemory = {
                initialize: jest.fn(),
                query: jest.fn().mockResolvedValue([]),
                remember: jest.fn().mockResolvedValue('mem_123'),
                forget: jest.fn().mockResolvedValue(0)
            };

            const config = {
                profile: 'evolved',
                capabilities: {
                    multiModelRouting: true,
                    modelExploration: true,
                    modelScoreUpdates: true
                },
                models: {
                    fallback: 'gpt-4o-mini',
                    providers: {
                        openai: {enabled: true, models: ['gpt-4o']}
                    }
                }
            };

            const benchmark = new ModelBenchmark(mockAIClient, config, mockSemanticMemory);

            // Run benchmark - should complete without throwing
            await expect(benchmark.run('gpt-4o', [':retrieval'])).resolves.not.toThrow();
        });
    });
});
