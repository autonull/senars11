/**
 * Phase 4.5 Unit Tests — IntrospectionOps
 *
 * Governed by: runtimeIntrospection capability flag
 */

import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {IntrospectionOps} from '../../../agent/src/introspection/index.js';

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
            mockLoopState.cycleCount = 43;
            const manifest2 = introspectionOps.generateManifest();

            expect(manifest1).toBe(manifest2);
        });
    });

    describe('listSkills()', () => {
        it('lists all active skills', () => {
            const skills = introspectionOps.listSkills();

            expect(skills).toContain('skill-inventory');
            expect(mockActionDispatcher.getActiveActionDefs).toHaveBeenCalled();
        });

        it('handles missing action dispatcher', () => {
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
            expect(introspectionOps._escape).toBeUndefined();
        });
    });
});
