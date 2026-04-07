/**
 * Phase 6 Unit Tests — ContextBuilder (MeTTa-Driven Context Assembly)
 *
 * Tests for agent/src/memory/ContextBuilder.js
 *
 * Governed by: contextBudgets capability flag
 *
 * Tests cover:
 * - Context slot assembly
 * - Budget truncation
 * - Grounded op registration
 * - Integration with SemanticMemory and ActionDispatcher
 */

import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {existsSync} from 'fs';
import {join} from 'path';

import {ContextBuilder} from '../../../agent/src/memory/index.js';

describe('Phase 6: ContextBuilder', () => {
    let contextBuilder;
    let mockConfig;
    let mockSemanticMemory;
    let mockHistorySpace;
    let mockActionDispatcher;
    let mockIntrospectionOps;

    beforeEach(() => {
        mockConfig = {
            capabilities: {
                contextBudgets: true,
                semanticMemory: true,
                persistentHistory: true,
                actionDispatch: true,
                runtimeIntrospection: true,
                harnessOptimization: true,
                autonomousLoop: false
            },
            memory: {
                maxRecallItems: 20,
                maxRecallChars: 8000,
                maxHistoryChars: 12000,
                maxFeedbackChars: 6000,
                pinnedMaxChars: 3000
            },
            workingMemory: {
                maxEntries: 20
            },
            harness: {
                harnessEvalInterval: 200
            }
        };

        mockSemanticMemory = {
            getPinned: jest.fn(async () => [{content: 'Pinned memory 1'}, {content: 'Pinned memory 2'}]),
            query: jest.fn(async (text, k) => {
                return [
                    {content: `Recalled: ${text}`, score: 0.8},
                    {content: 'Related memory', score: 0.6}
                ];
            })
        };

        mockHistorySpace = {
            getRecent: jest.fn(async (n) => [
                {timestamp: Date.now(), content: 'History entry 1'},
                {timestamp: Date.now(), content: 'History entry 2'}
            ])
        };

        mockActionDispatcher = {
            getActiveActionDefs: jest.fn(() => '(send "...")\n(remember "...")\n(query "...")')
        };

        mockIntrospectionOps = {
            generateManifest: jest.fn(() => JSON.stringify({
                version: '0.1.0',
                profile: 'parity',
                capabilities: {contextBudgets: true}
            }))
        };

        contextBuilder = new ContextBuilder(
            mockConfig,
            mockSemanticMemory,
            mockHistorySpace,
            mockActionDispatcher,
            mockIntrospectionOps
        );
    });

    describe('constructor', () => {
        it('initializes with default budgets', () => {
            const builder = new ContextBuilder({}, null, null, null, null);
            expect(builder.budgets.recallChars).toBe(8000);
            expect(builder.budgets.historyChars).toBe(12000);
            expect(builder.budgets.pinnedMaxChars).toBe(3000);
        });

        it('uses config-provided budgets', () => {
            const customConfig = {
                memory: {maxRecallChars: 5000, maxHistoryChars: 10000}
            };
            const builder = new ContextBuilder(customConfig, null, null, null, null);
            expect(builder.budgets.recallChars).toBe(5000);
            expect(builder.budgets.historyChars).toBe(10000);
        });
    });

    describe('registerGroundedOps()', () => {
        it('registers all required grounded ops', () => {
            const mockRegister = jest.fn();
            const mockInterp = {
                ground: {register: mockRegister}
            };

            contextBuilder.registerGroundedOps(mockInterp);

            expect(mockRegister).toHaveBeenCalledWith('context-init', expect.any(Function), {lazy: true});
            expect(mockRegister).toHaveBeenCalledWith('context-concat', expect.any(Function), {lazy: true});
            expect(mockRegister).toHaveBeenCalledWith('load-harness-prompt', expect.any(Function), {lazy: true});
            expect(mockRegister).toHaveBeenCalledWith('default-system-prompt', expect.any(Function), {lazy: true});
            expect(mockRegister).toHaveBeenCalledWith('filter-capabilities', expect.any(Function), {lazy: true});
            expect(mockRegister).toHaveBeenCalledWith('get-active-skills', expect.any(Function), {lazy: true});
            expect(mockRegister).toHaveBeenCalledWith('get-pinned-memories', expect.any(Function), {lazy: true});
            expect(mockRegister).toHaveBeenCalledWith('get-wm-entries', expect.any(Function), {lazy: true});
            expect(mockRegister).toHaveBeenCalledWith('generate-manifest', expect.any(Function), {lazy: true});
            expect(mockRegister).toHaveBeenCalledWith('query-memories', expect.any(Function), {lazy: true});
            expect(mockRegister).toHaveBeenCalledWith('get-history', expect.any(Function), {lazy: true});
            expect(mockRegister).toHaveBeenCalledWith('get-feedback', expect.any(Function), {lazy: true});
            expect(mockRegister).toHaveBeenCalledWith('format-input', expect.any(Function), {lazy: true});
            expect(mockRegister).toHaveBeenCalledWith('get-budget', expect.any(Function), {lazy: true});
        });
    });

    describe('build()', () => {
        it('assembles context with all slots', async () => {
            const context = await contextBuilder.build('Test input message');

            expect(context).toBeDefined();
            expect(context.length).toBeGreaterThan(0);
            expect(context).toContain('ACTIONS');
            expect(context).toContain('CAPABILITIES');
        });

        it('includes pinned memories when semanticMemory is enabled', async () => {
            const context = await contextBuilder.build('test');

            expect(mockSemanticMemory.getPinned).toHaveBeenCalled();
            expect(context).toContain('PINNED');
        });

        it('includes recalled memories based on input', async () => {
            await contextBuilder.build('What do you remember about cats?');

            expect(mockSemanticMemory.query).toHaveBeenCalledWith(
                'What do you remember about cats?',
                expect.any(Number)
            );
        });

        it('includes history when persistentHistory is enabled', async () => {
            const context = await contextBuilder.build('test');

            expect(mockHistorySpace.getRecent).toHaveBeenCalled();
            expect(context).toContain('HISTORY');
        });

        it('truncates content that exceeds budgets', async () => {
            // Mock very long history
            mockHistorySpace.getRecent.mockResolvedValue([
                {content: 'A'.repeat(20000)}
            ]);

            const context = await contextBuilder.build('test');

            // Should be truncated to budget
            expect(context.length).toBeLessThan(50000);
        });

        it('handles missing input gracefully', async () => {
            const context = await contextBuilder.build(null);

            expect(context).toBeDefined();
            expect(context).toContain('(no input)');
        });
    });

    describe('recordFeedback()', () => {
        it('stores feedback for next cycle', () => {
            contextBuilder.recordFeedback('Good response', null);
            expect(contextBuilder.lastFeedback).toBe('Good response');
        });

        it('clears feedback after retrieval', async () => {
            contextBuilder.recordFeedback('Test feedback', 'Test error');

            // First get-feedback should return the feedback
            const feedback1 = contextBuilder._getFeedback();
            expect(feedback1).toContain('Test feedback');

            // Second get-feedback should be empty (cleared)
            const feedback2 = contextBuilder._getFeedback();
            expect(feedback2).toBe('');
        });
    });

    describe('_loadHarnessPrompt()', () => {
        it('loads prompt.metta when harnessOptimization is enabled', () => {
            const promptPath = join(process.cwd(), 'memory', 'harness', 'prompt.metta');

            if (existsSync(promptPath)) {
                const content = contextBuilder._loadHarnessPrompt();
                expect(content).toBeDefined();
                expect(content.length).toBeGreaterThan(0);
            }
        });

        it('falls back to default prompt when harnessOptimization is disabled', () => {
            const configWithoutHarness = {
                ...mockConfig,
                capabilities: {...mockConfig.capabilities, harnessOptimization: false}
            };
            const builder = new ContextBuilder(configWithoutHarness, null, null, null, null);
            const content = builder._loadHarnessPrompt();
            expect(content).toContain('SeNARchy');
        });
    });

    describe('_filterCapabilities()', () => {
        it('returns list of enabled capabilities', () => {
            const result = contextBuilder._filterCapabilities('active');
            expect(result).toContain('contextBudgets');
            expect(result).toContain('semanticMemory');
        });

        it('handles empty capabilities config', () => {
            const builder = new ContextBuilder({capabilities: {}}, null, null, null, null);
            const result = builder._filterCapabilities('active');
            expect(result).toBe('(no capabilities enabled)');
        });
    });

    describe('_getActiveSkills()', () => {
        it('returns skills from dispatcher', () => {
            const result = contextBuilder._getActiveSkills();
            expect(mockActionDispatcher.getActiveActionDefs).toHaveBeenCalled();
            expect(result).toContain('(send');
        });

        it('returns disabled message when actionDispatch is false', () => {
            const configWithoutSexpr = {
                ...mockConfig,
                capabilities: {...mockConfig.capabilities, actionDispatch: false}
            };
            const builder = new ContextBuilder(configWithoutSexpr, null, null, mockActionDispatcher, null);
            const result = builder._getActiveSkills();
            expect(result).toContain('disabled');
        });
    });

    describe('_generateManifest()', () => {
        it('returns manifest when runtimeIntrospection is enabled', () => {
            const result = contextBuilder._generateManifest();
            expect(mockIntrospectionOps.generateManifest).toHaveBeenCalled();
            expect(result).toBeDefined();
        });

        it('returns empty string when runtimeIntrospection is disabled', () => {
            const configWithoutIntrospection = {
                ...mockConfig,
                capabilities: {...mockConfig.capabilities, runtimeIntrospection: false}
            };
            const builder = new ContextBuilder(configWithoutIntrospection, null, null, null, null);
            const result = builder._generateManifest();
            expect(result).toBe('');
        });
    });

    describe('_formatInput()', () => {
        it('formats string input', () => {
            const result = contextBuilder._formatInput('Hello world');
            expect(result).toBe('Message: Hello world');
        });

        it('formats object input with metadata', () => {
            const input = {
                content: 'Test content',
                source: 'user123',
                type: 'message',
                timestamp: Date.now()
            };
            const result = contextBuilder._formatInput(input);

            expect(result).toContain('Content: Test content');
            expect(result).toContain('Source: user123');
        });

        it('handles autonomous mode with no input', () => {
            const result = contextBuilder._formatInput(null);
            expect(result).toContain('(no input)');
        });
    });

    describe('_truncate()', () => {
        it('returns content unchanged when under limit', () => {
            const result = contextBuilder._truncate('Short content', 1000);
            expect(result).toBe('Short content');
        });

        it('truncates content exceeding limit', () => {
            const longContent = 'A'.repeat(500);
            const result = contextBuilder._truncate(longContent, 100);

            expect(result.length).toBeLessThanOrEqual(100);
            expect(result).toContain('... [truncated]');
        });

        it('handles null/undefined content', () => {
            expect(contextBuilder._truncate(null, 100)).toBe('');
            expect(contextBuilder._truncate(undefined, 100)).toBe('');
        });
    });
});
