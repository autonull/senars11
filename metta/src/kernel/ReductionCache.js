/**
 * ReductionCache.js - Memoization for reduction results
 * Q5: Reuse SeNARS TermCache for reduction memoization
 */

import { TermCache } from '@senars/nar/src/term/TermCache.js';
import { configManager } from '../config/config.js';

export class ReductionCache {
    constructor(maxSize = configManager.get('maxCacheSize')) {
        this.cache = new TermCache({ maxSize });
        this.enabled = configManager.get('caching');
    }

    get(atom) {
        if (!this.enabled) return undefined;
        return this.cache.get(this._key(atom));
    }

    set(atom, result) {
        if (!this.enabled) return;
        this.cache.put(this._key(atom), result);
    }

    _key(atom) {
        // Use hash if available, otherwise string representation
        return atom._hash || (atom._hash = atom.toString());
    }

    stats() {
        return this.cache.stats;
    }

    clear() {
        this.cache.clear();
    }
}
