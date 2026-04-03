/**
 * @file src/reason/rules/lm/LMAnalogicalReasoningRule.js
 * @description Analogical reasoning rule that uses an LM to solve new problems by drawing analogies to known situations.
 * Based on the v9 implementation with enhancements for stream-based architecture.
 */

import {LMRule} from '../../LMRule.js';
import {Punctuation, Task} from '../../../task/Task.js';
import {hasPattern, isGoal, isQuestion, KeywordPatterns} from '../../RuleHelpers.js';

/**
 * Creates an analogical reasoning rule using the enhanced LMRule.create method.
 * This rule identifies problem-solving goals and uses an LM to find analogous solutions.
 *
 * @param {object} dependencies - Object containing lm and other dependencies
 * @returns {LMRule} A new LMRule instance for analogical reasoning.
 */
export const createAnalogicalReasoningRule = (dependencies) => {
    const {lm, memory, embeddingLayer, eventBus} = dependencies;
    return LMRule.create({
        id: 'analogical-reasoning',
        lm,
        eventBus,
        name: 'Analogical Reasoning Rule',
        description: 'Solves new problems by drawing analogies to known situations.',
        priority: 0.7,

        condition: (primaryPremise, secondaryPremise, context) => {
            if (!primaryPremise) return false;

            const termStr = primaryPremise.term?.toString?.() ?? String(primaryPremise.term ?? '');
            const isGoalOrQuestion = isGoal(primaryPremise) || isQuestion(primaryPremise);
            const priority = primaryPremise.budget?.priority ?? 0.5;

            return isGoalOrQuestion && priority > 0.6 && hasPattern(primaryPremise, KeywordPatterns.problemSolving);
        },

        prompt: async (primaryPremise, secondaryPremise, context) => {
            const termStr = primaryPremise.term?.toString?.() ?? String(primaryPremise.term ?? 'unknown');
            let contextStr = "";

            if (embeddingLayer && memory) {
                try {
                    const candidates = memory.getAllConcepts().map(c => c.term.toString());
                    const uniqueCandidates = [...new Set(candidates)].filter(c => c !== termStr);

                    if (uniqueCandidates.length > 0) {
                        const similar = await embeddingLayer.findSimilar(termStr, uniqueCandidates, 0.6);
                        const topSimilar = similar.slice(0, 3).map(r => r.item);

                        if (topSimilar.length > 0) {
                            contextStr = `\nContext: I recall these similar concepts/problems: ${topSimilar.join(", ")}\n`;
                        }
                    }
                } catch (e) {
                    console.warn("AnalogicalReasoningRule: Error retrieving embeddings:", e);
                }
            }

            return `Here is a problem: "${termStr}".
${contextStr}
Think of a similar, well-understood problem (using the context if relevant). What is the analogy?
Based on that analogy, describe a step-by-step solution for the original problem.`;
        },

        process: (lmResponse) => {
            return lmResponse?.trim() ?? '';
        },

        generate: (processedOutput, primaryPremise, secondaryPremise, context) => {
            if (!processedOutput) return [];

            const termFactory = context?.termFactory ?? dependencies.termFactory;
            if (!termFactory) {
                console.warn('AnalogicalReasoning: No termFactory available');
                return [];
            }

            const originalTermStr = primaryPremise.term?.toString?.() ?? String(primaryPremise.term ?? '');
            const newTermName = `solution_proposal_for_(${originalTermStr})`;
            const newTerm = termFactory.atomic(newTermName);

            return [new Task({
                term: newTerm,
                punctuation: Punctuation.BELIEF,
                truth: {
                    frequency: 0.8,
                    confidence: (primaryPremise.truth?.c ?? 0.9) * 0.8
                },
                budget: {priority: 0.7, durability: 0.6, quality: 0.5}
            })];
        },

        lm_options: {
            temperature: 0.7,
            max_tokens: 600,
        },
    });
};
