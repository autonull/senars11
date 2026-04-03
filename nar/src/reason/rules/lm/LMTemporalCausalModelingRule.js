/**
 * @file src/reason/rules/lm/LMTemporalCausalModelingRule.js
 * @description Temporal and causal modeling rule that uses an LM to infer time order and causal relationships.
 */

import {LMRule} from '../../LMRule.js';
import {Punctuation, Task} from '../../../task/Task.js';
import {hasPattern, isBelief, KeywordPatterns} from '../../RuleHelpers.js';

export const createTemporalCausalModelingRule = (dependencies) => {
    const {lm} = dependencies;
    return LMRule.create({
        id: 'temporal-causal-modeling',
        lm,
        name: 'Temporal/Causal Modeling Rule',
        description: 'Infers time order and causal relationships from text.',
        priority: 0.75,

        condition: (primaryPremise) => {
            if (!primaryPremise) return false;

            const priority = primaryPremise.budget?.priority ?? 0.5;

            return isBelief(primaryPremise) && priority > 0.7 && hasPattern(primaryPremise, KeywordPatterns.temporalCausal);
        },

        prompt: (primaryPremise) => {
            const termStr = primaryPremise.term?.toString?.() ?? String(primaryPremise.term ?? 'unknown');
            return `Analyze the temporal and causal relationships in the following statement:
"${termStr}"

Identify the cause and the effect. Express their relationship as a formal implication (e.g., "cause --> effect").
If there is a time sequence, describe it.`;
        },

        process: (lmResponse) => {
            const match = lmResponse?.match(/(\w+\s*-->\s*\w+)/);
            return match ? match[1] : (lmResponse?.trim() ?? '');
        },

        generate: (processedOutput, primaryPremise, secondaryPremise, context) => {
            if (!processedOutput) return [];

            const termFactory = context?.termFactory || dependencies.termFactory;
            if (!termFactory) return [];

            const term = termFactory.atomic(processedOutput);

            return [new Task({
                term,
                punctuation: Punctuation.BELIEF,
                truth: {
                    frequency: 0.9,
                    confidence: (primaryPremise.truth?.c ?? 0.9) * 0.9
                }
            })];
        },

        lm_options: {
            temperature: 0.4,
            max_tokens: 300,
        },
    });
};
