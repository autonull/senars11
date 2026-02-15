
import { LMRule } from '../../LMRule.js';
import { NarseseTranslator } from '../../../lm/NarseseTranslator.js';
import { Task } from '../../../task/Task.js';
import { Truth } from '../../../Truth.js';

export class LMNarseseTranslationRule extends LMRule {
    constructor(id, lm, config = {}) {
        super(id, lm, {
            ...config,
            name: 'LMNarseseTranslationRule',
            description: 'Translates natural language to Narsese with calibrated confidence',
            singlePremise: true,
            promptTemplate: config.promptTemplate ||
                'Translate the following sentence into Narsese logic (NARS format). Sentence: "{{taskTerm}}"',
            condition: (primary) => {
                // Apply only to string terms (natural language inputs) that are NOT already Narsese
                return typeof primary?.term === 'string' &&
                       !primary.term.includes('-->') &&
                       !primary.term.includes('==>');
            },
            process: (response, primary, secondary, context) => {
                // This method is called after LM generation
                // We use it to parse the Narsese
                return response;
            },
            generate: (response, primary, secondary, context) => {
                // Generate Tasks
                if (!response) return [];

                const translator = new NarseseTranslator();
                const lmStats = context.lmStats; // Assuming context has access to LMStats
                const providerId = this.lm.providerId || 'unknown';

                // Extract logprobs or score if available in response object (if response is object)
                let logProb = null;
                let textResponse = response;

                if (typeof response === 'object' && response.text) {
                    textResponse = response.text;
                    if (response.metadata && response.metadata.score) {
                        // Assume score is log probability or probability
                        // Normalized if > 0 ? No, usually score is logProb.
                        logProb = response.metadata.score;
                    }
                }

                // Get calibrated confidence
                const confidence = lmStats ? lmStats.getCalibratedConfidence(providerId, logProb) :
                                   (logProb !== null ? Math.min(0.99, Math.max(0.1, Math.exp(logProb))) : 0.8);

                // Use simple response string for processing
                response = typeof response === 'string' ? response : textResponse;

                try {
                    // Try to translate
                    // If response is already Narsese, translator might handle or we regex it
                    // But translator.toNarsese takes NL.
                    // If LM returns NL explanation + Narsese, we need to extract Narsese.
                    // For simplicity, assume LM returns roughly Narsese or structured text.
                    // Actually, if prompt asks for translation, LM output IS the Narsese candidate (or close to it).

                    // Ideally we use the LM output as the "Narsese" directly if it looks like Narsese,
                    // OR we use the translator to convert the *original* text if this rule was just a trigger.
                    // But LMRule *uses* the LM. So we expect the LM to do the translation.

                    // If LM output is Narsese:
                    if (response.includes('-->') || response.includes('==>')) {
                        // Extract Narsese part
                        const match = response.match(/\([^\)]+\)/);
                        if (match) {
                            return [new Task({
                                term: match[0],
                                truth: new Truth(1.0, confidence),
                                punctuation: '.'
                            })];
                        }
                    }

                    // Fallback: Use NarseseTranslator on the *original* term if LM failed to give Narsese
                    // But then why use LM?
                    // Maybe LM provides a better "interpretation" which we then translate?

                    // Let's assume this rule relies on LM to generate Narsese string.
                    const narseseStr = response.trim();
                    return [new Task({
                        term: narseseStr,
                        truth: new Truth(1.0, confidence),
                        punctuation: '.'
                    })];

                } catch (e) {
                    return [];
                }
            }
        });
    }
}

export const createNarseseTranslationRule = (dependencies, config = {}) => {
    const { lm } = dependencies;
    const id = config.id || 'lm-narsese-translation';
    return new LMNarseseTranslationRule(id, lm, config);
};
