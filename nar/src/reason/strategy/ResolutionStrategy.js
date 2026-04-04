/**
 * @file src/reason/strategy/ResolutionStrategy.js
 * @description Resolution-based reasoning strategy
 *
 * ResolutionStrategy: Goal-driven backward chaining for Prolog-like resolution, ex: question answering.
 * This strategy focuses on goal-driven reasoning, attempting to prove a Question
 * by finding rules and beliefs that satisfy it using backward chaining.
 *
 * NAL-6 Enhancement: Integrated Unifier for variable unification in query matching.
 */
import {Strategy} from '../Strategy.js';
import {Unifier} from '../../term/Unifier.js';
import {Logger} from '@senars/core';

export class ResolutionStrategy extends Strategy {
    /**
     * @param {object} config - Configuration options
     * @param {Function} config.goalMatcher - Function to match goals with beliefs
     * @param {number} config.maxResolutionDepth - Maximum resolution depth to prevent infinite loops
     * @param {TermFactory} config.termFactory - Term factory for creating terms in substitutions
     */
    constructor(config = {}) {
        super({
            goalMatcher: config.goalMatcher ?? null,
            maxResolutionDepth: config.maxResolutionDepth ?? 5,
            termFactory: config.termFactory ?? null,
            ...config
        });

        if (this.config.termFactory) {
            this.unifier = new Unifier(this.config.termFactory);
        }
    }

    /**
     * Generate premise pairs using goal-driven resolution
     * @param {AsyncGenerator<Task>} premiseStream - Stream of primary premises
     * @returns {AsyncGenerator<Array<Task>>} - Stream of premise pairs [primary, secondary]
     */
    async* generatePremisePairs(premiseStream) {
        for await (const primaryPremise of premiseStream) {
            try {
                if (this.isGoalOrQuestion(primaryPremise)) {
                    // Perform goal-driven reasoning to find supporting premises
                    const supportingPremises = await this.findSupportingPremisesForGoal(primaryPremise);

                    for (const supportingPremise of supportingPremises) {
                        yield [primaryPremise, supportingPremise];
                    }
                } else {
                    // For non-goal premises, use standard premise selection
                    const secondaryPremises = await this.selectSecondaryPremises(primaryPremise);

                    for (const secondaryPremise of secondaryPremises) {
                        yield [primaryPremise, secondaryPremise];
                    }
                }
            } catch (error) {
                Logger.error(`Error processing primary premise in ${this.constructor.name}:`, error);

            }
        }
    }

    /**
     * Check if a task is a goal or question
     * @param {Task} task - The task to check
     * @returns {boolean} - True if the task is a goal or question
     */
    isGoalOrQuestion(task) {
        if (!task?.sentence) {
            return false;
        }

        // Check if the task is marked as a goal or question in its punctuation
        // In NARS, goals are typically marked differently from beliefs
        const punctuation = task.sentence.punctuation;
        if (punctuation) {
            // Typically goals are marked with '!' and questions with '?'
            // Beliefs are marked with '.'
            return punctuation === '!' || punctuation === '?';
        }

        // Alternative check: check for specific goal-related properties
        if (task.type) {
            return task.type === 'Goal' || task.type === 'Question';
        }

        return false;
    }

    /**
     * Find supporting premises for a goal using backward chaining
     * @param {Task} goalPremise - The goal premise
     * @returns {Promise<Array<Task>>} - Array of supporting premises
     */
    async findSupportingPremisesForGoal(goalPremise) {
        const supportingTasks = [];

        // Get tasks from focus that could support this goal
        if (this.focus) {
            const focusTasks = this.focus.getTasks();
            const relevantTasks = this.findRelevantTasksForGoal(goalPremise, focusTasks);
            supportingTasks.push(...relevantTasks);
        } else if (this.memory?.getAllConcepts) {
            const memoryTasks = this.memory.getAllConcepts()
                .flatMap(concept => concept.getTasks ? concept.getTasks() : []);
            const relevantTasks = this.findRelevantTasksForGoal(goalPremise, memoryTasks);
            supportingTasks.push(...relevantTasks);
        }

        // Look for rules that could help achieve the goal
        const ruleBasedTasks = await this.findRuleBasedSupport(goalPremise);
        supportingTasks.push(...ruleBasedTasks);

        // Filter out duplicates and self-matching
        return [...new Set(supportingTasks.filter(task => task !== goalPremise))];
    }

    /**
     * Find tasks that are relevant for supporting a goal
     * @param {Task} goalPremise - The goal premise
     * @param {Array<Task>} tasks - Array of tasks to search
     * @returns {Array<Task>} - Array of relevant tasks
     */
    findRelevantTasksForGoal(goalPremise, tasks) {
        if (this.config.goalMatcher) {
            return tasks.filter(task =>
                task &&
                task !== goalPremise &&
                this.config.goalMatcher(goalPremise, task)
            );
        }

        // Use Unifier for pattern matching when available (NAL-6)
        if (this.unifier) {
            return tasks.filter(task => {
                if (!task || task === goalPremise || !task.term || !goalPremise.term) {
                    return false;
                }

                // Try to match the goal pattern against the task
                const matchResult = this.unifier.match(goalPremise.term, task.term);
                return matchResult.success;
            });
        }

        // Fallback: Default goal matching for non-NAL-6 systems
        return tasks.filter(task => {
            if (!task || task === goalPremise || !task.term || !goalPremise.term) {
                return false;
            }

            return this.checkPotentialGoalSupport(goalPremise, task) ||
                this.checkResolutionRelevance(goalPremise, task);
        });
    }

    /**
     * Check if a task could potentially support a goal
     * @param {Task} goalPremise - The goal premise
     * @param {Task} task - The task to check
     * @returns {boolean} - True if the task could support the goal
     */
    checkPotentialGoalSupport(goalPremise, task) {
        const goalTerm = goalPremise.term.toString();
        const taskTerm = task.term.toString();

        // Simple check: if task is an implication that can derive the goal
        if (taskTerm.includes('==>')) {
            // Check if the consequent of the implication matches the goal
            // This is a simplified check - in a real NAL system, this would be more sophisticated
            const parts = taskTerm.split('==>');
            if (parts.length === 2) {
                const consequent = parts[1].trim();
                return consequent === goalTerm;
            }
        }

        // Check for similarity between terms
        return taskTerm.includes(goalTerm) || goalTerm.includes(taskTerm);
    }

    /**
     * Check if a task is relevant for resolution
     * @param {Task} goalPremise - The goal premise
     * @param {Task} task - The task to check
     * @returns {boolean} - True if the task is resolution-relevant
     */
    checkResolutionRelevance(goalPremise, task) {
        // In backward chaining, we often look for tasks that share terms with the goal
        // This is a simplified check for demonstration
        const goalStr = goalPremise.term.toString();
        const taskStr = task.term.toString();

        // Look for common terms, variables, or structural elements
        return this.hasCommonElements(goalStr, taskStr);
    }

    /**
     * Check if two string representations have common elements
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {boolean} - True if they have common elements
     */
    hasCommonElements(str1, str2) {
        // Extract terms and check for commonality
        const terms1 = str1.split(/[(){}[\],&|!=><]/).filter(t => t.trim() !== '');
        const terms2 = str2.split(/[(){}[\],&|!=><]/).filter(t => t.trim() !== '');

        return terms1.some(t => t && terms2.includes(t));
    }

    /**
     * Find rule-based support for a goal
     * @param {Task} goalPremise - The goal premise
     * @returns {Promise<Array<Task>>} - Array of tasks that provide rule-based support
     */
    async findRuleBasedSupport(goalPremise) {
        // In a more complete implementation, this would search for applicable rules
        // that could help achieve the goal. For now, return empty array.
        return [];
    }

    /**
     * Select secondary premises (override parent method)
     * @param {Task} primaryPremise - The primary premise
     * @returns {Promise<Array<Task>>} - Array of secondary premises
     */
    async selectSecondaryPremises(primaryPremise) {
        return this.isGoalOrQuestion(primaryPremise)
            ? this.findSupportingPremisesForGoal(primaryPremise)
            : super.selectSecondaryPremises(primaryPremise);
    }

    /**
     * Get status information about the strategy
     * @returns {object} Status information
     */
    getStatus() {
        return {
            ...super.getStatus(),
            type: 'ResolutionStrategy',
            maxResolutionDepth: this.config.maxResolutionDepth
        };
    }
}
