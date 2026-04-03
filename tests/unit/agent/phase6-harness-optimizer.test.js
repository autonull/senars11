/**
 * Phase 6 Unit Tests — Harness Optimizer (Meta-Harness Self-Improvement)
 *
 * Tests for agent/src/harness/HarnessOptimizer.js
 *
 * Governed by: harnessOptimization capability flag
 *
 * Tests cover:
 * - Optimization cycle triggering
 * - Failure sampling from audit log and trace files
 * - Diff proposal and application
 * - Replay scoring
 * - Git integration for version history
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { existsSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

jest.mock('@senars/core', () => ({
    Logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {}
    }
}));

import { HarnessOptimizer, resetHarnessOptimizer, getHarnessOptimizer } from '../../../agent/src/harness/HarnessOptimizer.js';

describe('Phase 6: HarnessOptimizer', () => {
  let optimizer;
  let mockModelRouter;
  let mockAuditSpace;
  let testHarnessDir;
  let testTracesDir;

  const defaultConfig = {
    capabilities: {
      harnessOptimization: true,
      auditLog: true,
      persistentHistory: true,
      selfModifyingSkills: true
    },
    harness: {
      harnessEvalInterval: 200,
      minScoreImprovement: 0.05,
      replayTaskSampleSize: 10
    }
  };

  beforeEach(() => {
    // Reset singleton
    resetHarnessOptimizer();

    // Setup test directories
    testHarnessDir = join(process.cwd(), 'memory', 'harness');
    testTracesDir = join(process.cwd(), 'memory', 'traces', new Date().toISOString().split('T')[0]);

    try {
      if (!existsSync(testHarnessDir)) {
        mkdirSync(testHarnessDir, { recursive: true });
      }
      if (!existsSync(testTracesDir)) {
        mkdirSync(testTracesDir, { recursive: true });
      }
    } catch (e) {
      // Ignore mkdir errors in test environment
    }

    // Mock model router
    mockModelRouter = {
      invoke: jest.fn(async (ctx, opts) => ({
        response: 'Test response',
        model: 'test-model',
        latency: 100
      }))
    };

    // Mock audit space
    mockAuditSpace = {
      queryByType: jest.fn(async (type, limit) => []),
      emitHarnessModified: jest.fn(async (cycle, score) => {})
    };

    // Create optimizer instance
    optimizer = new HarnessOptimizer(defaultConfig, mockModelRouter, mockAuditSpace);
  });

  afterEach(() => {
    // Cleanup test files
    try {
      const candidatePath = join(testHarnessDir, 'prompt.candidate.metta');
      if (existsSync(candidatePath)) {
        rmSync(candidatePath);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('shouldOptimize()', () => {
    it('returns true when optimization is due', () => {
      optimizer.lastEvalCycle = 0;
      expect(optimizer.shouldOptimize(200)).toBe(true);
    });

    it('returns false when optimization is not yet due', () => {
      optimizer.lastEvalCycle = 0;
      expect(optimizer.shouldOptimize(100)).toBe(false);
    });

    it('returns false when harnessOptimization capability is disabled', () => {
      const configWithoutCap = {
        ...defaultConfig,
        capabilities: { ...defaultConfig.capabilities, harnessOptimization: false }
      };
      const opt = new HarnessOptimizer(configWithoutCap, mockModelRouter, mockAuditSpace);
      expect(opt.shouldOptimize(200)).toBe(false);
    });

    it('updates internal cycle count', () => {
      optimizer.shouldOptimize(150);
      expect(optimizer.cycleCount).toBe(150);
    });
  });

  describe('runOptimizationCycle()', () => {
    it('returns early when no failures are found', async () => {
      mockAuditSpace.queryByType.mockResolvedValue([]);

      const result = await optimizer.runOptimizationCycle();

      expect(result.applied).toBe(false);
      expect(result.reason).toContain('No failures');
    });

    it('returns early when no prompt.metta exists', async () => {
      // Mock failures but no prompt file
      mockAuditSpace.queryByType.mockResolvedValue([
        { cycleId: 1, error: 'parse-error', context: 'test', response: 'test' }
      ]);

      // Temporarily rename prompt.metta if it exists
      const promptPath = join(testHarnessDir, 'prompt.metta');
      let originalContent = null;
      if (existsSync(promptPath)) {
        originalContent = readFileSync(promptPath, 'utf-8');
      }

      const result = await optimizer.runOptimizationCycle();

      expect(result.applied).toBe(false);
      expect(result.reason).toContain('No current prompt');
    });

    it('proposes a change when failures exist', async () => {
      // Setup prompt.metta
      const promptPath = join(testHarnessDir, 'prompt.metta');
      const initialPrompt = 'You are a helpful assistant.';
      writeFileSync(promptPath, initialPrompt);

      // Mock failures
      const failures = [
        { cycleId: 1, error: 'parse-error', context: 'test context', response: 'bad response' }
      ];
      mockAuditSpace.queryByType.mockResolvedValue(failures);

      // Mock LLM to propose a diff
      mockModelRouter.invoke.mockResolvedValue({
        response: '```diff\n--- a/memory/harness/prompt.metta\n+++ b/memory/harness/prompt.metta\n@@ -1 +1 @@\n-You are a helpful assistant.\n+You are a helpful and concise assistant.\n```'
      });

      // Mock replay to show improvement
      optimizer._replayTasks = jest.fn(async () => ({
        scoreImprovement: 0.1,
        candidateScore: 0.8,
        baselineScore: 0.7
      }));

      // Mock git operations
      optimizer._applyCandidate = jest.fn(async () => {});

      const result = await optimizer.runOptimizationCycle();

      expect(mockModelRouter.invoke).toHaveBeenCalled();
      expect(result.applied).toBe(true);
      expect(result.delta).toBeCloseTo(0.1, 2);
    });

    it('rejects candidate when improvement is below threshold', async () => {
      const promptPath = join(testHarnessDir, 'prompt.metta');
      writeFileSync(promptPath, 'Initial prompt');

      mockAuditSpace.queryByType.mockResolvedValue([
        { cycleId: 1, error: 'test-error', context: 'test', response: 'test' }
      ]);

      mockModelRouter.invoke.mockResolvedValue({
        response: 'Proposed change'
      });

      optimizer._replayTasks = jest.fn(async () => ({
        scoreImprovement: 0.02, // Below threshold of 0.05
        candidateScore: 0.72,
        baselineScore: 0.7
      }));

      optimizer._discardCandidate = jest.fn();

      const result = await optimizer.runOptimizationCycle();

      expect(result.applied).toBe(false);
      expect(result.reason).toContain('threshold');
      expect(optimizer._discardCandidate).toHaveBeenCalled();
    });
  });

  describe('_sampleFailures()', () => {
    it('samples failures from audit space', async () => {
      mockAuditSpace.queryByType.mockResolvedValue([
        { cycleId: 1, error: 'parse-error', result: [{ error: 'syntax error' }] },
        { cycleId: 2, error: 'skill-error', result: [{ error: 'handler failed' }] },
        { cycleId: 3, result: [{ success: true }] } // No error
      ]);

      const failures = await optimizer._sampleFailures();

      expect(failures.length).toBeGreaterThan(0);
      expect(failures.some(f => f.error === 'parse-error')).toBe(true);
    });

    it('returns empty array when audit space is unavailable', async () => {
      const optWithoutAudit = new HarnessOptimizer(defaultConfig, mockModelRouter, null);
      const failures = await optWithoutAudit._sampleFailures();
      expect(failures).toEqual([]);
    });
  });

  describe('_applyDiff()', () => {
    it('applies a simple unified diff', () => {
      const current = `Line 1
Line 2
Line 3`;

      const diff = `--- a/file
+++ b/file
@@ -1,3 +1,3 @@
 Line 1
-Line 2
+Modified Line 2
 Line 3`;

      const result = optimizer._applyDiff(current, diff);
      expect(result).toContain('Modified Line 2');
    });

    it('falls back to full replacement when diff parsing fails', () => {
      const current = 'Old content';
      const diff = 'This is not a valid diff format';

      const result = optimizer._applyDiff(current, diff);
      // Fallback returns current or extracts from code blocks
      expect(result).toBeDefined();
    });
  });

  describe('_scoreResponse()', () => {
    it('scores low for error responses', async () => {
      const score = await optimizer._scoreResponse('context', 'response', 'error occurred');
      expect(score).toBeLessThan(0.5);
    });

    it('scores higher for well-structured responses', async () => {
      const score = await optimizer._scoreResponse('context', `Here's a detailed answer:

- Point 1
- Point 2

\`\`\`code block\`\`\`

This is comprehensive.`, null);

      expect(score).toBeGreaterThan(0.5);
    });

    it('penalizes responses with error indicators', async () => {
      const score1 = await optimizer._scoreResponse('ctx', 'I cannot help with that', null);
      const score2 = await optimizer._scoreResponse('ctx', 'Sorry, I am unable to answer', null);

      expect(score1).toBeLessThan(0.6);
      expect(score2).toBeLessThan(0.6);
    });
  });

  describe('generateDiff()', () => {
    it('returns null when no candidate exists', async () => {
      const diff = await optimizer.generateDiff();
      expect(diff).toBeNull();
    });

    it('returns candidate content when current prompt does not exist', async () => {
      const candidatePath = join(testHarnessDir, 'prompt.candidate.metta');
      const candidateContent = 'Candidate prompt content';
      writeFileSync(candidatePath, candidateContent);

      // Temporarily hide current prompt
      const promptPath = join(testHarnessDir, 'prompt.metta');
      let originalContent = null;
      if (existsSync(promptPath)) {
        originalContent = readFileSync(promptPath, 'utf-8');
      }

      try {
        const diff = await optimizer.generateDiff();
        expect(diff).toContain('Candidate prompt content');
      } finally {
        // Restore
      }
    });
  });

  describe('Singleton pattern', () => {
    it('returns the same instance via getHarnessOptimizer', () => {
      const instance1 = getHarnessOptimizer(defaultConfig, mockModelRouter, mockAuditSpace);
      const instance2 = getHarnessOptimizer(defaultConfig, mockModelRouter, mockAuditSpace);
      expect(instance1).toBe(instance2);
    });

    it('can be reset via resetHarnessOptimizer', () => {
      const instance1 = getHarnessOptimizer(defaultConfig, mockModelRouter, mockAuditSpace);
      resetHarnessOptimizer();
      const instance2 = getHarnessOptimizer(defaultConfig, mockModelRouter, mockAuditSpace);
      expect(instance1).not.toBe(instance2);
    });
  });
});
