/**
 * @file src/reason/rules/LMAnalogicalReasoningRule.js
 * @description Analogical reasoning rule that uses an LM to solve new problems by drawing analogies to known situations.
 * Based on the v9 implementation with enhancements for stream-based architecture.
 */

import {LMRule} from '../../LMRule.js';
import {Punctuation, Task} from '../../utils/TaskUtils.js';
import {hasPattern, isGoal, isQuestion, KeywordPatterns} from '../../RuleHelpers.js';

/**
 * Creates an analogical reasoning rule using the enhanced LMRule.create method.
 * This rule identifies problem-solving goals and uses an LM to find analogous solutions.
 *
 * @param {object} dependencies - Object containing lm and other dependencies
 * @returns {LMRule} A new LMRule instance for analogical reasoning.
 */
export const createAnalogicalReasoningRule = (dependencies) => {
    const {lm, embeddingLayer, memory} = dependencies;
    return LMRule.create({
        id: 'analogical-reasoning',
        lm,
        name: 'Analogical Reasoning Rule',
        description: 'Solves new problems by drawing analogies to known situations.',
        priority: 0.7,

        condition: (primaryPremise, secondaryPremise, context) => {
            if (!primaryPremise) return false;

            const termStr = primaryPremise.term?.toString?.() || String(primaryPremise.term || '');
            const isGoalOrQuestion = isGoal(primaryPremise) || isQuestion(primaryPremise);
            const priority = primaryPremise.getPriority?.() || primaryPremise.priority || 0;

            return isGoalOrQuestion && priority > 0.6 && hasPattern(primaryPremise, KeywordPatterns.problemSolving);
        },

        prompt: async (primaryPremise, secondaryPremise, context) => {
            const termStr = primaryPremise.term?.toString?.() || String(primaryPremise.term || 'unknown');
            let contextStr = '';

            if (embeddingLayer && memory) {
                try {
                    const concepts = memory.getAllConcepts();
                    const candidates = concepts
                        .map(c => c.term.toString())
                        .filter(t => t !== termStr && !t.includes('solution_proposal'));

                    if (candidates.length > 0) {
                        const similar = await embeddingLayer.findSimilar(termStr, candidates, 0.6);
                        const topMatches = similar.slice(0, 3).map(m => `"${m.item}"`);

                        if (topMatches.length > 0) {
                            contextStr = `\nRecall these similar known concepts: ${topMatches.join(', ')}.`;
                        }
                    }
                } catch (e) {
                    console.warn('Error fetching analogies:', e);
                }
            }

            return `Here is a problem: "${termStr}".${contextStr}

Think of a similar, well-understood problem. What is the analogy?
Based on that analogy, describe a step-by-step solution for the original problem.`;
        },

        process: (lmResponse) => {
            return lmResponse?.trim() || '';
        },

        generate: (processedOutput, primaryPremise, secondaryPremise, context) => {
            if (!processedOutput) return [];

            const newTerm = `solution_proposal_for_(${primaryPremise.term?.toString?.() || 'unknown'})`;
            const newTask = new Task(
                newTerm,
                Punctuation.BELIEF,
                {frequency: 0.8, confidence: 0.7},
                null,
                null,
                0.7,
                0.6,
                null,
                {
                    originalTask: primaryPremise.term?.toString?.(),
                    solutionProposal: processedOutput // Attach the detailed solution as metadata
                }
            );

            return [newTask];
        },

        lm_options: {
            temperature: 0.7,
            max_tokens: 600,
        },
    });
};
