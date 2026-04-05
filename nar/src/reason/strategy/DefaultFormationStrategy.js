import {PremiseFormationStrategy} from './PremiseFormationStrategy.js';
import {collectTasksFromAllConcepts} from '../../memory/MemoryUtils.js';
import {Statistics} from '@senars/core/src/util/Statistics.js';

export class DefaultFormationStrategy extends PremiseFormationStrategy {
    constructor(config = {}) {
        super(config);
        this.maxSecondaryPremises = config.maxSecondaryPremises || 20;
    }

    async* generateCandidates(primaryPremise, context) {
        // Get tasks from focus or memory
        const allTasks = this._getAvailableTasks(context);

        // Filter tasks
        const validSecondaryTasks = allTasks.filter(task =>
            task &&
            task !== primaryPremise &&
            task.term &&
            !task.term.equals(primaryPremise.term)
        );

        // Prioritize
        const prioritized = this._prioritizeCompatibleTasks(primaryPremise, validSecondaryTasks);

        for (const task of prioritized) {
            yield {
                sourceTask: task,
                priority: this._calculatePriority(task, primaryPremise),
                term: task.term
            };
        }
    }

    _getAvailableTasks(context) {
        if (context.focus) {
            return context.focus.getTasks(1000);
        } else if (context.memory && typeof context.memory.getTasks === 'function') {
            return context.memory.getTasks(1000);
        } else if (context.memory && typeof context.memory.getAllConcepts === 'function') {
            return context.memory.getAllConcepts()
                .flatMap(concept => concept.getAllTasks ? concept.getAllTasks() : [])
                .slice(0, 1000);
        }
        return [];
    }

    _prioritizeCompatibleTasks(primaryPremise, secondaryTasks) {
        if (!primaryPremise?.term?.components || !Array.isArray(secondaryTasks)) {
            return secondaryTasks;
        }

        const primaryComponents = primaryPremise.term.components;
        if (primaryComponents?.length !== 2) {
            return secondaryTasks;
        }

        const [primarySubject, primaryObject] = primaryComponents;

        const {highlyCompatible, compatible, lessCompatible} = secondaryTasks.reduce(
            (acc, task) => {
                const category = this._categorizeTaskCompatibility(task, primarySubject, primaryObject);
                acc[category].push(task);
                return acc;
            },
            {highlyCompatible: [], compatible: [], lessCompatible: []}
        );

        return [...highlyCompatible, ...compatible, ...lessCompatible];
    }

    _categorizeTaskCompatibility(task, primarySubject, primaryObject) {
        if (!task?.term?.components || task.term.components.length !== 2) {
            return 'lessCompatible';
        }

        const [secondarySubject, secondaryObject] = task.term.components;

        const pattern1 = this._termsEqual(primaryObject, secondarySubject);
        const pattern2 = this._termsEqual(primarySubject, secondaryObject);

        if (pattern1 || pattern2) {
            return 'highlyCompatible';
        }

        const hasCommonTerms = this._termsEqual(primarySubject, secondarySubject) ||
            this._termsEqual(primarySubject, secondaryObject) ||
            this._termsEqual(primaryObject, secondarySubject) ||
            this._termsEqual(primaryObject, secondaryObject);

        return hasCommonTerms ? 'compatible' : 'lessCompatible';
    }

    _termsEqual(t1, t2) {
        if (!t1 || !t2) {return false;}
        if (typeof t1.equals === 'function') {return t1.equals(t2);}
        return t1.toString() === t2.toString();
    }

    _calculatePriority(task, primaryPremise) {
        // Simple priority calculation based on task budget
        return task.budget ? task.budget.priority : 0.5;
    }
}
