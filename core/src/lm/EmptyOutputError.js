import {ProviderError} from '@senars/core';

export class EmptyOutputError extends ProviderError {
    constructor(message = 'LM returned empty output', providerId = null) {
        super(message, { providerId, code: 'EMPTY_OUTPUT' });
    }
}
