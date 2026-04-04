import { LMRule } from '../../LMRule.js';
import { NarseseTranslator } from '@senars/core/src/lm/NarseseTranslator.js';
import { NarseseParser } from '../../../parser/NarseseParser.js';
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
            condition: (primary) =>
                typeof primary?.term === 'string' &&
                !primary.term.includes('-->') &&
                !primary.term.includes('==>'),
            process: (response, primary, secondary, context) => response,
            generate: (response, primary, secondary, context) => {
                if (!response) return [];

                const translator = new NarseseTranslator();
                const lmStats = context.lmStats;
                const providerId = this.lm.providerId || 'unknown';

                let logProb = null;
                let textResponse = response;

                if (typeof response === 'object' && response.text) {
                    textResponse = response.text;
                    if (response.metadata?.score) {
                        logProb = response.metadata.score;
                    }
                }

                const confidence = lmStats
                    ? lmStats.getCalibratedConfidence(providerId, logProb)
                    : logProb !== null
                        ? Math.min(0.99, Math.max(0.1, Math.exp(logProb)))
                        : 0.8;

                response = typeof response === 'string' ? response : textResponse;

                try {
                    const termFactory = context?.termFactory;
                    const parser = context?.parser ?? new NarseseParser(termFactory);

                    const createTask = (termStr, truth, punctuation) => {
                        let termObj = termStr;
                        if (termFactory && typeof termStr === 'string') {
                            try {
                                termObj = parser.parseTerm(termStr);
                            } catch {
                                if (!termStr.includes(' ') && !termStr.includes('(')) {
                                    termObj = termFactory.create(termStr);
                                }
                            }
                        }
                        return new Task({ term: termObj, truth, punctuation });
                    };

                    if (response.includes('-->') || response.includes('==>')) {
                        const match = response.match(/\([^\)]+\)/);
                        if (match) {
                            return [createTask(match[0], new Truth(1.0, confidence), '.')];
                        }
                    }

                    return [createTask(response.trim(), new Truth(1.0, confidence), '.')];
                } catch {
                    return [];
                }
            }
        });
    }
}

export const createNarseseTranslationRule = (dependencies, config = {}) => {
    const { lm } = dependencies;
    const id = config.id || 'lm-narsede-translation';
    return new LMNarseseTranslationRule(id, lm, config);
};
