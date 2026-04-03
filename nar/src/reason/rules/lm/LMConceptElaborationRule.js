import { LMRule } from '../../LMRule.js';
import { createFallbackTerm, tryParseNarsese } from '../../RuleHelpers.js';
import { Punctuation, Task } from '../../../task/Task.js';
import { Truth } from '../../../Truth.js';
import { Term } from '../../../term/Term.js';

export const createConceptElaborationRule = (dependencies) => {
    const { lm, parser, termFactory, eventBus, memory } = dependencies;

    return LMRule.create({
        id: 'concept-elaboration',
        lm,
        eventBus,
        name: 'Concept Elaboration Rule',
        description: 'Generates potential properties or classifications for a concept using commonsense knowledge.',
        priority: 0.7,
        singlePremise: true,

        condition: (primaryPremise) => {
            if (!primaryPremise?.term) return false;
            const term = primaryPremise.term;
            if (term.components?.length > 0 && !term.isAtomic) return false;

            const name = term.name ?? term.toString();
            if (typeof name !== 'string') return false;
            if (name.startsWith('?') || name.startsWith('#')) return false;
            if (/^\d+$/.test(name)) return false;

            return (primaryPremise.type ?? 'BELIEF') === 'BELIEF';
        },

        prompt: (primaryPremise) => {
            const term = primaryPremise.term;
            const content = (term.name ?? term.toString()).replace(/^"|"$/g, '');

            const concept = memory?.getConcept?.(term);
            const beliefs = concept?.getBeliefs?.() ?? concept?.tasks ?? [];

            const contextText = beliefs
                .filter(t => t.punctuation === '.')
                .slice(0, 3)
                .map(t => t.toString())
                .join('\n');

            const context = contextText ? `\nContext (Known facts):\n${contextText}\n` : '';

            return `Concept property elaboration.${context}
"cat" => <cat --> animal>.
"sun" => <sun --> [hot]>.
"${content}" => `;
        },

        process: (r) => r?.trim() ?? '',

        generate: (processedOutput) => {
            if (!processedOutput) return [];

            const parsed = tryParseNarsese(processedOutput, parser);
            const termToCreate = parsed?.term ?? parsed ?? createFallbackTerm(processedOutput, termFactory);

            if (!termToCreate) return [];

            const punctuation = parsed?.punctuation ?? Punctuation.BELIEF;
            const truth = parsed?.truthValue
                ? new Truth(parsed.truthValue.frequency, parsed.truthValue.confidence)
                : (parsed ? new Truth(0.9, 0.8) : new Truth(0.8, 0.7));

            return [new Task({
                term: termToCreate,
                punctuation,
                truth,
                budget: { priority: 0.6, durability: 0.7, quality: 0.5 }
            })];
        }
    });
};
