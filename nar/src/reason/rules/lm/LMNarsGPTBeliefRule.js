/**
 * @file LMNarsGPTBeliefRule.js
 * NARS-GPT style belief formation from natural language.
 */

import {LMRule} from '../../LMRule.js';
import {Punctuation, Task} from '../../../task/Task.js';
import {Truth} from '../../../Truth.js';
import {isBelief, tryParseNarsese} from '../../RuleHelpers.js';
import {NarsGPTPrompts} from './NarsGPTPrompts.js';

const NARSESE_PATTERN = /^[(<].*?(-->|<->|==>)/;
const TRUTH_PATTERN = /\{(\d+\.?\d*)\s+(\d+\.?\d*)\}/;

export const createNarsGPTBeliefRule = ({lm, narsGPTStrategy, parser, eventBus, memory}) =>
    LMRule.create({
        id: 'narsgpt-belief',
        lm,
        eventBus,
        name: 'NARS-GPT Belief Formation',
        description: 'Encodes natural language beliefs into Narsese with memory-consistent terms.',
        priority: 0.85,
        singlePremise: true,

        condition: (task) => {
            if (!task?.term || !isBelief(task)) return false;
            const name = task.term.name ?? task.term.toString?.() ?? '';
            return task.term.isAtomic && (/\s/.test(name) || name.startsWith('"'));
        },

        prompt: async (task, _, ctx) => {
            const sentence = (task.term?.toString?.() ?? String(task.term)).replace(/^"|"$/g, '');
            const mem = ctx?.memory ?? memory;
            let context = '';
            if (narsGPTStrategy && mem) {
                const buffer = await narsGPTStrategy.buildAttentionBuffer(sentence, mem, ctx?.currentTime ?? Date.now());
                context = NarsGPTPrompts.formatBuffer(buffer.slice(0, 10));
            }
            return NarsGPTPrompts.belief(context, sentence);
        },

        process: (response) => {
            if (!response) return null;
            const narseseLine = response.split('\n').map(l => l.trim()).find(l => NARSESE_PATTERN.test(l));
            return narseseLine ?? response.trim();
        },

        generate: (output, task) => {
            if (!output) return [];
            const parsed = tryParseNarsese(output, parser);
            if (!parsed?.term) return [];

            const match = output.match(TRUTH_PATTERN);
            const truth = parsed.truthValue
                ? new Truth(parsed.truthValue.frequency, parsed.truthValue.confidence)
                : match ? new Truth(parseFloat(match[1]), parseFloat(match[2])) : new Truth(0.9, 0.9);

            return [new Task({
                term: parsed.term,
                punctuation: Punctuation.BELIEF,
                truth,
                budget: {priority: 0.8, durability: 0.8, quality: 0.6},
                metadata: {source: 'narsgpt-belief'}
            })];
        },

        lm_options: {temperature: 0.2, max_tokens: 200}
    });
