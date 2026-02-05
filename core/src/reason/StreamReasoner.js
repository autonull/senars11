import {BaseComponent} from '../util/BaseComponent.js';
import {IntrospectionEvents} from '../util/IntrospectionEvents.js';

export class StreamReasoner extends BaseComponent {
    constructor(memory, ruleProcessor, config = {}, eventBus = null) {
        super(config, 'StreamReasoner', eventBus);
        this.memory = memory;
        this.ruleProcessor = ruleProcessor;
        this.cycleCount = 0;
    }

    async _start() {
        this.logger.info('StreamReasoner started');
    }

    async _stop() {
        this.logger.info('StreamReasoner stopped');
    }

    step() {
        if (!this.isRunning) return;

        this.cycleCount++;
        // 1. Select tasks/concepts from memory (Focus)
        const concepts = this.memory.getMostActiveConcepts(1);
        if (concepts.length === 0) {
            this.logDebug('No active concepts');
            return;
        }

        const concept = concepts[0];
        // concept.getMostUrgentTask() does not exist in Concept.js, Concept has getHighestPriorityTask(type)
        // Assuming we want highest priority task of any type or prioritizing Goals?
        // Let's use getHighestPriorityTask('GOAL') or 'BELIEF' as fallback
        const task = concept.getHighestPriorityTask('GOAL') || concept.getHighestPriorityTask('QUESTION') || concept.getHighestPriorityTask('BELIEF');
        if (!task) return;

        // 2. Select beliefs (premises)
        const beliefs = concept.getTasksByType('BELIEF');


        // 3. Feed to RuleProcessor
        for (const belief of beliefs) {
            const candidates = this.ruleProcessor.ruleExecutor.getCandidateRules(task, belief);

            for (const rule of candidates) {
                const derivations = this.ruleProcessor.processSyncRule(rule, task, belief);
                for (const derived of derivations) {
                    this.memory.addTask(derived);
                    this._emitIntrospectionEvent(IntrospectionEvents.REASONING_DERIVATION, () => ({task: derived.serialize()}));
                    // Emit legacy event for tests
                    if (this.eventBus) {
                        this.eventBus.emit('reasoning.derivation', derived);
                        // Also emit task.input as some tests expect derived tasks to appear there
                        this.eventBus.emit('task.input', {task: derived, source: 'reasoning'});
                    }
                }
            }
        }
    }

    reset() {
        this.cycleCount = 0;
        if (this.isRunning) {
            this.stop();
        }
    }
}
