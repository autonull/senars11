export class StrategyHelper {
    static candidateToTask(candidate, primaryPremise, context) {
        if (candidate.sourceTask) {
            return candidate.sourceTask;
        }

        if (candidate.term) {
            return this.findTaskForTerm(candidate.term, context);
        }

        return null;
    }

    static findTaskForTerm(term, context) {
        const {focus, memory} = context;

        if (focus) {
            const tasks = focus.getTasks();
            const found = tasks.find(t => t.term.equals(term));
            if (found) {
                return found;
            }
        }

        if (memory && memory.getConcept) {
            const concept = memory.getConcept(term);
            if (concept && concept.getHighestPriorityTask) {
                return concept.getHighestPriorityTask('BELIEF');
            }
        }

        return null;
    }
}
