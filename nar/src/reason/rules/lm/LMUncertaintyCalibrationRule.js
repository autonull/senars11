/**
 * @file src/reason/rules/lm/LMUncertaintyCalibrationRule.js
 * @description Uncertainty calibration rule that uses an LM to map qualitative uncertainty to quantitative truth values.
 * Based on the v9 implementation with enhancements for stream-based architecture.
 */

import {LMRule} from '../../LMRule.js';
import {Task} from '../../../task/Task.js';
import {hasPattern, isBelief, KeywordPatterns} from '../../RuleHelpers.js';

export const createUncertaintyCalibrationRule = (dependencies) => {
    const {lm} = dependencies;
    return LMRule.create({
        id: 'uncertainty-calibration',
        lm,
        name: 'Uncertainty Calibration Rule',
        description: 'Maps qualitative uncertainty expressions to NARS truth values.',
        priority: 0.7,

        condition: (primaryPremise, secondaryPremise, context) => {
            if (!primaryPremise) return false;

            const belief = isBelief(primaryPremise);
            const priority = primaryPremise.budget?.priority ?? 0.5;
            const confidence = primaryPremise.truth?.c ?? 0.9;

            return belief && priority > 0.6 && confidence >= 0.9 && hasPattern(primaryPremise, KeywordPatterns.uncertainty);
        },

        prompt: (primaryPremise, secondaryPremise, context) => {
            const termStr = primaryPremise.term?.toString?.() || String(primaryPremise.term || 'unknown');
            return `On a scale from 0.0 (completely uncertain) to 1.0 (completely certain), how confident should one be in the following statement?
Provide only a single number as your answer.

Statement: "${termStr}"`;
        },

        process: (lmResponse) => {
            const match = lmResponse?.match(/(\d\.\d+)/);
            if (match) {
                const confidence = parseFloat(match[1]);
                if (!isNaN(confidence) && confidence >= 0 && confidence <= 1) {
                    return confidence;
                }
            }
            return null;
        },

        generate: (processedOutput, primaryPremise, secondaryPremise, context) => {
            if (processedOutput === null) return [];

            const newTruth = {
                frequency: primaryPremise.truth?.f ?? 0.9,
                confidence: processedOutput
            };

            const newTask = new Task({
                term: primaryPremise.term,
                punctuation: primaryPremise.punctuation,
                truth: newTruth
            });

            return [newTask];
        },

        lm_options: {
            temperature: 0.2,
            max_tokens: 10,
        },
    });
};
