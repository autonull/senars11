/**
 * @file src/reason/rules/LMGoalDecompositionRule.js
 * @description Goal decomposition rule that uses an LM to break down high-level goals into concrete sub-goals.
 */

import {LMRule} from '../../LMRule.js';
import {Punctuation, Task} from '../../../task/Task.js';
import {cleanText, isGoal, isValidSubGoal, parseSubGoals} from '../../RuleHelpers.js';

export const createGoalDecompositionRule = (dependencies, config = {}) => {
    const {lm, eventBus} = dependencies;
    const finalConfig = {
        id: 'goal-decomposition',
        name: 'Goal Decomposition Rule',
        description: 'Breaks down high-level goals into concrete, actionable sub-goals using an LM.',
        priority: 0.9,
        minSubGoals: 2,
        maxSubGoals: 5,
        minGoalLength: 5,
        maxGoalLength: 150,
        ...config,
        lm,
        eventBus
    };

    return LMRule.create({
        ...finalConfig,

        condition: (primaryPremise) => {
            if (!lm || !primaryPremise) return false;
            const priority = primaryPremise.budget?.priority ?? 0.5;
            return isGoal(primaryPremise) && priority > 0.7;
        },

        prompt: (primaryPremise) => {
            const termStr = primaryPremise.term?.toString?.() ?? String(primaryPremise.term ?? 'unknown');
            return `Decompose the following goal into ${finalConfig.minSubGoals} to ${finalConfig.maxSubGoals} smaller, actionable sub-goals.

Goal: "${termStr}"

Output: List of subgoals, one per line`;
        },

        process: (lmResponse) => {
            if (!lmResponse) return [];
            const subGoals = parseSubGoals(lmResponse);
            return subGoals
                .map(cleanText)
                .filter(goal => isValidSubGoal(goal, finalConfig.minGoalLength, finalConfig.maxGoalLength))
                .slice(0, finalConfig.maxSubGoals);
        },

        generate: (processedOutput, primaryPremise, secondaryPremise, context) => {
            if (!primaryPremise || !processedOutput?.length) {
                return [];
            }

            const termFactory = context?.termFactory ?? dependencies.termFactory;
            if (!termFactory) {
                console.warn('GoalDecomposition: No termFactory available');
                return [];
            }

            return processedOutput.map(subGoal => {
                const term = termFactory.atomic(subGoal);

                return new Task({
                    term,
                    punctuation: Punctuation.GOAL,
                    truth: {
                        frequency: primaryPremise.truth?.f ?? 0.9,
                        confidence: (primaryPremise.truth?.c ?? 0.9) * 0.9
                    },
                    budget: {
                        priority: Math.max(0.1, (primaryPremise.budget?.priority ?? 0.8) * 0.9),
                        durability: (primaryPremise.budget?.durability ?? 0.5) * 0.9,
                        quality: primaryPremise.budget?.quality ?? 0.5
                    }
                });
            });
        },

        lm_options: {
            temperature: 0.6,
            max_tokens: 500,
            stop: ['\n\n'],
            ...finalConfig.lm_options
        },
    });
};
