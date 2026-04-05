/**
 * HarnessOptimizer.js — Meta-harness self-improvement engine
 */

import {createSingleton, Logger} from '@senars/core';
import {execSync} from 'child_process';
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'fs';
import {dirname, join} from 'path';

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
            minScoreImprovement: this.minScoreImprovement
        });
    }

    shouldOptimize(cycleCount) {
        this.cycleCount = cycleCount;
        return ((cycleCount - this.lastEvalCycle) >= this.evalInterval) && this.config.capabilities?.harnessOptimization;
    }

    async runOptimizationCycle() {
        Logger.info('[HarnessOptimizer] Starting optimization cycle', {cycle: this.cycleCount});
        try {
            const failures = await this._sampleFailures();
            if (!failures.length) {
                return {applied: false, delta: null, reason: 'No failures to analyze'};
            }

            const currentPrompt = this._readCurrentPrompt();
            if (!currentPrompt) {
                return {applied: false, delta: null, reason: 'No current prompt found'};
            }

            const proposal = await this._proposeChange(failures, currentPrompt);
            if (!proposal?.diff) {
                return {applied: false, delta: null, reason: 'No change proposed'};
            }

            const candidatePrompt = this._applyDiff(currentPrompt, proposal.diff);
            this._writeCandidate(candidatePrompt);

            const replayResult = await this._replayTasks(failures, candidatePrompt);
            const delta = replayResult.scoreImprovement;

            if (delta >= this.minScoreImprovement) {
                await this._applyCandidate(replayResult.candidateScore);
                this.lastEvalCycle = this.cycleCount;
                return {applied: true, delta, reason: `Score improved by ${delta.toFixed(3)}`};
            }

            this._discardCandidate();
            return {
                applied: false,
                delta,
                reason: `Improvement ${delta.toFixed(3)} < threshold ${this.minScoreImprovement}`
            };
        } catch (error) {
            Logger.error('[HarnessOptimizer] Optimization cycle failed:', error);
            this._discardCandidate();
            return {applied: false, delta: null, reason: `Error: ${error.message}`};
        }
    }

    async _sampleFailures() {
        if (!this.auditSpace) {
            Logger.warn('[HarnessOptimizer] No audit space available');
            return [];
        }

        const failures = [];
        const failureTypes = ['parse-error', 'skill-error', 'safety-blocked'];

        try {
            const atoms = await this.auditSpace.queryByType('cycle-audit', 50);
            for (const atom of atoms) {
                const hasError = failureTypes.some(type => atom.error?.includes(type) || atom.result?.some(r => r.error));
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

            const traceFailures = await this._scanTraceFiles();
            failures.push(...traceFailures);

            return Array.from(new Map(failures.map(f => [f.cycleId, f])).values()).slice(0, this.replaySampleSize * 2);
        } catch (error) {
            Logger.error('[HarnessOptimizer] Failed to sample failures:', error);
            return [];
        }
    }

    async _scanTraceFiles() {
        const failures = [];
        const todayDir = join(this.tracesDir, new Date().toISOString().split('T')[0]);
        if (!existsSync(todayDir)) {
            return failures;
        }

        try {
            const files = readdirSync(todayDir).filter(f => f.endsWith('.jsonl')).slice(-20);
            for (const file of files) {
                for (const line of readFileSync(join(todayDir, file), 'utf-8').split('\n').filter(l => l.trim())) {
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
                    } catch { /* Skip malformed lines */
                    }
                }
            }
        } catch (error) {
            Logger.warn('[HarnessOptimizer] Failed to scan trace files:', error);
        }
        return failures;
    }

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
Return ONLY a unified diff (diff -u format) showing the change. Do not explain.`;

        try {
            const result = await this.modelRouter.invoke(prompt, {taskType: ':introspection'});
            const diffMatch = result.response.match(/```diff\n?([\s\S]*?)```/) || result.response.match(/---[\s\S]*?\+\+\+[\s\S]*?@@[\s\S]*?(\+[^\n]*\n)+/);
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

    _applyDiff(currentPrompt, diff) {
        try {
            const lines = currentPrompt.split('\n');
            const diffLines = diff.split('\n').filter(l => !l.startsWith('---') && !l.startsWith('+++') && !l.startsWith('@@'));
            const result = [...lines];
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
        } catch {
            Logger.warn('[HarnessOptimizer] Diff apply failed, using fallback');
            const fullMatch = diff.match(/```\w*\n([\s\S]*?)```/);
            return fullMatch ? fullMatch[1].trim() : currentPrompt;
        }
    }

    _writeCandidate(content) {
        const harnessDir = dirname(this.candidatePath);
        if (!existsSync(harnessDir)) {
            mkdirSync(harnessDir, {recursive: true});
        }
        writeFileSync(this.candidatePath, content);
        Logger.info('[HarnessOptimizer] Wrote candidate prompt');
    }

    async _replayTasks(failures, candidatePrompt) {
        const sample = failures.slice(0, this.replaySampleSize);
        let totalScore = 0, candidateScore = 0;

        for (const failure of sample) {
            totalScore += await this._scoreResponse(failure.context, failure.response, failure.error);
            try {
                const candidateResult = await this.modelRouter.invoke(failure.context, {taskType: ':reasoning'});
                const candidateError = candidateResult.response.includes('error') ? 'error' : null;
                candidateScore += await this._scoreResponse(failure.context, candidateResult.response, candidateError);
            } catch {
                candidateScore += 0;
            }
        }

        return {
            scoreImprovement: candidateScore / sample.length - totalScore / sample.length,
            candidateScore: candidateScore / sample.length,
            baselineScore: totalScore / sample.length
        };
    }

    async _scoreResponse(context, response, error) {
        if (error) {
            return 0.2;
        }
        if (!response || response.trim().length === 0) {
            return 0.1;
        }

        let score = 0.5;
        if (response.length > 50) {
            score += 0.1;
        }
        if (response.length > 200) {
            score += 0.1;
        }
        if (response.includes('- ') || response.includes('1. ')) {
            score += 0.1;
        }
        if (response.includes('```')) {
            score += 0.1;
        }
        if (response.toLowerCase().includes('cannot') || response.toLowerCase().includes('unable')) {
            score -= 0.1;
        }
        if (response.toLowerCase().includes('sorry')) {
            score -= 0.1;
        }

        return Math.max(0, Math.min(1, score));
    }

    async _applyCandidate(score) {
        try {
            const candidateContent = readFileSync(this.candidatePath, 'utf-8');
            writeFileSync(this.harnessPath, candidateContent);

            try {
                execSync(`git add ${this.harnessPath}`, {cwd: process.cwd(), stdio: 'pipe'});
                execSync(`git commit -m "harness-update: cycle ${this.cycleCount}, score=${score.toFixed(3)}"`, {
                    cwd: process.cwd(),
                    stdio: 'pipe'
                });
                Logger.info('[HarnessOptimizer] Committed harness update');
            } catch (gitError) {
                Logger.warn('[HarnessOptimizer] Git commit failed:', gitError.message);
            }

            if (this.auditSpace) {
                await this.auditSpace.emitHarnessModified(this.cycleCount, score);
            }
        } catch (error) {
            Logger.error('[HarnessOptimizer] Failed to apply candidate:', error);
            throw error;
        }
    }

    _discardCandidate() {
        try {
            if (existsSync(this.candidatePath)) {
                execSync(`rm ${this.candidatePath}`, {stdio: 'pipe'});
                Logger.info('[HarnessOptimizer] Discarded candidate prompt');
            }
        } catch (error) {
            Logger.warn('[HarnessOptimizer] Failed to discard candidate:', error);
        }
    }

    async generateDiff() {
        if (!existsSync(this.candidatePath)) {
            return null;
        }
        if (!existsSync(this.harnessPath)) {
            return readFileSync(this.candidatePath, 'utf-8');
        }
        try {
            return execSync(`git diff --no-index ${this.harnessPath} ${this.candidatePath}`, {
                cwd: process.cwd(),
                encoding: 'utf-8'
            });
        } catch (error) {
            return error.stdout || error.stderr;
        }
    }
}

export const getHarnessOptimizer = createSingleton((config, modelRouter, auditSpace) => new HarnessOptimizer(config, modelRouter, auditSpace));
export const resetHarnessOptimizer = () => getHarnessOptimizer.reset();
