/**
 * @file src/reason/LMRuleUtils.js
 * @description Utilities for working with LM rules, with patterns adapted from v9 implementation.
 */

import {LMRule} from '../LMRule.js';
import {Punctuation, Task} from '../../task/Task.js';
import {Logger} from '../../util/Logger.js';
import {cleanText, hasPattern, isValidSubGoal, KeywordPatterns, parseSubGoals} from '../RuleHelpers.js';

export class LMRuleUtils {
    static createPunctuationBasedRule(config) {
        const {id, lm, name, description, priority, punctuation, conditionFn, ...rest} = config;

        return LMRule.create({
            id,
            lm,
            name: name ?? `${punctuation}-based rule`,
            description: description ?? `Rule for ${punctuation} tasks`,
            priority: priority ?? 0.5,

            condition: (primaryPremise) => {
                if (conditionFn) {
                    return conditionFn(primaryPremise);
                }
                return primaryPremise?.punctuation === punctuation;
            },

            ...rest
        });
    }

    static createPriorityBasedRule(config) {
        const {id, lm, name, description, priority, minPriority = 0.5, ...rest} = config;

        return LMRule.create({
            id,
            lm,
            name: name ?? 'Priority-based rule',
            description: description ?? 'Rule that triggers based on task priority',
            priority: priority ?? 0.5,

            condition: (primaryPremise) => {
                const taskPriority = primaryPremise.budget?.priority ?? 0.5;
                return taskPriority >= minPriority;
            },

            ...rest
        });
    }

    static createPatternBasedRule(config) {
        const {id, lm, name, description, priority, patternType, minPriority = 0.5, ...rest} = config;

        const patterns = KeywordPatterns[patternType] ?? [];

        return LMRule.create({
            id,
            lm,
            name: name ?? `${patternType}-based rule`,
            description: description ?? `Rule for tasks matching ${patternType} patterns`,
            priority: priority ?? 0.6,

            condition: (primaryPremise) => {
                const taskPriority = primaryPremise.budget?.priority ?? 0.5;
                const termStr = primaryPremise.term?.toString?.() ?? String(primaryPremise.term ?? '');

                return taskPriority >= minPriority && hasPattern(primaryPremise, patterns);
            },

            ...rest
        });
    }

    static createPromptTemplate(templateType, options = {}) {
        const defaults = {
            minSubGoals: 2,
            maxSubGoals: 5
        };
        const opts = {...defaults, ...options};

        switch (templateType) {
            case 'goalDecomposition':
                return `Decompose the following goal into ${opts.minSubGoals} to ${opts.maxSubGoals} smaller, actionable sub-goals.

Goal: "{{taskTerm}}"

Output: List of subgoals, one per line`;

            case 'hypothesisGeneration':
                return `Based on the following belief, what is a plausible and testable hypothesis?

Belief: "{{taskTerm}}"

The hypothesis should explore a potential cause, effect, or related phenomenon.
State the hypothesis as a clear, single statement.`;

            case 'causalAnalysis':
                return `Analyze the causal relationships in the following statement:
"{{taskTerm}}"

Identify the cause and the effect. Express their relationship as a formal implication (e.g., "cause --> effect").`;

            case 'explanation':
                return `Translate the following formal logic statement into a clear, simple, natural language explanation.

Statement: "{{taskTerm}}"

Focus on conveying the core meaning and implication of the statement.`;

            default:
                return `Process the following task: "{{taskTerm}}"`;
        }
    }

    static createResponseProcessor(processorType, options = {}) {
        const defaults = {
            minLength: 1,
            maxLength: 200,
            maxItems: 10
        };
        const opts = {...defaults, ...options};

        switch (processorType) {
            case 'list':
                return (lmResponse) => {
                    if (!lmResponse) return [];
                    const items = parseSubGoals(lmResponse);
                    return items
                        .map(cleanText)
                        .filter(goal => isValidSubGoal(goal, opts.minLength, opts.maxLength))
                        .slice(0, opts.maxItems);
                };

            case 'single':
                return (lmResponse) => {
                    return lmResponse?.trim?.().replace(/^[^:]*:\s*/, '') ?? '';
                };

            case 'number':
                return (lmResponse) => {
                    const match = lmResponse?.match(/(\d\.\d+)/);
                    if (match) {
                        const num = parseFloat(match[1]);
                        if (!isNaN(num) && num >= 0 && num <= 1) {
                            return num;
                        }
                    }
                    return null;
                };

            default:
                return (lmResponse) => lmResponse ?? '';
        }
    }

    static createTaskGenerator(generatorType, options = {}) {
        switch (generatorType) {
            case 'multipleSubTasks':
                return (processedOutput, originalTask, secondaryTask, context) => {
                    if (!Array.isArray(processedOutput) || !processedOutput.length) return [];
                    const termFactory = context?.termFactory || options.termFactory;

                    if (!termFactory) {
                        Logger.warn('LMRuleUtils: termFactory not provided in context');
                        return [];
                    }

                    const confMult = options.confidenceMultiplier ?? 0.9;
                    const priorMult = options.priorityMultiplier ?? 0.9;
                    const durMult = options.durabilityMultiplier ?? 0.8;

                    return processedOutput.map(output => {
                        const term = termFactory.atomic(String(output));
                        const punctuation = originalTask.punctuation;
                        const truth = punctuation === Punctuation.QUESTION ? null : {
                            frequency: originalTask.truth?.f ?? 0.5,
                            confidence: (originalTask.truth?.c ?? 0.9) * confMult
                        };

                        return new Task({
                            term,
                            punctuation,
                            truth,
                            budget: {
                                priority: Math.max(0.1, (originalTask.priority ?? 0.5) * priorMult),
                                durability: (originalTask.durability ?? 0.5) * durMult,
                                quality: originalTask.budget?.quality ?? 0.5
                            }
                        });
                    });
                };

            case 'singleTask':
                return (processedOutput, originalTask, secondaryTask, context) => {
                    if (!processedOutput) return [];
                    const termFactory = context?.termFactory || options.termFactory;

                    if (!termFactory) {
                        Logger.warn('LMRuleUtils: termFactory not provided in context');
                        return [];
                    }

                    const punctuation = options.punctuation ?? originalTask.punctuation;
                    const freq = options.frequency ?? (originalTask.truth?.f ?? 0.5);
                    const conf = options.confidence ?? ((originalTask.truth?.c ?? 0.9) * (options.confidenceMultiplier ?? 1.0));
                    const prior = options.priority ?? originalTask.priority * (options.priorityMultiplier ?? 1.0);
                    const dur = options.durability ?? originalTask.durability;

                    const term = termFactory.atomic(String(processedOutput));
                    const truth = punctuation === Punctuation.QUESTION ? null : {frequency: freq, confidence: conf};

                    return [new Task({
                        term,
                        punctuation,
                        truth,
                        budget: {
                            priority: prior,
                            durability: dur,
                            quality: originalTask.budget?.quality ?? 0.5
                        }
                    })];
                };

            default:
                return (processedOutput, originalTask, secondaryTask, context) => {
                    if (!processedOutput) return [];
                    const termFactory = context?.termFactory || options.termFactory;
                    if (!termFactory) return [];
                    const term = termFactory.atomic(String(processedOutput));

                    return [new Task({
                        term,
                        punctuation: originalTask.punctuation,
                        truth: originalTask.truth,
                        budget: originalTask.budget
                    })];
                };
        }
    }
}
