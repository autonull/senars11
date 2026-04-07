/**
 * Phase 4.5 Unit Tests — HookOrchestrator & IntrospectionOps
 *
 * Tests for:
 * - agent/src/skills/HookOrchestrator.js
 * - agent/src/introspection/IntrospectionOps.js
 *
 * Governed by: executionHooks, runtimeIntrospection capability flags
 */

import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {existsSync} from 'fs';
import {join} from 'path';

import {getHookOrchestrator, HookOrchestrator, resetHookOrchestrator} from '../../../agent/src/skills/index.js';
import {IntrospectionOps} from '../../../agent/src/introspection/index.js';

describe('Phase 4.5: HookOrchestrator', () => {
    let orchestrator;
    let mockAuditSpace;
    let mockConfig;

    beforeEach(() => {
        resetHookOrchestrator();

        mockAuditSpace = {
            emitSkillBlocked: jest.fn(async () => {
            }),
            emitEvent: jest.fn(async () => {
            })
        };

        mockConfig = {
            capabilities: {
                executionHooks: true,
                auditLog: true,
                shellSkill: true,
                selfModifyingSkills: false
            },
            shell: {
                forbiddenPatterns: ['rm', 'sudo', 'curl']
            }
        };

        orchestrator = new HookOrchestrator(mockConfig, mockAuditSpace);
    });

    describe('loadHooksFromFile()', () => {
        it('loads hooks from hooks.metta file', async () => {
            const hooksPath = join(process.cwd(), 'agent', 'src', 'metta', 'hooks.metta');

            if (existsSync(hooksPath)) {
                await orchestrator.loadHooksFromFile(hooksPath);
                expect(orchestrator.loaded).toBe(true);
                expect(orchestrator.hooks.pre.length).toBeGreaterThan(0);
                expect(orchestrator.hooks.post.length).toBeGreaterThan(0);
            }
        });

        it('handles missing hooks.metta gracefully', async () => {
            await orchestrator.loadHooksFromFile('/nonexistent/hooks.metta');
            expect(orchestrator.loaded).toBe(false);
        });
    });

    describe('runPreHooks()', () => {
        beforeEach(() => {
            // Register test hooks programmatically
            orchestrator.registerHook('pre', {operator: {name: 'shell'}, components: [{name: '$cmd'}]}, {
                operator: {name: 'if'},
                components: [
                    {operator: {name: 'contains-forbidden?'}, components: [{name: '$cmd'}]},
                    {operator: {name: 'deny'}, components: [{name: 'Forbidden'}]},
                    {operator: {name: 'allow'}}
                ]
            });
        });

        it('allows execution when no hooks match', async () => {
            const result = await orchestrator.runPreHooks({name: 'send', args: ['hello']});
            expect(result.action).toBe('allow');
        });

        it('denies execution when hook returns deny', async () => {
            // Register a hook that always denies
            orchestrator.registerHook('pre', {operator: {name: 'test-skill'}, components: []}, {
                operator: {name: 'deny'},
                components: [{value: 'Test denial'}]
            });

            const result = await orchestrator.runPreHooks({name: 'test-skill', args: []});
            expect(result.action).toBe('deny');
            expect(result.reason).toBe('Test denial');
        });

        it('rewrites args when hook returns rewrite', async () => {
            orchestrator.registerHook('pre', {operator: {name: 'search'}, components: [{name: '$query'}]}, {
                operator: {name: 'rewrite'},
                components: [{
                    operator: {name: 'search'},
                    components: [{value: 'modified query'}]
                }]
            });

            const result = await orchestrator.runPreHooks({name: 'search', args: ['original']});
            expect(result.action).toBe('rewrite');
            expect(result.newArgs).toEqual(['modified query']);
        });

        it('returns allow when executionHooks is disabled', async () => {
            const configWithoutHooks = {
                ...mockConfig,
                capabilities: {...mockConfig.capabilities, executionHooks: false}
            };
            const opt = new HookOrchestrator(configWithoutHooks, mockAuditSpace);
            const result = await opt.runPreHooks({name: 'shell', args: ['ls']});
            expect(result.action).toBe('allow');
        });
    });

    describe('runPostHooks()', () => {
        it('emits audit events for post-hooks', async () => {
            orchestrator.registerHook('post', {
                operator: {name: 'write-file'},
                components: [{name: '$path'}, {name: '$content'}]
            }, {
                operator: {name: 'audit-emit'},
                components: [{
                    operator: {name: 'audit-event'},
                    components: [
                        {operator: {name: ':type'}, components: []},
                        {value: ':file-write'}
                    ]
                }]
            });

            await orchestrator.runPostHooks({name: 'write-file', args: ['test.txt', 'content']}, 'success');
            expect(mockAuditSpace.emitEvent).toHaveBeenCalled();
        });

        it('handles errors gracefully', async () => {
            // Register a hook that will throw
            orchestrator.registerHook('post', {operator: {name: 'error-skill'}, components: []}, {
                operator: {name: 'nonexistent-op'},
                components: []
            });

            // Should not throw
            await expect(orchestrator.runPostHooks({name: 'error-skill', args: []}, 'result'))
                .resolves.not.toThrow();
        });
    });

    describe('Pattern matching', () => {
        it('matches skill patterns correctly', () => {
            const pattern = {operator: {name: 'shell'}, components: [{name: '$cmd'}]};
            const match = orchestrator._matchPattern(pattern, 'shell', ['ls -la']);

            expect(match).toBeDefined();
            expect(match.cmd).toBe('ls -la');
        });

        it('returns null for non-matching patterns', () => {
            const pattern = {operator: {name: 'shell'}, components: []};
            const match = orchestrator._matchPattern(pattern, 'send', ['hello']);
            expect(match).toBeNull();
        });
    });

    describe('Singleton pattern', () => {
        it('returns the same instance via getHookOrchestrator', () => {
            const instance1 = getHookOrchestrator(mockConfig, mockAuditSpace);
            const instance2 = getHookOrchestrator(mockConfig, mockAuditSpace);
            expect(instance1).toBe(instance2);
        });

        it('can be reset via resetHookOrchestrator', () => {
            const instance1 = getHookOrchestrator(mockConfig, mockAuditSpace);
            resetHookOrchestrator();
            const instance2 = getHookOrchestrator(mockConfig, mockAuditSpace);
            expect(instance1).not.toBe(instance2);
        });
    });
});

describe('Phase 4.5: IntrospectionOps', () => {
    let introspectionOps;
    let mockConfig;
    let mockActionDispatcher;
    let mockEmbodimentBus;
    let mockModelRouter;
    let mockLoopState;

    beforeEach(() => {
        mockConfig = {
            profile: 'parity',
            capabilities: {
                runtimeIntrospection: true,
                mettaControlPlane: true,
                semanticMemory: true,
                safetyLayer: true,
                auditLog: true,
                executionHooks: true
            }
        };

        mockActionDispatcher = {
            getActiveActionDefs: jest.fn(() => '(send ...) \n(remember ...) \n(query ...)')
        };

        mockEmbodimentBus = {
            getAll: jest.fn(() => [
                {id: 'irc-quakenet', type: 'irc', status: 'connected'},
                {id: 'cli', type: 'cli', status: 'connected'}
            ])
        };

        mockModelRouter = {
            getScores: jest.fn(() => [
                {modelId: 'gpt-4o', truth: {f: 0.85, c: 0.72}},
                {modelId: 'claude-sonnet-4-6', truth: {f: 0.91, c: 0.82}}
            ])
        };

        mockLoopState = {
            cycleCount: 42,
            wm: [
                {content: 'Test item 1', priority: 0.8, ttl: 5},
                {content: 'Test item 2', priority: 0.6, ttl: 3}
            ],
            budget: 35,
            historyBuffer: ['History 1', 'History 2'],
            error: null,
            prevmsg: 'Last message',
            lastresults: [{action: 'send', result: 'sent'}],
            lastsend: 'Hello',
            modelOverride: null,
            modelOverrideCycles: 0
        };

        introspectionOps = new IntrospectionOps(
            mockConfig,
            mockActionDispatcher,
            mockEmbodimentBus,
            mockModelRouter,
            mockLoopState
        );
    });

    describe('generateManifest()', () => {
        it('generates full manifest when runtimeIntrospection enabled', () => {
            const manifest = introspectionOps.generateManifest();

            expect(manifest).toBeDefined();
            expect(manifest).toContain('agent-manifest');
            expect(manifest).toContain('version');
            expect(manifest).toContain('profile');
            expect(manifest).toContain('capabilities');
        });

        it('returns restricted manifest when runtimeIntrospection disabled', () => {
            const configWithoutIntrospection = {
                ...mockConfig,
                capabilities: {...mockConfig.capabilities, runtimeIntrospection: false}
            };
            const ops = new IntrospectionOps(configWithoutIntrospection, null, null, null, null);
            const manifest = ops.generateManifest();

            expect(manifest).toBe('(manifest :restricted true)');
        });

        it('caches manifest for 5 cycles', () => {
            const manifest1 = introspectionOps.generateManifest();
            mockLoopState.cycleCount = 43; // Advance 1 cycle
            const manifest2 = introspectionOps.generateManifest();

            expect(manifest1).toBe(manifest2); // Should be cached
        });
    });

    describe('listSkills()', () => {
        it('lists all active skills', () => {
            const skills = introspectionOps.listSkills();

            expect(skills).toContain('skill-inventory');
            expect(mockActionDispatcher.getActiveActionDefs).toHaveBeenCalled();
        });

        it('handles missing skill dispatcher', () => {
            const ops = new IntrospectionOps(mockConfig, null, null, null, null);
            const skills = ops.listSkills();

            expect(skills).toContain('skill-inventory');
        });
    });

    describe('describeSubsystems()', () => {
        it('describes active subsystems', () => {
            const subsystems = introspectionOps.describeSubsystems();

            expect(subsystems).toContain('subsystems');
            expect(subsystems).toContain('mettaControlPlane');
            expect(subsystems).toContain('semanticMemory');
        });
    });

    describe('getState()', () => {
        it('returns working memory state', () => {
            const state = introspectionOps.getState('&wm');

            expect(state).toContain('agent-state');
            expect(state).toContain('&wm');
            expect(state).toContain('wm-entry');
        });

        it('returns budget state', () => {
            const state = introspectionOps.getState('&budget');

            expect(state).toContain('35');
        });

        it('returns cycle count', () => {
            const state = introspectionOps.getState('&cycle-count');

            expect(state).toContain('42');
        });

        it('returns error state', () => {
            const state = introspectionOps.getState('&error');

            expect(state).toContain('&error');
        });

        it('returns last results', () => {
            const state = introspectionOps.getState('&lastresults');

            expect(state).toContain('result');
            expect(state).toContain('send');
        });

        it('returns last send', () => {
            const state = introspectionOps.getState('&lastsend');

            expect(state).toContain('Hello');
        });

        it('handles unknown keys', () => {
            const state = introspectionOps.getState('&unknown');

            expect(state).toContain(':unknown-key');
        });

        it('handles missing loop state', () => {
            const ops = new IntrospectionOps(mockConfig, null, null, null, null);
            const state = ops.getState('&wm');

            expect(state).toContain(':error');
        });
    });

    describe('Static methods', () => {
        it('provides static generateManifest method', () => {
            const manifest = IntrospectionOps.generateManifest(
                mockConfig, mockLoopState, mockActionDispatcher, mockEmbodimentBus, mockModelRouter
            );

            expect(manifest).toContain('agent-manifest');
        });

        it('provides static listSkills method', () => {
            const skills = IntrospectionOps.listSkills(mockConfig, mockActionDispatcher);

            expect(skills).toContain('skill-inventory');
        });

        it('provides static describeSubsystems method', () => {
            const subsystems = IntrospectionOps.describeSubsystems(mockConfig, mockEmbodimentBus);

            expect(subsystems).toContain('subsystems');
        });

        it('provides static getState method', () => {
            const state = IntrospectionOps.getState('&budget', mockLoopState);

            expect(state).toContain('35');
        });
    });

    describe('_escape()', () => {
        it('is not implemented', () => {
            // _escape method does not exist on IntrospectionOps
            expect(introspectionOps._escape).toBeUndefined();
        });
    });
});
