/**
 * @file src/reason/rules/lm/LMBeliefRevisionRule.js
 * @description Belief revision rule that uses an LM to resolve contradictions and inconsistencies.
 * Based on the v9 implementation with enhancements for stream-based architecture.
 */

import {LMRule} from '../../LMRule.js';
import {Punctuation, Task} from '../../../task/Task.js';
import {hasPattern, isBelief, KeywordPatterns} from '../../RuleHelpers.js';

export const createBeliefRevisionRule = (dependencies) => {
    const {lm, eventBus} = dependencies;
    return LMRule.create({
        id: 'belief-revision',
        lm,
        eventBus,
        name: 'Belief Revision Rule',
        description: 'Helps resolve contradictions by suggesting belief revisions.',
        priority: 0.95,

        condition: (primaryPremise, secondaryPremise, context) => {
            if (!primaryPremise) return false;

            const belief = isBelief(primaryPremise);
            const priority = primaryPremise.budget?.priority ?? 0.5;

            return belief && priority > 0.8 && hasPattern(primaryPremise, KeywordPatterns.conflict);
        },

        prompt: (primaryPremise, secondaryPremise, context) => {
            const termStr = primaryPremise.term?.toString?.() ?? String(primaryPremise.term ?? 'unknown');
            return `The following belief appears to contain a contradiction or conflict:
"${termStr}"

Analyze this belief and the potential conflict. Propose a revised, more nuanced belief that resolves the inconsistency.
The revised belief should be a single, clear statement.`;
        },

        process: (lmResponse) => {
            return lmResponse?.trim() ?? '';
        },

        generate: (processedOutput, primaryPremise, secondaryPremise, context) => {
            if (!processedOutput) return [];

            const termFactory = context?.termFactory ?? dependencies.termFactory;
            if (!termFactory) return [];

            const term = termFactory.atomic(processedOutput);

            return [new Task({
                term,
                punctuation: Punctuation.BELIEF,
                truth: {
                    frequency: primaryPremise.truth?.f ?? 0.9,
                    confidence: (primaryPremise.truth?.c ?? 0.9) * 0.8,
                },
                budget: {
                    priority: 0.9,
                    durability: 0.8,
                    quality: 0.7
                }
            })];
        },

        lm_options: {
            temperature: 0.5,
            max_tokens: 400,
        },
    });
};
