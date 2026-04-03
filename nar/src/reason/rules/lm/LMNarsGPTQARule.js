/**
 * @file LMNarsGPTQARule.js
 * NARS-GPT style question answering with memory-grounded context.
 */

import {LMRule} from '../../LMRule.js';
import {Punctuation, Task} from '../../../task/Task.js';
import {Truth} from '../../../Truth.js';
import {isQuestion} from '../../RuleHelpers.js';
import {NarsGPTPrompts} from './NarsGPTPrompts.js';

export const createNarsGPTQARule = ({lm, narsGPTStrategy, parser, eventBus, memory}) =>
    LMRule.create({
        id: 'narsgpt-qa',
        lm,
        eventBus,
        name: 'NARS-GPT Question Answering',
        description: 'Answers questions using memory-grounded context.',
        priority: 0.95,
        singlePremise: true,

        condition: (task) => task?.term && isQuestion(task),

        prompt: async (task, _, ctx) => {
            const question = task.term?.toString?.() ?? String(task.term);
            const mem = ctx?.memory ?? memory;
            let context = '';
            if (narsGPTStrategy && mem) {
                const buffer = await narsGPTStrategy.buildAttentionBuffer(question, mem, ctx?.currentTime ?? Date.now());
                context = NarsGPTPrompts.formatBuffer(buffer);
            }
            return NarsGPTPrompts.question(context, question);
        },

        process: (response) => {
            if (!response) return null;
            const firstLine = response.split('\n').map(l => l.trim()).find(Boolean);
            return firstLine ?? response.trim();
        },

        generate: (output, task, _, ctx) => {
            if (!output || !ctx?.termFactory) return [];
            const answer = output.replace(/^["']|["']$/g, '').trim();
            return [new Task({
                term: ctx.termFactory.atomic(`"${answer}"`),
                punctuation: Punctuation.BELIEF,
                truth: new Truth(0.9, 0.7),
                budget: {priority: 0.8, durability: 0.7, quality: 0.6},
                metadata: {source: 'narsgpt-qa', question: task.term?.toString?.()}
            })];
        },

        lm_options: {temperature: 0.3, max_tokens: 300}
    });
