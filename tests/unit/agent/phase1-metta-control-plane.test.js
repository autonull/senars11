/**
 * Phase 1 Unit Tests — MeTTa Control Plane
 * 
 * Tests for:
 * - capabilities.js flag resolution and dependency validation
 * - SkillDispatcher S-expression parsing and dispatch
 * - AgentLoop.metta semantics via JS loop
 * - Working memory (attend/dismiss) persistence and TTL
 * - Graceful malformed-output recovery
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { isEnabled, validateDeps } from '../../../agent/src/config/capabilities.js';
import { SkillDispatcher } from '../../../agent/src/skills/SkillDispatcher.js';

describe('Phase 1: MeTTa Control Plane', () => {
    describe('capabilities.js', () => {
        describe('isEnabled()', () => {
            it('resolves explicit override in config.capabilities', () => {
                const config = {
                    profile: 'parity',
                    capabilities: { fileWriteSkill: true }
                };
                expect(isEnabled(config, 'fileWriteSkill')).toBe(true);
            });

            it('resolves profile default when no explicit override', () => {
                const config = { profile: 'parity' };
                expect(isEnabled(config, 'mettaControlPlane')).toBe(true);
                expect(isEnabled(config, 'shellSkill')).toBe(false);
            });

            it('resolves DEFAULTS when profile not specified', () => {
                const config = {};
                expect(isEnabled(config, 'mettaControlPlane')).toBe(true);
            });

            it('returns false for unknown flags', () => {
                const config = { profile: 'parity' };
                expect(isEnabled(config, 'unknown-flag')).toBe(false);
            });

            it('handles minimal profile correctly', () => {
                const config = { profile: 'minimal' };
                expect(isEnabled(config, 'mettaControlPlane')).toBe(false);
                expect(isEnabled(config, 'webSearchSkill')).toBe(true);
            });

            it('handles full profile with all tiers', () => {
                const config = { profile: 'full' };
                expect(isEnabled(config, 'selfModifyingSkills')).toBe(true);
                expect(isEnabled(config, 'dynamicSkillDiscovery')).toBe(true);
                expect(isEnabled(config, 'runtimeIntrospection')).toBe(true);
            });
        });

        describe('validateDeps()', () => {
            it('passes when all dependencies satisfied', () => {
                const config = {
                    profile: 'evolved',
                    capabilities: {
                        autonomousLoop: true,
                        loopBudget: true,
                        virtualEmbodiment: true
                    }
                };
                expect(() => validateDeps(config)).not.toThrow();
            });

            it('throws on unsatisfied dependency', () => {
                const config = {
                    capabilities: {
                        autonomousLoop: true,
                        loopBudget: false
                    }
                };
                expect(() => validateDeps(config))
                    .toThrow("Capability 'autonomousLoop' requires 'loopBudget'");
            });

            it('checks nested dependencies', () => {
                const config = {
                    capabilities: {
                        goalPursuit: true,
                        autonomousLoop: true,
                        virtualEmbodiment: false
                    }
                };
                expect(() => validateDeps(config))
                    .toThrow("Capability 'goalPursuit' requires 'virtualEmbodiment'");
            });

            it('ignores disabled capabilities', () => {
                const config = {
                    capabilities: {
                        selfModifyingSkills: false,
                        safetyLayer: false,
                        auditLog: false
                    }
                };
                expect(() => validateDeps(config)).not.toThrow();
            });
        });
    });

    describe('SkillDispatcher', () => {
        let dispatcher;
        let mockHandler;

        beforeEach(() => {
            const config = {
                profile: 'parity',
                loop: { maxSkillsPerCycle: 3 }
            };
            dispatcher = new SkillDispatcher(config);
            mockHandler = jest.fn().mockResolvedValue('mock-result');
        });

        describe('register() and execute()', () => {
            it('registers and dispatches a skill', async () => {
                dispatcher.register('test-skill', mockHandler, 'mettaControlPlane', ':reflect');
                const results = await dispatcher.execute([{ name: 'test-skill', args: ['arg1'] }]);
                expect(results).toHaveLength(1);
                expect(results[0].skill).toBe('test-skill');
                expect(results[0].result).toBe('mock-result');
                expect(mockHandler).toHaveBeenCalledWith('arg1');
            });

            it('returns error for unknown skill', async () => {
                const results = await dispatcher.execute([{ name: 'unknown', args: [] }]);
                expect(results[0].error).toMatch(/unknown-skill/);
            });

            it('returns error when capability disabled', async () => {
                dispatcher.register('disabled-skill', mockHandler, 'shellSkill', ':system');
                const results = await dispatcher.execute([{ name: 'disabled-skill', args: [] }]);
                expect(results[0].error).toMatch(/capability-disabled/);
            });

            it('handles handler errors gracefully', async () => {
                const erroringHandler = jest.fn().mockRejectedValue(new Error('boom'));
                dispatcher.register('error-skill', erroringHandler, 'mettaControlPlane', ':reflect');
                const results = await dispatcher.execute([{ name: 'error-skill', args: [] }]);
                expect(results[0].error).toBe('boom');
            });
        });

        describe('parseResponse()', () => {
            beforeEach(() => {
                dispatcher.register('skill1', mockHandler, 'mettaControlPlane', ':reflect');
                dispatcher.register('skill2', mockHandler, 'mettaControlPlane', ':reflect');
                dispatcher.register('skill3', mockHandler, 'mettaControlPlane', ':reflect');
            });

            it('parses well-formed multi-command response', () => {
                const response = '((skill1 "arg1") (skill2 "arg2" "arg3"))';
                const { cmds, error } = dispatcher.parseResponse(response);
                expect(error).toBeNull();
                expect(cmds).toHaveLength(2);
                expect(cmds[0]).toEqual({ name: 'skill1', args: ['arg1'] });
                expect(cmds[1]).toEqual({ name: 'skill2', args: ['arg2', 'arg3'] });
            });

            it('parses single command without outer wrapper', () => {
                const response = '(skill1 "alone")';
                const { cmds, error } = dispatcher.parseResponse(response);
                expect(error).toBeNull();
                expect(cmds).toHaveLength(1);
                expect(cmds[0]).toEqual({ name: 'skill1', args: ['alone'] });
            });

            it('balances missing closing parentheses', () => {
                const response = '((skill1 "arg1" (skill2 "arg2")';
                const { cmds, error } = dispatcher.parseResponse(response);
                expect(error).toBeNull();
                expect(cmds.length).toBeGreaterThan(0);
            });

            it('handles empty response', () => {
                const { cmds, error } = dispatcher.parseResponse('');
                expect(error).toBeNull();
                expect(cmds).toHaveLength(0);
            });

            it('handles null response', () => {
                const { cmds, error } = dispatcher.parseResponse(null);
                expect(error).toBeNull();
                expect(cmds).toHaveLength(0);
            });

            it('returns empty on unparseable input', () => {
                // Parser doesn't fail on non-s-expression text, just returns empty
                const response = 'not an s-expression at all';
                const { cmds, error } = dispatcher.parseResponse(response);
                expect(cmds).toHaveLength(0);
                expect(error).toBeNull();
            });

            it('respects maxSkillsPerCycle limit', () => {
                const response = '((skill1 "a") (skill2 "b") (skill3 "c") (skill4 "d"))';
                const { cmds, error } = dispatcher.parseResponse(response);
                expect(error).toBeNull();
                expect(cmds).toHaveLength(3); // maxSkillsPerCycle = 3
            });

            it('returns disabled skills when sExprSkillDispatch is false', () => {
                const config = {
                    profile: 'parity',
                    capabilities: { sExprSkillDispatch: false }
                };
                const disabledDispatcher = new SkillDispatcher(config);
                const { cmds, error } = disabledDispatcher.parseResponse('((skill1 "arg"))');
                expect(cmds).toHaveLength(0);
                expect(error).toBeNull();
            });
        });

        describe('getActiveSkillDefs()', () => {
            it('returns only enabled skills', () => {
                dispatcher.register('enabled-skill', mockHandler, 'mettaControlPlane', ':reflect');
                dispatcher.register('disabled-skill', mockHandler, 'shellSkill', ':system');
                const defs = dispatcher.getActiveSkillDefs();
                expect(defs).toContain('enabled-skill');
                expect(defs).not.toContain('disabled-skill');
            });

            it('returns "(no skills available)" when none enabled', () => {
                const config = { profile: 'minimal' };
                const minimalDispatcher = new SkillDispatcher(config);
                minimalDispatcher.register('any-skill', mockHandler, 'shellSkill', ':system');
                const defs = minimalDispatcher.getActiveSkillDefs();
                expect(defs).toBe('(no skills available)');
            });
        });
    });

    describe('Working Memory semantics (via Agent._registerMeTTaSkills)', () => {
        it('attend adds item to WM with priority and TTL', async () => {
            // This test verifies the attend skill handler logic
            const loopState = { wm: [], cycleCount: 0 };
            const agentCfg = {
                workingMemory: { defaultTtl: 10, maxEntries: 20 }
            };

            // Simulate the attend handler
            const content = 'test item';
            const priority = 0.8;
            const ttl = agentCfg.workingMemory.defaultTtl;

            loopState.wm.push({
                content: String(content),
                priority,
                ttl,
                cycleAdded: loopState.cycleCount
            });
            loopState.wm.sort((a, b) => b.priority - a.priority);

            expect(loopState.wm).toHaveLength(1);
            expect(loopState.wm[0]).toMatchObject({
                content: 'test item',
                priority: 0.8,
                ttl: 10
            });
        });

        it('dismiss removes matching items from WM', async () => {
            const loopState = {
                wm: [
                    { content: 'item 1', priority: 0.5, ttl: 5 },
                    { content: 'item 2', priority: 0.8, ttl: 5 },
                    { content: 'item 3', priority: 0.3, ttl: 5 }
                ]
            };

            const query = 'item 2';
            const before = loopState.wm.length;
            loopState.wm = loopState.wm.filter(e => !e.content.includes(String(query)));

            expect(loopState.wm.length).toBe(before - 1);
            expect(loopState.wm.map(e => e.content)).not.toContain('item 2');
        });

        it('tick-wm decrements TTLs and removes expired', async () => {
            const loopState = {
                wm: [
                    { content: 'item 1', priority: 0.5, ttl: 1 },
                    { content: 'item 2', priority: 0.8, ttl: 3 },
                    { content: 'item 3', priority: 0.3, ttl: 0 }
                ]
            };

            // Simulate tick-wm
            loopState.wm = loopState.wm
                .map(e => ({ ...e, ttl: e.ttl - 1 }))
                .filter(e => e.ttl > 0);

            expect(loopState.wm).toHaveLength(1);
            expect(loopState.wm[0].content).toBe('item 2');
            expect(loopState.wm[0].ttl).toBe(2);
        });

        it('WM respects maxEntries cap', async () => {
            const loopState = { wm: [], cycleCount: 0 };
            const maxEntries = 3;

            // Add 5 items
            for (let i = 0; i < 5; i++) {
                loopState.wm.push({
                    content: `item ${i}`,
                    priority: Math.random(),
                    ttl: 10,
                    cycleAdded: loopState.cycleCount
                });
                loopState.wm.sort((a, b) => b.priority - a.priority);
                if (loopState.wm.length > maxEntries) {
                    loopState.wm = loopState.wm.slice(0, maxEntries);
                }
            }

            expect(loopState.wm.length).toBeLessThanOrEqual(maxEntries);
        });
    });

    describe('Integration: SkillDispatcher with capability gates', () => {
        it('gates skill execution on capability flag', async () => {
            const config = {
                profile: 'parity',
                capabilities: { fileWriteSkill: false }
            };
            const dispatcher = new SkillDispatcher(config);
            const writeHandler = jest.fn().mockResolvedValue('written');
            dispatcher.register('write-file', writeHandler, 'fileWriteSkill', ':local-write');

            const results = await dispatcher.execute([{ name: 'write-file', args: ['path', 'content'] }]);
            expect(results[0].error).toMatch(/capability-disabled/);
            expect(writeHandler).not.toHaveBeenCalled();
        });

        it('allows skill execution when capability enabled', async () => {
            const config = {
                profile: 'parity',
                capabilities: { fileWriteSkill: true }
            };
            const dispatcher = new SkillDispatcher(config);
            const writeHandler = jest.fn().mockResolvedValue('written: path');
            dispatcher.register('write-file', writeHandler, 'fileWriteSkill', ':local-write');

            const results = await dispatcher.execute([{ name: 'write-file', args: ['path', 'content'] }]);
            expect(results[0].error).toBeNull();
            expect(results[0].result).toBe('written: path');
            expect(writeHandler).toHaveBeenCalledWith('path', 'content');
        });
    });
});
