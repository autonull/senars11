/**
 * Symbol Interning Module
 * Q1: Wraps SeNARS TermFactory for high-performance symbol interning
 *
 * Key optimization: Referential equality first, structural equality fallback
 * (since cache has limited size, we can't assume all terms are interned)
 */

import {TermFactory} from '@senars/nar/src/term/TermFactory.js';
import {configManager} from '../config/config.js';
import {SymbolAtom} from './AtomTypes.js';

// Shared term factory for all MeTTa symbols
const termFactory = new TermFactory({
    maxCacheSize: configManager.get('maxInternedSymbols')
});

// Statistics for monitoring
const stats = {
    internHits: 0,      // Found in cache (referential equality works)
    internMisses: 0,    // Not in cache (need structural equality)
    symbolsCreated: 0,
    cacheEvictions: 0
};

/**
 * Create or retrieve an interned symbol
 * @param {string} name - Symbol name
 * @returns {object} Interned symbol (may be reference-equal to previous calls)
 */
export function intern(name) {
    if (!configManager.get('interning')) {
        // Optimization disabled - create new symbol each time
        stats.internMisses++;
        return new SymbolAtom(name);
    }

    // Try to get from cache
    const cached = termFactory.atomic(name);

    if (cached) {
        stats.internHits++;
        return cached;
    }

    // Cache miss (evicted or first creation)
    stats.internMisses++;
    stats.symbolsCreated++;

    return termFactory.atomic(name);
}

/**
 * Symbol equality check
 * Fast path: referential equality (O(1))
 * Fallback: structural equality (O(n) for string comparison)
 *
 * @param {object} a - First symbol
 * @param {object} b - Second symbol
 * @returns {boolean} True if symbols are equal
 */
export function symbolEq(a, b) {
    // Fast path: referential equality (works when both symbols are interned)
    if (a === b) {
        return true;
    }

    // Fallback: structural equality (needed when cache eviction occurs)
    // This handles the case where two symbols with same name aren't reference-equal
    // due to cache size limits
    return a?.name === b?.name;
}

/**
 * Get interning statistics
 */
export function getInternStats() {
    const termFactoryStats = termFactory.stats();

    return {
        ...stats,
        cacheSize: termFactoryStats?.cacheSize || 0,
        cacheHitRate: stats.internHits / (stats.internHits + stats.internMisses) || 0,
        termFactoryHitRate: termFactoryStats?.cacheHitRate || 0
    };
}

/**
 * Clear interning cache (for testing)
 */
export function clearInternCache() {
    termFactory.clearCache();
    stats.internHits = 0;
    stats.internMisses = 0;
    stats.symbolsCreated = 0;
    stats.cacheEvictions = 0;
}
