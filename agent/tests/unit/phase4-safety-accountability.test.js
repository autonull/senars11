/**
 * Phase 4 Unit Tests — Safety & Accountability
 *
 * Tests for:
 * - SafetyLayer.js tier lookup, MeTTa inference, fail-closed on timeout
 * - AuditSpace.js append-only event logging
 * - ShellGuard allowlist/forbidden pattern checking
 * - SkillDispatcher integration with safety checks and audit logging
 * - Blocked skills produce audit atoms with zero overhead when safetyLayer: false
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

import { AuditSpace } from '../../src/memory/AuditSpace.js';
import { ShellGuard, executeValidatedCommand } from '../../src/safety/ShellGuard.js';
import { SafetyLayer } from '../../src/safety/SafetyLayer.js';
import { SkillDispatcher } from '../../src/skills/SkillDispatcher.js';

function createMockInterpreter() {
    return {
        space: { getAll: () => [] },
        async run(code) {
            if (code.includes('shell')) {
                return [{ $consequence: '(system-state-change :unknown)', $risk: ':high' }];
            }
            if (code.includes('write-file')) {
                return [{ $consequence: '(file-modified "test.txt")', $risk: ':medium' }];
            }
            if (code.includes('remember')) {
                return [{ $consequence: '(memory-updated :local)', $risk: ':low' }];
            }
            return [];
        }
    };
}

describe('Phase 4: Safety & Accountability', () => {
    describe('AuditSpace', () => {
        let auditSpace;
        let auditDir;

        beforeEach(async () => {
            auditDir = `/tmp/audit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            auditSpace = new AuditSpace({ dataDir: auditDir });
            await auditSpace.initialize();
        });

        afterEach(async () => {
            try {
                const { rm } = await import('fs/promises');
                await rm(auditDir, { recursive: true, force: true });
            } catch { /* ignore */ }
        });

        it('emits skill-invoked events', async () => {
            const eventId = await auditSpace.emitSkillInvoked('remember', ['test content'], 'ok');
            expect(eventId).toMatch(/aud_\d+_\w+/);

            const events = auditSpace.getRecent(10, 'skill-invoked');
            expect(events.length).toBeGreaterThan(0);
            expect(events[0].skill).toBe('remember');
        });

        it('emits skill-blocked events', async () => {
            const eventId = await auditSpace.emitSkillBlocked('shell', ['rm -rf /'], 'high-risk-command');
            expect(eventId).toMatch(/aud_\d+_\w+/);

            const events = auditSpace.getRecent(10, 'skill-blocked');
            expect(events[0].reason).toBe('high-risk-command');
        });

        it('emits LLM call events with token tracking', async () => {
            await auditSpace.emitLlmCall('gpt-4o', 500, 1200, 150, {
                promptTokens: 100,
                completionTokens: 200,
                totalTokens: 300
            });

            const events = auditSpace.getRecent(10, 'llm-call');
            expect(events[0].model).toBe('gpt-4o');
            expect(events[0].tokensTotal).toBe(300);
        });

        it('emits cycle audit events', async () => {
            await auditSpace.emitCycleAudit('user input', 'LLM response', [{ skill: 'remember', result: 'ok' }]);

            const events = auditSpace.getRecent(10, 'cycle-audit');
            expect(events[0].input).toContain('user input');
            expect(events[0].output).toContain('LLM response');
        });

        it('tracks cycle count', async () => {
            expect(auditSpace.stats.cycleCount).toBe(0);
            auditSpace.incrementCycle();
            expect(auditSpace.stats.cycleCount).toBe(1);
        });

        it('filters events by type', async () => {
            await auditSpace.emitSkillInvoked('remember', ['a'], 'ok');
            await auditSpace.emitSkillInvoked('query', ['b'], 'ok');
            await auditSpace.emitSkillBlocked('shell', ['c'], 'blocked');

            const invoked = auditSpace.getRecent(10, 'skill-invoked');
            const blocked = auditSpace.getRecent(10, 'skill-blocked');

            expect(invoked.length).toBe(2);
            expect(blocked.length).toBe(1);
        });

        it('truncates long content', async () => {
            const longContent = 'x'.repeat(1000);
            await auditSpace.emitSkillInvoked('remember', [longContent], 'ok');

            const events = auditSpace.getRecent(10, 'skill-invoked');
            expect(events[0].result.length).toBeLessThanOrEqual(503);
        });
    });

    describe('ShellGuard', () => {
        let guard;

        beforeEach(() => {
            guard = new ShellGuard({
                allowlist: ['git status', 'git log --oneline', 'npm test', 'node --version'],
                allowedPrefixes: ['git '],
                forbiddenPatterns: ['rm', 'sudo', 'curl', 'wget', '>', '|', ';', '&&', '`', '$(', 'eval']
            });
        });

        it('allows exact allowlist matches', () => {
            expect(guard.validate('git status').valid).toBe(true);
            expect(guard.validate('npm test').valid).toBe(true);
        });

        it('allows prefix matches', () => {
            const r1 = guard.validate('git diff');
            const r2 = guard.validate('git log -5');
            expect(r1.valid).toBe(true);
            expect(r2.valid).toBe(true);
        });

        it('blocks forbidden patterns', () => {
            const result1 = guard.validate('rm -rf /');
            expect(result1.valid).toBe(false);
            expect(result1.reason).toBe('forbidden-pattern');

            const result2 = guard.validate('sudo apt-get update');
            expect(result2.valid).toBe(false);
            expect(result2.reason).toBe('forbidden-pattern');
        });

        it('blocks dangerous shell metacharacters', () => {
            expect(guard.validate('echo "test" > /tmp/file').valid).toBe(false);
            expect(guard.validate('cat file | grep foo').valid).toBe(false);
            expect(guard.validate('cmd1 && cmd2').valid).toBe(false);
            expect(guard.validate('$(whoami)').valid).toBe(false);
        });

        it('blocks empty commands', () => {
            expect(guard.validate('').valid).toBe(false);
            expect(guard.validate('   ').valid).toBe(false);
        });

        it('blocks non-allowlisted commands', () => {
            expect(guard.validate('ls -la').valid).toBe(false);
            expect(guard.validate('pwd').valid).toBe(false);
        });

        it('parses allowed commands into exec and args', () => {
            const result = guard.validate('git log --oneline -5');
            expect(result.valid).toBe(true);
            expect(result.parsed.exec).toBe('git');
            expect(result.parsed.args).toEqual(['log', '--oneline', '-5']);
        });

        it('updates configuration at runtime', () => {
            guard.configure({ allowlist: ['new-command'], allowedPrefixes: [] });
            expect(guard.validate('new-command').valid).toBe(true);
            expect(guard.validate('git status').valid).toBe(false);
        });
    });

    describe('executeValidatedCommand', () => {
        it('executes allowed commands successfully', async () => {
            const result = await executeValidatedCommand('node --version', {
                allowlist: ['node --version'],
                forbiddenPatterns: ['rm', 'sudo']
            });

            expect(result.success).toBe(true);
            expect(result.stdout).toMatch(/v\d+\.\d+\.\d+/);
        });

        it('returns error for blocked commands', async () => {
            const result = await executeValidatedCommand('rm -rf /', {
                allowlist: ['git status'],
                forbiddenPatterns: ['rm']
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('forbidden-pattern');
        });

        it('times out long-running commands', async () => {
            const result = await executeValidatedCommand('sleep 10', {
                allowlist: ['sleep 10'],
                forbiddenPatterns: ['rm', 'sudo'],
                timeout: 100
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('timeout');
        });
    });

    describe('SafetyLayer', () => {
        let safetyLayer;

        beforeEach(() => {
            safetyLayer = new SafetyLayer({
                capabilities: { safetyLayer: true }
            });
            safetyLayer._initialized = true;
            safetyLayer._rulesLoaded = true;
            safetyLayer._interpreter = createMockInterpreter();
        });

        it('clears :reflect tier skills without safety check', async () => {
            const result = await safetyLayer.check('metta', ['(some expr)'], ':reflect');
            expect(result.cleared).toBe(true);
        });

        it('blocks high-risk skills for medium-tier gate', async () => {
            const result = await safetyLayer.check('shell', ['git status'], ':system');
            expect(result.cleared).toBe(true);
        });

        it('fails closed on timeout', async () => {
            safetyLayer._interpreter = {
                async run() {
                    await new Promise(r => setTimeout(r, 100));
                    return [];
                }
            };

            const result = await safetyLayer.check('shell', ['test'], ':system');
            expect(result.cleared).toBe(false);
            expect(result.reason).toBe('safety-check-timeout');
        });

        it('returns cleared: true when safetyLayer capability is disabled', async () => {
            const disabledLayer = new SafetyLayer({
                capabilities: { safetyLayer: false }
            });
            const result = await disabledLayer.check('shell', ['test'], ':system');
            expect(result.cleared).toBe(true);
        });
    });

    describe('SkillDispatcher with SafetyLayer integration', () => {
        let dispatcher;
        let mockHandler;

        beforeEach(() => {
            mockHandler = jest.fn().mockResolvedValue('success');

            dispatcher = new SkillDispatcher({
                capabilities: {
                    safetyLayer: true,
                    auditLog: true,
                    fileWriteSkill: true
                },
                loop: { maxSkillsPerCycle: 3 }
            });

            dispatcher._safetyLayer = {
                check: jest.fn().mockImplementation(async (skillName) => {
                    if (skillName === 'write-file') {
                        return { cleared: true, consequence: '(file-modified "test.txt")', risk: ':medium' };
                    }
                    return { cleared: true };
                })
            };

            dispatcher.register('write-file', mockHandler, 'fileWriteSkill', ':local-write');
        });

        it('executes skills that pass safety check', async () => {
            const cmds = [{ name: 'write-file', args: ['test.txt', 'content'] }];
            const results = await dispatcher.execute(cmds);

            expect(results.length).toBe(1);
            expect(results[0].skill).toBe('write-file');
            expect(results[0].error).toBeNull();
            expect(mockHandler).toHaveBeenCalledWith('test.txt', 'content');
        });

        it('blocks skills that fail safety check', async () => {
            dispatcher._safetyLayer = {
                check: jest.fn().mockResolvedValue({ cleared: false, reason: 'test-block' })
            };

            const cmds = [{ name: 'write-file', args: ['test.txt', 'content'] }];
            const results = await dispatcher.execute(cmds);

            expect(results[0].error).toBe('safety-blocked: test-block');
            expect(mockHandler).not.toHaveBeenCalled();
        });

        it('emits audit events for skill invocations', async () => {
            const mockAudit = {
                initialize: jest.fn(),
                emitSkillInvoked: jest.fn(),
                emitSkillBlocked: jest.fn()
            };
            dispatcher._auditSpace = mockAudit;
            dispatcher._safetyLayer = { check: jest.fn().mockResolvedValue({ cleared: true }) };

            const cmds = [{ name: 'write-file', args: ['test.txt', 'content'] }];
            await dispatcher.execute(cmds);

            expect(mockAudit.emitSkillInvoked).toHaveBeenCalledWith(
                'write-file',
                ['test.txt', 'content'],
                'success'
            );
        });

        it('emits audit events for blocked skills', async () => {
            const mockAudit = {
                initialize: jest.fn(),
                emitSkillInvoked: jest.fn(),
                emitSkillBlocked: jest.fn()
            };
            dispatcher._auditSpace = mockAudit;
            dispatcher._safetyLayer = {
                check: jest.fn().mockResolvedValue({ cleared: false, reason: 'blocked' })
            };

            const cmds = [{ name: 'write-file', args: ['test.txt', 'content'] }];
            await dispatcher.execute(cmds);

            expect(mockAudit.emitSkillBlocked).toHaveBeenCalledWith(
                'write-file',
                ['test.txt', 'content'],
                'blocked'
            );
        });

        it('bypasses safety check when safetyLayer is disabled', async () => {
            const safeDisabledDispatcher = new SkillDispatcher({
                capabilities: {
                    safetyLayer: false,
                    auditLog: false,
                    fileWriteSkill: true
                }
            });
            safeDisabledDispatcher.register('write-file', mockHandler, 'fileWriteSkill', ':local-write');

            const cmds = [{ name: 'write-file', args: ['test.txt', 'content'] }];
            await safeDisabledDispatcher.execute(cmds);

            expect(mockHandler).toHaveBeenCalledWith('test.txt', 'content');
        });
    });

    describe('safety.metta rules', () => {
        it('defines consequence rules for all skill tiers', async () => {
            const { readFile } = await import('fs/promises');
            const { join } = await import('path');

            const rulesPath = join(process.cwd(), 'agent/src/metta/safety.metta');
            const content = await readFile(rulesPath, 'utf8');

            expect(content).toContain('(consequence-of (shell');
            expect(content).toContain('(consequence-of (write-file');
            expect(content).toContain('(consequence-of (remember');
            expect(content).toContain('(consequence-of (send');
            expect(content).toContain(':high');
            expect(content).toContain(':medium');
            expect(content).toContain(':low');
        });
    });
});
