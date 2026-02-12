import {LMRule} from '../../LMRule.js';
import {Punctuation} from '../../utils/TaskUtils.js';
import {Task} from '../../../task/Task.js';
import {Truth} from '../../../Truth.js';
import {Term} from '../../../term/Term.js';

export const createConceptElaborationRule = (dependencies) => {
    const {lm, parser} = dependencies;

    return LMRule.create({
        id: 'concept-elaboration',
        lm,
        name: 'Concept Elaboration Rule',
        description: 'Generates potential properties or classifications for a concept using commonsense knowledge.',
        priority: 0.7,
        singlePremise: true,

        condition: (primaryPremise) => {
            if (!primaryPremise || !primaryPremise.term) return false;

            // Only elaborate on atomic terms (simple concepts)
            const term = primaryPremise.term;
            const isAtomic = term.isAtomic || term.type === 'atom' || (term.components && term.components.length === 0);

            // Check type. Use property accessors if available or property
            const type = primaryPremise.type || (primaryPremise.isBelief?.() ? 'BELIEF' : 'UNKNOWN');

            // Avoid elaborating special system terms or variables
            const name = term.name || term.toString();
            if (name.startsWith('?') || name.startsWith('#')) return false;

            return isAtomic && type === 'BELIEF';
        },

        prompt: (primaryPremise) => {
            const termStr = primaryPremise.term.toString();
            // Remove quotes if present for the prompt
            const concept = termStr.replace(/^"|"$/g, '');

            return `Given the concept "${concept}", provide ONE likely property, classification, or capability in Narsese format.
Examples:
Concept: "cat" -> (cat --> animal).
Concept: "sun" -> (sun --> [hot]).
Concept: "run" -> (run --> action).

Concept: "${concept}"`;
        },

        process: (lmResponse) => {
             return lmResponse?.trim() || '';
        },

        generate: (processedOutput, primaryPremise) => {
            if (!processedOutput || !parser) return [];

            try {
                // Try to extract Narsese if embedded in text
                const narseseMatch = processedOutput.match(/[<(\[]{1}.*[>)\].!]{1}/);
                const narsese = narseseMatch ? narseseMatch[0] : processedOutput;

                const parsed = parser.parse(narsese);
                if (parsed && (parsed.term || parsed instanceof Term)) {
                     // Handle both parsed Task structure and raw Term
                     let term = parsed.term || parsed;
                     let punctuation = parsed.punctuation || Punctuation.BELIEF;
                     let truth = parsed.truthValue;

                     const newTask = new Task({
                         term: term,
                         punctuation: punctuation,
                         truth: truth ? new Truth(truth.frequency, truth.confidence) : new Truth(0.9, 0.8),
                         budget: {priority: 0.6, durability: 0.7, quality: 0.5}
                     });

                     return [newTask];
                }
            } catch (e) {
                // Ignore parse errors
            }
            return [];
        }
    });
};
