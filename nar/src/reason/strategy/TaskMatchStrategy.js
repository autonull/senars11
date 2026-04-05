/**
 * @file TaskMatchStrategy.js
 * @description Premise formation strategy that pairs with existing tasks in focus/memory.
 *
 * This strategy implements the current SeNARS behavior of finding compatible
 * tasks from the focus set for syllogistic and other reasoning patterns.
 */

import {PremiseFormationStrategy} from './PremiseFormationStrategy.js';

/**
 * Strategy that finds existing tasks as premise candidates.
 *
 * Scores tasks based on syllogistic compatibility:
 * - High score for (A->M) + (M->B) patterns (shared middle term)
 * - Medium score for shared subject or predicate
 * - Low score for unrelated but valid terms
 */
export class TaskMatchStrategy extends PremiseFormationStrategy {
    /**
     * @param {object} config - Configuration options
     * @param {number} config.maxTasks - Maximum tasks to consider from focus
     * @param {number} config.highCompatibilityScore - Score for syllogistic patterns
     * @param {number} config.mediumCompatibilityScore - Score for shared terms
     * @param {number} config.lowCompatibilityScore - Score for unrelated terms
     */
    constructor(config = {}) {
        super(config);
        Object.assign(this, {
            maxTasks: config.maxTasks ?? 100,
            highCompatibilityScore: config.highCompatibilityScore ?? 0.95,
            mediumCompatibilityScore: config.mediumCompatibilityScore ?? 0.7,
            lowCompatibilityScore: config.lowCompatibilityScore ?? 0.3
        });
    }

    /**
     * Generate candidates from existing tasks in focus/memory.
     * @param {Task} primaryTask - The primary premise task
     * @param {object} context - Context with focus and memory
     * @yields {{term: Term, type: string, priority: number, sourceTask: Task}}
     */
    async* generateCandidates(primaryTask, context) {
        if (!this.enabled) {return;}

        const {focus, memory, availableTasks} = context;
        // Use provided tasks (sliced to maxTasks) or fetch from focus/memory
        const tasks = availableTasks
            ? availableTasks.slice(0, this.maxTasks)
            : this._getAvailableTasks(focus, memory);

        for (const task of tasks) {
            // Skip self-pairing
            if (task === primaryTask) {continue;}

            // Skip if same term
            if (this._termsEqual(task.term, primaryTask.term)) {continue;}

            const compatibility = this._scoreCompatibility(primaryTask, task);
            if (compatibility <= 0) {continue;}

            this._recordCandidate();
            yield {
                term: task.term,
                type: 'task-match',
                priority: compatibility * this.priority,
                sourceTask: task,
                compatibility
            };
        }
    }

    /**
     * Get available tasks from focus or memory.
     * @private
     */
    _getAvailableTasks(focus, memory) {
        if (focus?.getTasks) {
            return focus.getTasks(this.maxTasks);
        }

        if (memory?.getTasks) {
            return memory.getTasks(this.maxTasks);
        }

        return memory?.getAllConcepts?.()
            .flatMap(c => c.getAllTasks?.() || [])
            .slice(0, this.maxTasks)
            ?? [];
    }

    /**
     * Score the compatibility between two tasks for syllogistic reasoning.
     * @private
     */
    _scoreCompatibility(primary, secondary) {
        const {term: p} = primary;
        const {term: s} = secondary;

        if (!p?.isCompound || !s?.isCompound) {return this.lowCompatibilityScore;}

        const {subject: pSubj, predicate: pPred} = p;
        const {subject: sSubj, predicate: sPred} = s;

        if (!pSubj || !pPred || !sSubj || !sPred) {return this.lowCompatibilityScore;}

        // Syllogistic chains: (A→M) + (M→B) or reverse
        if (this._termsEqual(pPred, sSubj) || this._termsEqual(sPred, pSubj)) {
            return this.highCompatibilityScore;
        }

        // Shared subject: enables abduction
        if (this._termsEqual(pSubj, sSubj)) {return this.mediumCompatibilityScore;}

        // Shared predicate: enables induction  
        if (this._termsEqual(pPred, sPred)) {return this.mediumCompatibilityScore;}

        // Any term overlap
        return (this._termsEqual(pSubj, sPred) || this._termsEqual(pPred, sSubj))
            ? this.mediumCompatibilityScore * 0.8
            : this.lowCompatibilityScore;
    }

    /**
     * Check if two terms are equal.
     * @private
     */
    _termsEqual(t1, t2) {
        if (t1 === t2) {return true;}
        if (t1?.equals) {return t1.equals(t2);}
        return (t1?.name || t1?._name) === (t2?.name || t2?._name);
    }

    toString() {
        return `TaskMatchStrategy(priority=${this.priority}, maxTasks=${this.maxTasks})`;
    }
}
