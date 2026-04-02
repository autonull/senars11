/**
 * HarnessOptimizer.js — Meta-harness self-improvement engine
 *
 * Governed by: harnessOptimization capability flag
 *
 * Runs as a self-task on VirtualEmbodiment every harnessEvalInterval cycles (default 200).
 * Analyzes failure audit atoms, proposes ONE targeted change to memory/harness/prompt.metta,
 * replays on sampled recent tasks, applies if improved.
 *
 * Version history is git. memory/ is git-tracked. Every harness write commits with
 * message "harness-update: cycle {N}". Rollback: git revert or git checkout.
 */

import { Logger } from '@senars/core';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class HarnessOptimizer {
  constructor(config, modelRouter, auditSpace) {
    this.config = config;
    this.modelRouter = modelRouter;
    this.auditSpace = auditSpace;
    
    this.harnessPath = join(process.cwd(), 'memory', 'harness', 'prompt.metta');
    this.tracesDir = join(process.cwd(), 'memory', 'traces');
    this.candidatePath = join(process.cwd(), 'memory', 'harness', 'prompt.candidate.metta');
    
    this.cycleCount = 0;
    this.lastEvalCycle = 0;
    this.evalInterval = config.harness?.harnessEvalInterval ?? 200;
    this.minScoreImprovement = config.harness?.minScoreImprovement ?? 0.05;
    this.replaySampleSize = config.harness?.replayTaskSampleSize ?? 10;
    
    Logger.info('[HarnessOptimizer] Initialized', {
      evalInterval: this.evalInterval,
      minScoreImprovement: this.minScoreImprovement,
      replaySampleSize: this.replaySampleSize
    });
  }

  /**
   * Check if optimization cycle should run.
   * Call each cycle; returns true when it's time to optimize.
   */
  shouldOptimize(cycleCount) {
    this.cycleCount = cycleCount;
    const due = (cycleCount - this.lastEvalCycle) >= this.evalInterval;
    return due && this.config.capabilities?.harnessOptimization;
  }

  /**
   * Run the full optimization cycle.
   * Returns { applied: boolean, delta: number|null, reason: string }
   */
  async runOptimizationCycle() {
    Logger.info('[HarnessOptimizer] Starting optimization cycle', { cycle: this.cycleCount });

    try {
      // 1. Sample failure traces
      const failures = await this._sampleFailures();
      if (failures.length === 0) {
        return { applied: false, delta: null, reason: 'No failures to analyze' };
      }

      // 2. Read current harness
      const currentPrompt = this._readCurrentPrompt();
      if (!currentPrompt) {
        return { applied: false, delta: null, reason: 'No current prompt found' };
      }

      // 3. Invoke LLM with :introspection task type to propose diff
      const proposal = await this._proposeChange(failures, currentPrompt);
      if (!proposal || !proposal.diff) {
        return { applied: false, delta: null, reason: 'No change proposed' };
      }

      // 4. Apply diff to candidate file
      const candidatePrompt = this._applyDiff(currentPrompt, proposal.diff);
      this._writeCandidate(candidatePrompt);

      // 5. Replay sampled tasks with candidate harness
      const replayResult = await this._replayTasks(failures, candidatePrompt);

      // 6. Verify and apply if improved
      const delta = replayResult.scoreImprovement;
      if (delta >= this.minScoreImprovement) {
        await this._applyCandidate(replayResult.candidateScore);
        this.lastEvalCycle = this.cycleCount;
        return { applied: true, delta, reason: `Score improved by ${delta.toFixed(3)}` };
      } else {
        this._discardCandidate();
        return { applied: false, delta, reason: `Improvement ${delta.toFixed(3)} < threshold ${this.minScoreImprovement}` };
      }
    } catch (error) {
      Logger.error('[HarnessOptimizer] Optimization cycle failed:', error);
      this._discardCandidate();
      return { applied: false, delta: null, reason: `Error: ${error.message}` };
    }
  }

  /**
   * Sample recent failure audit atoms.
   * Returns array of { cycleId, context, response, error, skills }
   */
  async _sampleFailures() {
    if (!this.auditSpace) {
      Logger.warn('[HarnessOptimizer] No audit space available');
      return [];
    }

    // Query audit log for failure events
    const failureTypes = ['parse-error', 'skill-error', 'safety-blocked'];
    const failures = [];

    try {
      // Get recent audit atoms
      const atoms = await this.auditSpace.queryByType('cycle-audit', 50);
      
      for (const atom of atoms) {
        const hasError = failureTypes.some(type => 
          atom.error?.includes(type) || 
          atom.result?.some(r => r.error)
        );
        
        if (hasError) {
          failures.push({
            cycleId: atom.cycleId ?? atom.timestamp ?? Date.now(),
            context: atom.context ?? '',
            response: atom.response ?? '',
            error: atom.error ?? atom.result?.find(r => r.error)?.error ?? 'unknown',
            skills: atom.skills ?? []
          });
        }
      }

      // Also scan trace files from filesystem
      const traceFailures = await this._scanTraceFiles();
      failures.push(...traceFailures);

      // Deduplicate and limit
      const unique = Array.from(
        new Map(failures.map(f => [f.cycleId, f])).values()
      ).slice(0, this.replaySampleSize * 2);

      Logger.info('[HarnessOptimizer] Sampled failures', { count: unique.length });
      return unique;
    } catch (error) {
      Logger.error('[HarnessOptimizer] Failed to sample failures:', error);
      return [];
    }
  }

  /**
   * Scan trace files from memory/traces/YYYY-MM-DD/*.jsonl
   */
  async _scanTraceFiles() {
    const failures = [];
    const today = new Date().toISOString().split('T')[0];
    const todayDir = join(this.tracesDir, today);

    if (!existsSync(todayDir)) {
      return failures;
    }

    try {
      const files = readdirSync(todayDir).filter(f => f.endsWith('.jsonl'));
      for (const file of files.slice(-20)) { // Last 20 files
        const content = readFileSync(join(todayDir, file), 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        
        for (const line of lines) {
          try {
            const trace = JSON.parse(line);
            if (trace.error || trace.result?.some(r => r.error)) {
              failures.push({
                cycleId: trace.cycleId ?? trace.timestamp ?? Date.now(),
                context: trace.context ?? '',
                response: trace.response ?? '',
                error: trace.error ?? trace.result?.find(r => r.error)?.error ?? 'unknown',
                skills: trace.skills ?? []
              });
            }
          } catch (e) {
            // Skip malformed lines
          }
        }
      }
    } catch (error) {
      Logger.warn('[HarnessOptimizer] Failed to scan trace files:', error);
    }

    return failures;
  }

  /**
   * Read current prompt from memory/harness/prompt.metta
   */
  _readCurrentPrompt() {
    try {
      if (!existsSync(this.harnessPath)) {
        Logger.warn('[HarnessOptimizer] No prompt.metta found');
        return null;
      }
      return readFileSync(this.harnessPath, 'utf-8');
    } catch (error) {
      Logger.error('[HarnessOptimizer] Failed to read prompt:', error);
      return null;
    }
  }

  /**
   * Invoke LLM to propose a diff given failures and current prompt.
   */
  async _proposeChange(failures, currentPrompt) {
    const failureContext = failures.slice(0, this.replaySampleSize).map(f => 
      `Cycle ${f.cycleId}: ${f.error}\n  Context: ${f.context.slice(0, 200)}...\n`
    ).join('\n');

    const prompt = `You are optimizing the system prompt for an autonomous agent.

Current prompt:
${currentPrompt}

Recent failures:
${failureContext}

Propose ONE targeted change to fix these failures.
Return ONLY a unified diff (diff -u format) showing the change.
Do not explain. Do not add commentary. Just the diff.

Example format:
--- a/memory/harness/prompt.metta
+++ b/memory/harness/prompt.metta
@@ -10,7 +10,7 @@
-Old line here
+New line here
`;

    try {
      const result = await this.modelRouter.invoke(prompt, { taskType: ':introspection' });
      const diffMatch = result.response.match(/```diff\n?([\s\S]*?)```/) || 
                        result.response.match(/---[\s\S]*?\+\+\+[\s\S]*?@@[\s\S]*?(\+[^\n]*\n)+/);
      
      return {
        diff: diffMatch ? (diffMatch[1] || diffMatch[0]) : result.response,
        model: result.model,
        latency: result.latency
      };
    } catch (error) {
      Logger.error('[HarnessOptimizer] Failed to propose change:', error);
      return null;
    }
  }

  /**
   * Apply a unified diff to the current prompt.
   * Simple line-based patching; falls back to full replacement if diff fails.
   */
  _applyDiff(currentPrompt, diff) {
    try {
      const lines = currentPrompt.split('\n');
      const diffLines = diff.split('\n').filter(l => !l.startsWith('---') && !l.startsWith('+++') && !l.startsWith('@@'));
      
      let result = [...lines];
      let pendingDelete = -1;
      
      for (const line of diffLines) {
        if (line.startsWith('-')) {
          const content = line.slice(1);
          const idx = result.findIndex(l => l.trim() === content.trim());
          if (idx !== -1) {
            pendingDelete = idx;
            result.splice(idx, 1);
          }
        } else if (line.startsWith('+')) {
          const content = line.slice(1);
          if (pendingDelete !== -1) {
            result.splice(pendingDelete, 0, content);
            pendingDelete = -1;
          } else {
            result.push(content);
          }
        } else if (line.startsWith(' ')) {
          pendingDelete = -1;
        }
      }
      
      return result.join('\n');
    } catch (error) {
      Logger.warn('[HarnessOptimizer] Diff apply failed, using fallback');
      // Fallback: if diff contains full replacement, use it
      const fullMatch = diff.match(/```\w*\n([\s\S]*?)```/);
      return fullMatch ? fullMatch[1].trim() : currentPrompt;
    }
  }

  /**
   * Write candidate prompt to disk.
   */
  _writeCandidate(content) {
    const harnessDir = dirname(this.candidatePath);
    if (!existsSync(harnessDir)) {
      mkdirSync(harnessDir, { recursive: true });
    }
    writeFileSync(this.candidatePath, content);
    Logger.info('[HarnessOptimizer] Wrote candidate prompt');
  }

  /**
   * Replay sampled tasks with candidate prompt and score results.
   */
  async _replayTasks(failures, candidatePrompt) {
    const sample = failures.slice(0, this.replaySampleSize);
    let totalScore = 0;
    let candidateScore = 0;

    for (const failure of sample) {
      // Score with current prompt (baseline)
      const baselineScore = await this._scoreResponse(failure.context, failure.response, failure.error);
      totalScore += baselineScore;

      // Score with candidate prompt (simulate by re-invoking)
      try {
        const candidateResult = await this.modelRouter.invoke(failure.context, { taskType: ':reasoning' });
        const candidateError = candidateResult.response.includes('error') ? 'error' : null;
        candidateScore += await this._scoreResponse(failure.context, candidateResult.response, candidateError);
      } catch (e) {
        candidateScore += 0;
      }
    }

    const baselineAvg = totalScore / sample.length;
    const candidateAvg = candidateScore / sample.length;
    const delta = candidateAvg - baselineAvg;

    Logger.info('[HarnessOptimizer] Replay results', {
      baselineAvg,
      candidateAvg,
      delta,
      sampleSize: sample.length
    });

    return {
      scoreImprovement: delta,
      candidateScore: candidateAvg,
      baselineScore: baselineAvg
    };
  }

  /**
   * Score a response on a scale of 0-1.
   * Higher score = better response (no error, relevant, complete).
   */
  async _scoreResponse(context, response, error) {
    if (error) return 0.2;
    if (!response || response.trim().length === 0) return 0.1;
    
    // Simple heuristic scoring
    let score = 0.5;
    
    // Bonus for length (not too short)
    if (response.length > 50) score += 0.1;
    if (response.length > 200) score += 0.1;
    
    // Bonus for structure (lists, code blocks)
    if (response.includes('- ') || response.includes('1. ')) score += 0.1;
    if (response.includes('```')) score += 0.1;
    
    // Penalty for error indicators
    if (response.toLowerCase().includes('cannot') || response.toLowerCase().includes('unable')) score -= 0.1;
    if (response.toLowerCase().includes('sorry')) score -= 0.1;
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Apply candidate prompt (move candidate to current, git commit).
   */
  async _applyCandidate(score) {
    try {
      // Read candidate
      const candidateContent = readFileSync(this.candidatePath, 'utf-8');
      
      // Write to current
      writeFileSync(this.harnessPath, candidateContent);
      
      // Git commit
      try {
        execSync(`git add ${this.harnessPath}`, { cwd: process.cwd(), stdio: 'pipe' });
        execSync(`git commit -m "harness-update: cycle ${this.cycleCount}, score=${score.toFixed(3)}"`, { 
          cwd: process.cwd(), 
          stdio: 'pipe' 
        });
        Logger.info('[HarnessOptimizer] Committed harness update');
      } catch (gitError) {
        Logger.warn('[HarnessOptimizer] Git commit failed:', gitError.message);
      }
      
      // Emit audit event
      if (this.auditSpace) {
        await this.auditSpace.emitHarnessModified(this.cycleCount, score);
      }
    } catch (error) {
      Logger.error('[HarnessOptimizer] Failed to apply candidate:', error);
      throw error;
    }
  }

  /**
   * Discard candidate prompt.
   */
  _discardCandidate() {
    try {
      if (existsSync(this.candidatePath)) {
        execSync(`rm ${this.candidatePath}`, { stdio: 'pipe' });
        Logger.info('[HarnessOptimizer] Discarded candidate prompt');
      }
    } catch (error) {
      Logger.warn('[HarnessOptimizer] Failed to discard candidate:', error);
    }
  }

  /**
   * Generate a diff of proposed changes for verification.
   */
  async generateDiff() {
    if (!existsSync(this.candidatePath)) {
      return null;
    }
    
    if (!existsSync(this.harnessPath)) {
      return readFileSync(this.candidatePath, 'utf-8');
    }
    
    try {
      const diff = execSync(`git diff --no-index ${this.harnessPath} ${this.candidatePath}`, { 
        cwd: process.cwd(),
        encoding: 'utf-8'
      });
      return diff;
    } catch (error) {
      // git diff returns non-zero when files differ; that's expected
      return error.stdout || error.stderr;
    }
  }
}

// Singleton pattern for shared access
let _instance = null;

export function getHarnessOptimizer(config, modelRouter, auditSpace) {
  if (!_instance) {
    _instance = new HarnessOptimizer(config, modelRouter, auditSpace);
  }
  return _instance;
}

export function resetHarnessOptimizer() {
  _instance = null;
}
