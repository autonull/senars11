/**
 * @file LMNarsGPTGoalRule.js
 * NARS-GPT style goal processing with grounding requirement.
 */

import {LMRule} from '../../LMRule.js';
import {Punctuation, Task} from '../../../task/Task.js';
import {Truth} from '../../../Truth.js';
import {isGoal, tryParseNarsese} from '../../RuleHelpers.js';
import {NarsGPTPrompts} from './NarsGPTPrompts.js';

const GOAL_PATTERN = /(!$|-->|==>|^\d+\.)/;
const MAX_SUBGOALS = 5;

export const createNarsGPTGoalRule = ({lm, narsGPTStrategy, parser, eventBus, memory}) =>
    LMRule.create({
        id: 'narsgpt-goal',
        lm,
        eventBus,
        name: 'NARS-GPT Goal Processing',
        description: 'Processes goals and generates sub-goals, requiring grounded terms.',
        priority: 0.9,
        singlePremise: true,

        condition: async (task) => {
            if (!task?.term || !isGoal(task)) return false;
            if (!narsGPTStrategy?.checkGrounding) return true;
            const result = await narsGPTStrategy.checkGrounding(task.term?.toString?.() ?? '');
            return result.grounded;
        },

        prompt: async (task, _, ctx) => {
            const goal = task.term?.toString?.() ?? String(task.term);
            const mem = ctx?.memory ?? memory;
            let context = '';
            if (narsGPTStrategy && mem) {
                const buffer = await narsGPTStrategy.buildAttentionBuffer(goal, mem, ctx?.currentTime ?? Date.now());
                context = NarsGPTPrompts.formatBuffer(buffer);
            }
            return NarsGPTPrompts.goal(context, goal);
        },

        process: (response) => {
            if (!response) return null;
            const lines = response.split('\n').map(l => l.trim()).filter(Boolean);
            const goals = lines.filter(l => GOAL_PATTERN.test(l));
            return goals.length ? goals : [response.trim()];
        },

        generate: (output, task, _, ctx) => {
            if (!output?.length) return [];
            const outputs = (Array.isArray(output) ? output : [output]).slice(0, MAX_SUBGOALS);
            const parentTruth = task.truth ?? {f: 0.9, c: 0.9};
            const parentPriority = task.budget?.priority ?? 0.8;
            const parentGoal = task.term?.toString?.();

            return outputs.map(line => {
                const cleaned = line.replace(/^\d+\.\s*/, '').trim();
                const parsed = tryParseNarsese(cleaned, parser);

                if (parsed?.term) {
                    return new Task({
                        term: parsed.term,
                        punctuation: Punctuation.GOAL,
                        truth: new Truth(parentTruth.f ?? 0.9, (parentTruth.c ?? 0.9) * 0.85),
                        budget: {priority: parentPriority * 0.9, durability: 0.7, quality: 0.5},
                        metadata: {source: 'narsgpt-goal', parentGoal}
                    });
                }

                if (ctx?.termFactory) {
                    return new Task({
                        term: ctx.termFactory.atomic(cleaned.replace(/!$/, '')),
                        punctuation: Punctuation.GOAL,
                        truth: new Truth(0.8, 0.7),
                        budget: {priority: 0.7, durability: 0.6, quality: 0.5},
                        metadata: {source: 'narsgpt-goal', parentGoal}
                    });
                }
                return null;
            }).filter(Boolean);
        },

        lm_options: {temperature: 0.5, max_tokens: 400}
    });
