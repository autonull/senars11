/**
 * @file src/reason/rules/lm/LMSchemaInductionRule.js
 * @description Schema induction rule that uses an LM to extract action schemas from narrative or procedural text.
 * Based on the v9 implementation with enhancements for stream-based architecture.
 */

import {LMRule} from '../../LMRule.js';
import {Punctuation, Task} from '../../../task/Task.js';
import {hasPattern, isBelief, KeywordPatterns} from '../../RuleHelpers.js';

export const createSchemaInductionRule = (dependencies) => {
    const {lm} = dependencies;
    return LMRule.create({
        id: 'schema-induction',
        lm,
        name: 'Schema Induction Rule',
        description: 'Extracts action schemas from narrative or instruction sequences.',
        priority: 0.65,

        condition: (primaryPremise, secondaryPremise, context) => {
            if (!primaryPremise) return false;

            const belief = isBelief(primaryPremise);
            const priority = primaryPremise.budget?.priority ?? 0.5;

            return belief && priority > 0.6 && hasPattern(primaryPremise, KeywordPatterns.narrative);
        },

        prompt: (primaryPremise, secondaryPremise, context) => {
            const termStr = primaryPremise.term?.toString?.() || String(primaryPremise.term || 'unknown');
            return `From the following text, extract a generalizable procedure or schema.

Text: "${termStr}"

Describe the schema as a sequence of conditional steps (e.g., "IF condition THEN action").
The schema should be abstract enough to apply to similar situations.`;
        },

        process: (lmResponse) => {
            return lmResponse?.trim() || '';
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
            temperature: 0.5,
            max_tokens: 500,
        },
    });
};
