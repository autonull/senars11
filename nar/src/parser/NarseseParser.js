import { BaseParser } from './BaseParser.js';
import { parse } from './peggy-parser.js';

export class NarseseParser extends BaseParser {
    parse(input) {
        const validInput = this._validateInput(input);

        if (this._cacheHas(validInput)) {
            return this._cacheGet(validInput);
        }

        try {
            const result = parse(validInput, { termFactory: this.termFactory });

            if (result.term?.operator === '--' && result.term.components.length === 1 && result.truthValue) {
                result.term = result.term.components[0];
                result.truthValue = {
                    frequency: 1 - result.truthValue.frequency,
                    confidence: result.truthValue.confidence
                };
            }

            this._cacheSet(validInput, result);
            return result;
        } catch (error) {
            throw this._wrapError(error, validInput);
        }
    }
}
