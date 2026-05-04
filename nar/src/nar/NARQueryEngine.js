import {Truth} from '../Truth.js';
import {Stamp} from '../Stamp.js';
import {Task} from '../task/Task.js';

export class NARQueryEngine {
    #nar;

    constructor(nar) {
        this.#nar = nar;
    }

    query(queryTerm) {
        return this.#nar._memory.getConcept(queryTerm)?.getTasksByType('BELIEF') ?? [];
    }

    getBeliefs(queryTerm = null) {
        return queryTerm
            ? this.query(queryTerm)
            : this.#nar._memory.getAllConcepts().flatMap(c => c.getTasksByType('BELIEF'));
    }

    getGoals() {
        return this.#nar._taskManager.findTasksByType('GOAL');
    }

    getQuestions() {
        return this.#nar._taskManager.findTasksByType('QUESTION');
    }

    async reconcile(beliefData) {
        if (!beliefData?.term || !beliefData?.truth) {
            return false;
        }

        try {
            const term = this.#nar._parser && typeof beliefData.term === 'string'
                ? this.#resolveTerm(beliefData.term)
                : this.#nar._termFactory.create(beliefData.term);

            const finalTruth = this.#calculateReconciledTruth(term, beliefData.truth);
            const task = this.#createReconciliationTask(term, finalTruth);

            return await this.#nar._processNewTask(task, 'reconcile', beliefData.term, null, {traceId: 'gossip'});
        } catch (error) {
            this.#nar.logError('Reconciliation failed:', error);
            return false;
        }
    }

    async ask(task) {
        if (!this.#nar._streamReasoner) {
            throw new Error('Stream reasoner is not initialized.');
        }
        return this.#nar._streamReasoner.strategy.ask(task);
    }

    #resolveTerm(termInput) {
        if (this.#nar._parser && typeof termInput === 'string') {
            const parsed = this.#nar._parser.parse(termInput.endsWith('.') ? termInput : `${termInput}.`);
            return parsed.term;
        }
        return this.#nar._termFactory.create(termInput);
    }

    #calculateReconciledTruth(term, incomingTruthData) {
        const incomingTruth = new Truth(incomingTruthData.frequency, incomingTruthData.confidence);
        const concept = this.#nar._memory.getConcept(term);

        if (concept) {
            const beliefs = concept.getTasksByType('BELIEF');
            if (beliefs.length > 0) {
                const revised = Truth.revision(beliefs[0].truth, incomingTruth);
                if (revised) {
                    return revised;
                }
            }
        }
        return incomingTruth;
    }

    #createReconciliationTask(term, truth) {
        const expectation = Truth.expectation(truth);
        return new Task({
            term,
            truth,
            stamp: Stamp.createInput(),
            punctuation: '.',
            budget: {
                priority: Math.max(0.1, expectation),
                durability: 0.9,
                quality: truth.confidence
            }
        });
    }
}
