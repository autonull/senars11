/**
 * @file src/reason/rules/lm/LMVariableGroundingRule.js
 * @description Variable grounding rule that uses an LM to suggest possible values for variables in statements.
 * Based on the v9 implementation with enhancements for stream-based architecture.
 */

import {LMRule} from '../../LMRule.js';
import {Task} from '../../../task/Task.js';
import {parseSubGoals} from '../../RuleHelpers.js';

const hasVariable = (text) => {
    return /[\$\?]\w+/.test(text);
};

export const createVariableGroundingRule = (dependencies) => {
    const {lm} = dependencies;
    return LMRule.create({
        id: 'variable-grounding',
        lm,
        name: 'Variable Grounding Rule',
        description: 'Suggests possible concrete values for variables in tasks.',
        priority: 0.7,

        condition: (primaryPremise, secondaryPremise, context) => {
            if (!primaryPremise) return false;

            const termStr = primaryPremise.term?.toString?.() || String(primaryPremise.term || '');
            const priority = primaryPremise.budget?.priority ?? 0.5;

            return priority > 0.7 && hasVariable(termStr);
        },

        prompt: (primaryPremise, secondaryPremise, context) => {
            const termStr = primaryPremise.term?.toString?.() || String(primaryPremise.term || 'unknown');
            return `The following statement contains a variable.
Statement: "${termStr}"

Based on the context, what are 1-3 plausible, concrete values for the variable?
Provide only the values, one per line.`;
        },

        process: (lmResponse) => {
            if (!lmResponse) return [];
            return parseSubGoals(lmResponse);
        },

        generate: (processedOutput, primaryPremise, secondaryPremise, context) => {
            if (!processedOutput || processedOutput.length === 0) return [];

            const termFactory = context?.termFactory || dependencies.termFactory;
            if (!termFactory) return [];

            const originalTermStr = primaryPremise.term?.toString?.() || String(primaryPremise.term || '');

            return processedOutput.map(value => {
                // Replace the first variable found with the proposed value
                const newTermStr = originalTermStr.replace(/[\$\?]\w+/, value);
                const term = termFactory.atomic(newTermStr);

                return new Task({
                    term,
                    punctuation: primaryPremise.punctuation,
                    truth: {
                        frequency: 0.6,
                        confidence: (primaryPremise.truth?.c ?? 0.9) * 0.6
                    },
                    budget: {
                        priority: 0.8,
                        durability: 0.7
                    }
                });
            });
        },

        lm_options: {
            temperature: 0.7,
            max_tokens: 100,
        },
    });
};
