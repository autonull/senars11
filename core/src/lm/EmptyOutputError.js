import {ProviderError} from './ProviderError.js';

export class EmptyOutputError extends ProviderError {
    constructor(message = 'LM returned empty output', providerId = null) {
        super(message, { providerId, code: 'EMPTY_OUTPUT' });
    }
}
