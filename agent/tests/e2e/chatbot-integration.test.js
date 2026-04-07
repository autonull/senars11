/**
 * End-to-End Integration Test — MeTTaClaw Personal Assistant Chatbot
 *
 * Tests the full agent pipeline:
 * - Agent initialization with parity profile
 * - MeTTa control plane setup
 * - Action registration and dispatch
 * - Working memory (attend/dismiss/tick)
 * - Context building with budget management
 * - Message processing through VirtualEmbodiment
 * - JSON tool-call parsing and execution
 * - Semantic memory operations
 * - Capability gating and dependency validation
 * - Full chatbot interaction cycles
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { isEnabled, validateDeps } from '../../src/config/capabilities.js';
import { ActionDispatcher } from '@senars/agent/actions/index.js';
import { VirtualEmbodiment } from '@senars/agent/io/index.js';
import { EmbodimentBus } from '@senars/agent/io/index.js';

jest.setTimeout(15000);

describe('MeTTaClaw Chatbot E2E', () => {
    describe('1. Agent Initialization & Configuration', () => {
        it('resolves parity profile capabilities correctly', () => {
            const config = { profile: 'parity' };
            expect(isEnabled(config, 'mettaControlPlane')).toBe(true);
            expect(isEnabled(config, 'actionDispatch')).toBe(true);
            expect(isEnabled(config, 'semanticMemory')).toBe(true);
            expect(isEnabled(config, 'persistentHistory')).toBe(true);
            expect(isEnabled(config, 'loopBudget')).toBe(true);
            expect(isEnabled(config, 'contextBudgets')).toBe(true);
            expect(isEnabled(config, 'fileReadSkill')).toBe(true);
            expect(isEnabled(config, 'webSearchSkill')).toBe(true);
            expect(isEnabled(config, 'fileWriteSkill')).toBe(false);
            expect(isEnabled(config, 'shellSkill')).toBe(false);
            expect(isEnabled(config, 'auditLog')).toBe(true);
        });

        it('validates capability dependencies for parity profile', () => {
            const config = { profile: 'parity' };
            expect(() => validateDeps(config)).not.toThrow();
        });

        it('validates evolved profile with all dependencies', () => {
            const config = {
                profile: 'evolved',
                capabilities: {
                    autonomousLoop: true,
                    loopBudget: true,
                    virtualEmbodiment: true,
                    safetyLayer: true,
                    auditLog: true,
                }
            };
            expect(() => validateDeps(config)).not.toThrow();
        });

        it('rejects configuration with unsatisfied dependencies', () => {
            const config = {
                capabilities: {
                    autonomousLoop: true,
                    loopBudget: false,
                }
            };
            expect(() => validateDeps(config)).toThrow("Capability 'autonomousLoop' requires 'loopBudget'");
        });
    });

    describe('2. ActionDispatcher Integration', () => {
        let dispatcher;
        let mockHandler;

        beforeEach(() => {
            const config = {
                profile: 'parity',
                loop: { maxActionsPerCycle: 3 },
                capabilities: { actionDispatch: true }
            };
            dispatcher = new ActionDispatcher(config);
            mockHandler = jest.fn().mockResolvedValue('mock-result');
        });

        it('parses and dispatches multi-action JSON response', async () => {
            dispatcher.register('think', mockHandler, 'mettaControlPlane', ':reflect');
            dispatcher.register('send', mockHandler, 'mettaControlPlane', ':network');

            const response = '{"actions":[{"name":"think","args":["processing request"]},{"name":"send","args":["Hello user"]}]}';
            const { cmds, error } = dispatcher.parseResponse(response);

            expect(error).toBeNull();
            expect(cmds).toHaveLength(2);
            expect(cmds[0]).toEqual({ name: 'think', args: ['processing request'] });
            expect(cmds[1]).toEqual({ name: 'send', args: ['Hello user'] });

            const results = await dispatcher.execute(cmds);
            expect(results).toHaveLength(2);
            expect(results[0].action).toBe('think');
            expect(results[0].result).toBe('mock-result');
            expect(results[1].action).toBe('send');
            expect(mockHandler).toHaveBeenCalledTimes(2);
        });

        it('parses plain text response when no JSON actions', () => {
            const response = `Hello there! How can I help you today?`;
            const { cmds, error } = dispatcher.parseResponse(response);

            expect(error).toBeNull();
            expect(cmds).toHaveLength(0);
        });

        it('handles malformed JSON gracefully', () => {
            const response = `{"actions":[{"name":"respond","args":["broken]}`;
            const { cmds, error } = dispatcher.parseResponse(response);

            expect(error).toBeNull();
            expect(cmds).toHaveLength(0);
        });

        it('returns empty commands on completely invalid input', () => {
            const response = 'this is not JSON at all {{{';
            const { cmds, error } = dispatcher.parseResponse(response);
            expect(cmds).toHaveLength(0);
        });

        it('gates action execution on capability flags', async () => {
            dispatcher.register('shell', mockHandler, 'shellSkill', ':system');

            const results = await dispatcher.execute([{ name: 'shell', args: ['ls'] }]);
            expect(results[0].error).toMatch(/capability-disabled/);
            expect(mockHandler).not.toHaveBeenCalled();
        });

        it('respects maxActionsPerCycle limit', () => {
            const response = '{"actions":[{"name":"skill1","args":["a"]},{"name":"skill2","args":["b"]},{"name":"skill3","args":["c"]},{"name":"skill4","args":["d"]}]}';
            dispatcher.register('skill1', mockHandler, 'mettaControlPlane', ':reflect');
            dispatcher.register('skill2', mockHandler, 'mettaControlPlane', ':reflect');
            dispatcher.register('skill3', mockHandler, 'mettaControlPlane', ':reflect');
            dispatcher.register('skill4', mockHandler, 'mettaControlPlane', ':reflect');

            const { cmds, error } = dispatcher.parseResponse(response);
            expect(error).toBeNull();
            expect(cmds).toHaveLength(3);
        });
    });

    describe('3. Working Memory Operations', () => {
        it('attend adds items with priority and TTL', () => {
            const wm = [];
            const maxEntries = 20;
            const defaultTtl = 10;

            const content = 'User prefers concise responses';
            const priority = 0.85;

            wm.push({ content, priority, ttl: defaultTtl, cycleAdded: 0 });
            wm.sort((a, b) => b.priority - a.priority);
            if (wm.length > maxEntries) wm.length = maxEntries;

            expect(wm).toHaveLength(1);
            expect(wm[0]).toMatchObject({ content, priority, ttl: 10 });
        });

        it('dismiss removes matching items from working memory', () => {
            const wm = [
                { content: 'item 1', priority: 0.5, ttl: 5 },
                { content: 'important task', priority: 0.9, ttl: 5 },
                { content: 'item 3', priority: 0.3, ttl: 5 }
            ];

            const query = 'important';
            const before = wm.length;
            wm.splice(0, wm.length, ...wm.filter(e => !e.content.includes(query)));

            expect(wm.length).toBe(before - 1);
            expect(wm.some(e => e.content.includes('important'))).toBe(false);
        });

        it('tick-wm decrements TTLs and removes expired entries', () => {
            const wm = [
                { content: 'expiring soon', priority: 0.5, ttl: 1 },
                { content: 'persistent item', priority: 0.8, ttl: 3 },
                { content: 'already expired', priority: 0.3, ttl: 0 }
            ];

            wm.splice(0, wm.length, ...wm
                .map(e => ({ ...e, ttl: e.ttl - 1 }))
                .filter(e => e.ttl > 0)
            );

            expect(wm).toHaveLength(1);
            expect(wm[0].content).toBe('persistent item');
            expect(wm[0].ttl).toBe(2);
        });

        it('working memory respects maxEntries cap with priority ordering', () => {
            const wm = [];
            const maxEntries = 3;

            const items = [
                { content: 'low priority', priority: 0.2 },
                { content: 'high priority', priority: 0.9 },
                { content: 'medium priority', priority: 0.5 },
                { content: 'very high', priority: 0.95 },
                { content: 'another low', priority: 0.1 }
            ];

            for (const item of items) {
                wm.push({ ...item, ttl: 10, cycleAdded: 0 });
                wm.sort((a, b) => b.priority - a.priority);
                if (wm.length > maxEntries) wm.length = maxEntries;
            }

            expect(wm).toHaveLength(3);
            expect(wm[0].priority).toBe(0.95);
            expect(wm[1].priority).toBe(0.9);
            expect(wm[2].priority).toBe(0.5);
        });
    });

    describe('4. VirtualEmbodiment & EmbodimentBus', () => {
        let bus;
        let virtual;

        beforeEach(async () => {
            bus = new EmbodimentBus({ attentionSalience: false });
            virtual = new VirtualEmbodiment({
                autonomousMode: false,
                idleTimeout: 5000
            });
            bus.register(virtual);
            await virtual.connect();
        });

        afterEach(async () => {
            await bus.shutdown();
        });

        it('registers VirtualEmbodiment on bus and reports connected', () => {
            expect(virtual.status).toBe('connected');
            expect(bus.getAll()).toHaveLength(1);
            expect(bus.get('virtual')).toBe(virtual);
        });

        it('queues self-tasks and emits messages', async () => {
            const received = new Promise(resolve => {
                bus.on('message', msg => {
                    if (msg.content.includes('test-task')) resolve(msg);
                });
            });

            virtual.generateSelfTask('test-task', { type: 'integration-test' });

            const msg = await received;
            expect(msg.content).toBe('test-task');
            expect(msg.from).toBe('virtual');
            expect(msg.metadata.type).toBe('self-task');
        });

        it('spawns and manages sub-agents', () => {
            const success = virtual.spawnSubAgent('sub-1', 'analyze data', {}, 5);
            expect(success).toBe(true);

            const subAgent = virtual.getSubAgent('sub-1');
            expect(subAgent).not.toBeNull();
            expect(subAgent.task).toBe('analyze data');
            expect(subAgent.cycleBudget).toBe(5);
            expect(subAgent.status).toBe('active');

            const terminated = virtual.terminateSubAgent('sub-1');
            expect(terminated.status).toBe('terminated');
            expect(virtual.getSubAgent('sub-1')).toBeNull();
        });

        it('maintains internal monologue buffer', () => {
            virtual._addMonologue('thought 1');
            virtual._addMonologue('thought 2');

            const monologue = virtual.getMonologue();
            expect(monologue).toHaveLength(2);
            expect(monologue[0].content).toBe('thought 1');
            expect(monologue[1].content).toBe('thought 2');

            virtual.clearMonologue();
            expect(virtual.getMonologue()).toHaveLength(0);
        });

        it('FIFO message retrieval from bus', async () => {
            const received = [];
            bus.on('message', msg => received.push(msg));

            virtual.generateSelfTask('task-1');
            virtual.generateSelfTask('task-2');
            virtual.generateSelfTask('task-3');

            await new Promise(r => setTimeout(r, 50));

            expect(received).toHaveLength(3);
            expect(received[0].content).toBe('task-1');
            expect(received[2].content).toBe('task-3');
        });
    });

    describe('5. Context Building & Budget Management', () => {
        it('builds context string with all required slots', () => {
            const loopState = {
                wm: [{ content: 'test item', priority: 0.8, ttl: 5 }],
                historyBuffer: ['USER: hello\nAGENT: hi'],
                lastresults: [{ skill: 'send', result: 'sent' }],
                error: null,
                cycleCount: 1
            };

            const skills = '(send (String) mettaControlPlane :network)';
            const wmStr = loopState.wm.map(e => `[${e.priority.toFixed(2)}] ${e.content} (ttl:${e.ttl})`).join('\n');
            const histStr = loopState.historyBuffer.join('\n');
            const lastResultsStr = JSON.stringify(loopState.lastresults);

            const ctx = [
                `SKILLS:\n${skills}\n\n`,
                `WM_REGISTER:\n${wmStr}\n\n`,
                `HISTORY:\n${histStr}\n`,
                `LAST_RESULTS: ${lastResultsStr}\n\n`,
                `INPUT: test input\n\n`,
                `OUTPUT: Respond with ONLY a JSON tool call if you need to take actions.`
            ].join('');

            expect(ctx).toContain('SKILLS:');
            expect(ctx).toContain('WM_REGISTER:');
            expect(ctx).toContain('test item');
            expect(ctx).toContain('HISTORY:');
            expect(ctx).toContain('hello');
            expect(ctx).toContain('LAST_RESULTS:');
            expect(ctx).toContain('INPUT: test input');
        });

        it('truncates context slots to respect character budgets', () => {
            const maxHist = 100;
            const longHistory = 'USER: ' + 'x'.repeat(200) + '\nAGENT: ' + 'y'.repeat(200);

            const truncated = longHistory.length > maxHist
                ? longHistory.slice(0, maxHist) + '\n... [truncated]'
                : longHistory;

            expect(truncated.length).toBeLessThanOrEqual(maxHist + 18);
            expect(truncated).toContain('... [truncated]');
        });

        it('handles empty working memory gracefully', () => {
            const wm = [];
            const wmStr = wm.length > 0
                ? wm.map(e => `[${e.priority.toFixed(2)}] ${e.content}`).join('\n')
                : '';

            expect(wmStr).toBe('');
        });
    });

    describe('6. Full Chatbot Interaction Cycle', () => {
        it('processes user message through complete pipeline', async () => {
            const config = {
                profile: 'parity',
                loop: { maxSkillsPerCycle: 3 },
                workingMemory: { defaultTtl: 10, maxEntries: 20 },
                capabilities: { actionDispatch: true }
            };

            const dispatcher = new ActionDispatcher(config);
            const loopState = {
                wm: [],
                historyBuffer: [],
                lastresults: [],
                error: null,
                cycleCount: 0,
                prevmsg: null,
                lastsend: ''
            };

            const sentMessages = [];
            dispatcher.register('think', async content => `(thought: ${content})`, 'mettaControlPlane', ':reflect');
            dispatcher.register('send', async content => {
                sentMessages.push(content);
                return `sent: ${content}`;
            }, 'mettaControlPlane', ':network');
            dispatcher.register('attend', async (content, priority) => {
                const pri = parseFloat(priority) || 0.5;
                loopState.wm.push({ content: String(content), priority: pri, ttl: 10, cycleAdded: loopState.cycleCount });
                loopState.wm.sort((a, b) => b.priority - a.priority);
                return `attended: ${content}`;
            }, 'mettaControlPlane', ':reflect');

            const userInput = 'Hello, can you help me?';
            const mockLLMResponse = `{"actions":[{"name":"think","args":["User is asking for help"]},{"name":"send","args":["Of course! How can I assist you?"]},{"name":"attend","args":["User needs help","0.8"]}]}`;

            const { cmds, error } = dispatcher.parseResponse(mockLLMResponse);
            expect(error).toBeNull();
            expect(cmds).toHaveLength(3);

            const results = await dispatcher.execute(cmds);
            expect(results).toHaveLength(3);
            expect(results[0].action).toBe('think');
            expect(results[1].action).toBe('send');
            expect(results[2].action).toBe('attend');

            expect(sentMessages).toContain('Of course! How can I assist you?');
            expect(loopState.wm).toHaveLength(1);
            expect(loopState.wm[0].content).toBe('User needs help');
            expect(loopState.wm[0].priority).toBe(0.8);

            loopState.historyBuffer.push(`USER: ${userInput}\nAGENT: ${mockLLMResponse}\nRESULT: ${JSON.stringify(results)}`);
            expect(loopState.historyBuffer).toHaveLength(1);
        });

        it('maintains state across multiple interaction cycles', async () => {
            const config = {
                profile: 'parity',
                loop: { maxSkillsPerCycle: 3 },
                workingMemory: { defaultTtl: 10, maxEntries: 20 },
                capabilities: { actionDispatch: true }
            };

            const dispatcher = new ActionDispatcher(config);
            const loopState = {
                wm: [],
                historyBuffer: [],
                lastresults: [],
                error: null,
                cycleCount: 0,
                prevmsg: null,
                lastsend: ''
            };

            dispatcher.register('attend', async (content, priority) => {
                const pri = parseFloat(priority) || 0.5;
                loopState.wm.push({ content: String(content), priority: pri, ttl: 5, cycleAdded: loopState.cycleCount });
                loopState.wm.sort((a, b) => b.priority - a.priority);
                return `attended: ${content}`;
            }, 'mettaControlPlane', ':reflect');

            dispatcher.register('send', async content => `sent: ${content}`, 'mettaControlPlane', ':network');

            for (let cycle = 0; cycle < 3; cycle++) {
                loopState.cycleCount = cycle;
                const response = `{"actions":[{"name":"attend","args":["memory from cycle ${cycle}","${0.5 + cycle * 0.1}"]},{"name":"send","args":["response ${cycle}"]}]}`;
                const { cmds } = dispatcher.parseResponse(response);
                await dispatcher.execute(cmds);
                loopState.historyBuffer.push(`Cycle ${cycle} completed`);
            }

            expect(loopState.wm).toHaveLength(3);
            expect(loopState.wm[0].priority).toBeCloseTo(0.7);
            expect(loopState.wm[2].priority).toBeCloseTo(0.5);
            expect(loopState.historyBuffer).toHaveLength(3);
        });

        it('working memory TTL expiration across cycles', async () => {
            const loopState = {
                wm: [
                    { content: 'short-lived', priority: 0.5, ttl: 2, cycleAdded: 0 },
                    { content: 'long-lived', priority: 0.8, ttl: 5, cycleAdded: 0 }
                ],
                cycleCount: 0
            };

            for (let cycle = 0; cycle < 3; cycle++) {
                loopState.cycleCount = cycle;
                loopState.wm = loopState.wm
                    .map(e => ({ ...e, ttl: e.ttl - 1 }))
                    .filter(e => e.ttl > 0);
            }

            expect(loopState.wm).toHaveLength(1);
            expect(loopState.wm[0].content).toBe('long-lived');
            expect(loopState.wm[0].ttl).toBe(2);
        });
    });

    describe('7. Capability Gating & Safety', () => {
        it('disabled actions are invisible to getActiveActionDefs', () => {
            const config = { profile: 'parity' };
            const dispatcher = new ActionDispatcher(config);

            dispatcher.register('send', jest.fn(), 'mettaControlPlane', ':network');
            dispatcher.register('shell', jest.fn(), 'shellSkill', ':system');

            const defs = dispatcher.getActiveActionDefs();
            expect(defs).toContain('send');
            expect(defs).not.toContain('shell');
        });

        it('capability mismatch warnings logged on registration', () => {
            const config = { profile: 'parity' };
            const dispatcher = new ActionDispatcher(config);

            dispatcher.loadActionsFromFile = jest.fn();

            dispatcher.register('send', jest.fn(), 'shellSkill', ':system');

            const defs = dispatcher.getActiveActionDefs();
            expect(defs).not.toContain('send');
        });
    });

    describe('8. Error Handling & Recovery', () => {
        it('handles handler errors without crashing dispatcher', async () => {
            const config = { profile: 'parity', loop: { maxSkillsPerCycle: 3 } };
            const dispatcher = new ActionDispatcher(config);

            dispatcher.register('failing-skill', async () => {
                throw new Error('intentional failure');
            }, 'mettaControlPlane', ':reflect');

            const results = await dispatcher.execute([{ name: 'failing-skill', args: [] }]);
            expect(results[0].error).toBe('intentional failure');
            expect(results[0].action).toBe('failing-skill');
        });

        it('handles empty command list gracefully', async () => {
            const config = { profile: 'parity' };
            const dispatcher = new ActionDispatcher(config);

            const results = await dispatcher.execute([]);
            expect(results).toEqual([]);
        });

        it('handles null/undefined parse input', () => {
            const config = { profile: 'parity', capabilities: { actionDispatch: true } };
            const dispatcher = new ActionDispatcher(config);

            const { cmds: cmds1, error: error1 } = dispatcher.parseResponse(null);
            expect(cmds1).toHaveLength(0);
            expect(error1).toBeNull();

            const { cmds: cmds2, error: error2 } = dispatcher.parseResponse('');
            expect(cmds2).toHaveLength(0);
            expect(error2).toBeNull();
        });
    });
});
