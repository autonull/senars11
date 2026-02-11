/**
 * Trampoline-based tail call optimization
 * Enables infinite recursion without stack overflow
 */

import { METTA_CONFIG } from '../config.js';

export class Trampoline {
    constructor() {
        this.enabled = METTA_CONFIG.tco ?? true;
    }

    run(fn, ...args) {
        if (!this.enabled) return fn(...args);

        let result = fn(...args);

        // Keep bouncing until we get a real value
        while (result && result._isBounce) {
            result = result.fn(...result.args);
        }

        return result;
    }
}

// Helper to create a tail call bounce
export function bounce(fn, ...args) {
    if (METTA_CONFIG.tco === false) return fn(...args);
    return { _isBounce: true, fn, args };
}
