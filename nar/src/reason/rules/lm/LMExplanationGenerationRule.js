/**
 * @file src/reason/rules/lm/LMExplanationGenerationRule.js
 * @description Explanation generation rule that uses an LM to create natural language explanations for formal conclusions.
 * Based on the v9 implementation with enhancements for stream-based architecture.
 */

import {LMRule} from '../../LMRule.js';
import {Punctuation, Task} from '../../../task/Task.js';
import {isBelief, KeywordPatterns} from '../../RuleHelpers.js';

export const createExplanationGenerationRule = (dependencies) => {
    const {lm, eventBus} = dependencies;
    return LMRule.create({
        id: 'explanation-generation',
        lm,
        eventBus,
        name: 'Explanation Generation Rule',
        description: 'Generates natural language explanations for formal conclusions.',
        priority: 0.5,

        condition: (primaryPremise, secondaryPremise, context) => {
            if (!primaryPremise) return false;

            const belief = isBelief(primaryPremise);
            const priority = primaryPremise.budget?.priority ?? 0.5;
            const termStr = primaryPremise.term?.toString?.() ?? String(primaryPremise.term ?? '');

            return belief && priority > 0.6 && KeywordPatterns.complexRelation(termStr);
        },

        prompt: (primaryPremise, secondaryPremise, context) => {
            const termStr = primaryPremise.term?.toString?.() ?? String(primaryPremise.term ?? 'unknown');
            return `Translate the following formal logic statement into a clear, simple, natural language explanation.

Statement: "${termStr}"

Focus on conveying the core meaning and implication of the statement.`;
        },

        process: (lmResponse) => {
            return lmResponse?.trim() ?? '';
        },

        generate: (processedOutput, primaryPremise, secondaryPremise, context) => {
            if (!processedOutput) return [];

            const termFactory = context?.termFactory ?? dependencies.termFactory;
            if (!termFactory) return [];

            const originalTermStr = primaryPremise.term?.toString?.() ?? String(primaryPremise.term ?? '');
            const explanationTermStr = `explanation_for_(${originalTermStr})`;
            const term = termFactory.atomic(explanationTermStr);

            return [new Task({
                term,
                punctuation: Punctuation.BELIEF,
                truth: {
                    frequency: 1.0,
                    confidence: (primaryPremise.truth?.c ?? 0.9) * 0.9
                },
                budget: {
                    priority: 0.8,
                    durability: 0.5,
                    quality: 0.5
                },
                metadata: {
                    originalTerm: originalTermStr,
                    explanation: processedOutput
                }
            })];
        },

        lm_options: {
            temperature: 0.5,
            max_tokens: 300,
        },
    });
};
