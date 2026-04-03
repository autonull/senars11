/**
 * @file src/reason/rules/lm/LMMetaReasoningGuidanceRule.js
 * @description Meta-reasoning guidance rule that uses an LM to recommend reasoning strategies for complex problems.
 * Based on the v9 implementation with enhancements for stream-based architecture.
 */

import {LMRule} from '../../LMRule.js';
import {Punctuation, Task} from '../../../task/Task.js';
import {hasPattern, isGoal, isQuestion, KeywordPatterns} from '../../RuleHelpers.js';

export const createMetaReasoningGuidanceRule = (dependencies) => {
    const {lm} = dependencies;
    return LMRule.create({
        id: 'meta-reasoning-guidance',
        lm,
        name: 'Meta-Reasoning Guidance Rule',
        description: 'Provides reasoning strategy recommendations for complex problems.',
        priority: 0.85,

        condition: (primaryPremise, secondaryPremise, context) => {
            if (!primaryPremise) return false;

            const isGoalOrQuestion = isGoal(primaryPremise) || isQuestion(primaryPremise);
            const priority = primaryPremise.budget?.priority ?? 0.5;

            return isGoalOrQuestion && priority > 0.8 && hasPattern(primaryPremise, KeywordPatterns.complexity);
        },

        prompt: (primaryPremise, secondaryPremise, context) => {
            const termStr = primaryPremise.term?.toString?.() || String(primaryPremise.term || 'unknown');
            return `For the complex goal/question: "${termStr}", what is the most effective reasoning strategy?

Consider these options:
- **Decomposition**: Breaking it down into smaller sub-problems.
- **Analogical Reasoning**: Finding a similar, solved problem.
- **Causal Reasoning**: Analyzing cause-and-effect relationships.
- **Hypothesis Testing**: Formulating and testing hypotheses.

Recommend the best primary strategy and briefly explain why.`;
        },

        process: (lmResponse) => {
            return lmResponse?.trim() || '';
        },

        generate: (processedOutput, primaryPremise, secondaryPremise, context) => {
            if (!processedOutput) return [];

            const termFactory = context?.termFactory || dependencies.termFactory;
            if (!termFactory) return [];

            const newTermStr = `strategy_for_(${primaryPremise.term?.toString?.() || 'unknown'})`;
            const term = termFactory.atomic(newTermStr);

            const newTask = new Task({
                term,
                punctuation: Punctuation.BELIEF,
                truth: {frequency: 1.0, confidence: 0.9},
                budget: {
                    priority: 0.8,
                    durability: 0.7,
                    quality: 0.5
                },
                metadata: {
                    originalTerm: primaryPremise.term?.toString?.(),
                    strategy: processedOutput
                }
            });

            return [newTask];
        },

        lm_options: {
            temperature: 0.6,
            max_tokens: 400,
        },
    });
};
