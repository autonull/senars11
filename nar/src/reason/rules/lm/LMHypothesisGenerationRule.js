/**
 * @file src/reason/rules/lm/LMHypothesisGenerationRule.js
 * @description Hypothesis generation rule that uses an LM to create new hypotheses based on existing beliefs.
 */

import {LMRule} from '../../LMRule.js';
import {Punctuation, Task} from '../../../task/Task.js';
import {isBelief} from '../../RuleHelpers.js';

export const createHypothesisGenerationRule = (dependencies) => {
    const {lm, eventBus} = dependencies;
    return LMRule.create({
        id: 'hypothesis-generation',
        lm,
        eventBus,
        name: 'Hypothesis Generation Rule',
        description: 'Generates new, related hypotheses based on existing beliefs.',
        priority: 0.6,

        condition: (primaryPremise) => {
            if (!primaryPremise) return false;

            const priority = primaryPremise.budget?.priority ?? 0.5;
            const confidence = primaryPremise.truth?.c ?? 0;

            return isBelief(primaryPremise) && priority > 0.7 && confidence > 0.8;
        },

        prompt: (primaryPremise) => {
            const termStr = primaryPremise.term?.toString?.() ?? String(primaryPremise.term ?? 'unknown');
            return `Based on the following belief, what is a plausible and testable hypothesis?

Belief: "${termStr}"

The hypothesis should explore a potential cause, effect, or related phenomenon.
State the hypothesis as a clear, single statement.`;
        },

        process: (lmResponse) => {
            return lmResponse?.trim?.().replace(/^Hypothesis:\s*/i, '') ?? '';
        },

        generate: (processedOutput, primaryPremise, secondaryPremise, context) => {
            if (!processedOutput) return [];

            const termFactory = context?.termFactory ?? dependencies.termFactory;
            if (!termFactory) return [];

            const term = termFactory.atomic(processedOutput);

            return [new Task({
                term,
                punctuation: Punctuation.QUESTION,
                truth: null,
                budget: {priority: 0.7, durability: 0.5, quality: 0.5}
            })];
        },

        lm_options: {
            temperature: 0.8,
            max_tokens: 200,
        },
    });
};
