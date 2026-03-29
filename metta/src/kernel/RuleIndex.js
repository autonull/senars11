/**
 * RuleIndex.js - Multi-level rule indexing
 * Tier 2 optimization: Replaces linear scan with O(1) lookups
 */

import { isExpression, isSymbol, isVariable } from './Term.js';
import { BloomFilter } from './BloomFilter.js';
import { METTA_CONFIG } from '../config.js';

export class RuleIndex {
    constructor(config = {}) {
        this.enabled = config.enabled ?? METTA_CONFIG.indexing ?? true;

        // Level 1: Functor index (Map<string, Array<Rule>>)
        this.functorIndex = new Map();

        // Level 2: Functor + Arity (Map<string, Array<Rule>>)
        this.arityIndex = new Map();

        // Level 3: Signature (Map<string, Array<Rule>>)
        this.signatureIndex = new Map();

        // Bloom filter for fast negative lookups
        this.bloom = new BloomFilter(config.bloomFilterSize || 10000);

        this.allRules = [];
        this.stats = {
            hits: 0,
            misses: 0,
            fullScans: 0,
            bloomFilterSaves: 0
        };
    }

    addRule(rule) {
        this.allRules.push(rule);
        if (!this.enabled) return;

        const pattern = rule.pattern;
        if (!isExpression(pattern)) return;

        const functor = this._getFunctorName(pattern.operator);
        const arity = pattern.components?.length || 0;

        if (!functor) return;

        // Index by functor
        if (!this.functorIndex.has(functor)) {
            this.functorIndex.set(functor, []);
        }
        this.functorIndex.get(functor).push(rule);

        // Index by functor + arity
        const arityKey = `${functor}/${arity}`;
        if (!this.arityIndex.has(arityKey)) {
            this.arityIndex.set(arityKey, []);
        }
        this.arityIndex.get(arityKey).push(rule);

        // Index by signature (Level 3)
        const sigKey = this._getSignatureKey(pattern);
        if (sigKey) {
            if (!this.signatureIndex.has(sigKey)) {
                this.signatureIndex.set(sigKey, []);
            }
            this.signatureIndex.get(sigKey).push(rule);
        }

        // Add to bloom filter
        this.bloom.add(functor);
    }

    removeRule(rule) {
        const idx = this.allRules.indexOf(rule);
        if (idx !== -1) this.allRules.splice(idx, 1);

        if (!this.enabled) return;
        const pattern = rule.pattern;
        if (!isExpression(pattern)) return;

        const functor = this._getFunctorName(pattern.operator);
        const arity = pattern.components?.length || 0;

        if (!functor) return;

        this._removeFromMap(this.functorIndex, functor, rule);
        this._removeFromMap(this.arityIndex, `${functor}/${arity}`, rule);

        const sigKey = this._getSignatureKey(pattern);
        if (sigKey) {
            this._removeFromMap(this.signatureIndex, sigKey, rule);
        }
    }

    rulesFor(term) {
        if (!this.enabled) return this.allRules;

        // Handle symbol lookups (e.g. rulesFor('+'))
        if (!isExpression(term)) {
            const functorName = this._getFunctorName(term);
            if (functorName) {
                // If we have a functor name, use it to lookup.
                // We should also return rules that might match any functor (if we supported variable operators),
                // but since we only index by functor, only exact matches are indexed.
                // If not in index, return empty array?
                // The original implementation returned matches from functorIndex or empty.
                // But wait, if there are rules with variable operators, they wouldn't be in functorIndex.
                // Assuming standard Metta where rules have concrete heads.
                if (this.functorIndex.has(functorName)) {
                    this.stats.hits++;
                    return this.functorIndex.get(functorName);
                }

                // If not found in index, check if bloom filter rules it out?
                // Bloom filter is for functors.
                if (!this.bloom.has(functorName)) {
                    this.stats.bloomFilterSaves++;
                    return [];
                }

                // If bloom says maybe but index says no, it's a false positive or unindexed.
                // If we assume all rules with functor F are in functorIndex[F], then empty is correct.
                return [];
            }

            // If term is a variable, we must return everything?
            if (isVariable(term)) {
                this.stats.fullScans++;
                return this.allRules;
            }

            // If term is a value but not a valid functor name?
            this.stats.fullScans++;
            return this.allRules;
        }

        const functor = this._getFunctorName(term.operator);

        // Fast negative lookup: if not in bloom, definitely not in index
        if (functor && !this.bloom.has(functor)) {
            this.stats.bloomFilterSaves++;
            return [];
        }

        const arity = term.components?.length || 0;

        // Try most specific index first (Level 3: Signature)
        const sigKey = this._getSignatureKey(term);
        if (sigKey && this.signatureIndex.has(sigKey)) {
            this.stats.hits++;
            return this.signatureIndex.get(sigKey);
        }

        // Fall back to arity index (Level 2: Functor+Arity)
        const arityKey = `${functor}/${arity}`;
        if (this.arityIndex.has(arityKey)) {
            this.stats.hits++;
            return this.arityIndex.get(arityKey);
        }

        // Fall back to functor index
        if (functor && this.functorIndex.has(functor)) {
            this.stats.hits++;
            return this.functorIndex.get(functor);
        }

        // Full scan
        this.stats.misses++;
        // If bloom filter said maybe, but we found nothing in indexes, it might be unindexed or false positive.
        // But since we index everything with a functor, if it's not in functorIndex, it's not indexed.
        // However, we must return rules that have no functor (variable operator) as they might match anything.
        // For safety/correctness with variable operators, we should return allRules if we can't narrow it down.
        // But if the term has a concrete functor F, and F is not in our index...
        // Are there rules with variable operators?
        // If yes, they are NOT indexed in functorIndex.
        // So they are ONLY in allRules.
        // Thus, if we don't find a match in indexes, we MUST return allRules (or a separate list of unindexed rules).
        // Optimization: Maintain a list of "unindexed rules" (variable operator rules) and return them instead of allRules?
        // For now, return allRules to be safe, as per original logic fall-back.
        return this.allRules;
    }

    _getFunctorName(functor) {
        if (!functor) return null;
        if (typeof functor === 'string') return functor;
        if (isSymbol(functor)) return functor.name;
        // Handle nested expressions as operators (e.g. Curried functions) by taking inner operator name
        // Or specific ID if available
        if (isExpression(functor)) return this._getFunctorName(functor.operator);
        return null;
    }

    _getSignatureKey(pattern) {
        const functor = this._getFunctorName(pattern.operator);
        const args = pattern.components || [];

        // Level 3: Signature index (first 2 constant args)
        // Only use if args are constants (Symbols/Values), not Variables
        const constArgs = args.slice(0, 2)
            .filter(a => !isVariable(a))
            .map(a => a.name || a.toString());

        return constArgs.length > 0 ? `${functor}/${constArgs.join('/')}` : null;
    }

    _removeFromMap(map, key, item) {
        if (map.has(key)) {
            const list = map.get(key);
            const idx = list.indexOf(item);
            if (idx !== -1) {
                list.splice(idx, 1);
                if (list.length === 0) map.delete(key);
            }
        }
    }

    clear() {
        this.functorIndex.clear();
        this.arityIndex.clear();
        this.signatureIndex.clear();
        this.allRules = [];
        // Re-initialize bloom filter
        this.bloom = new BloomFilter(this.bloom.size);
        this.stats = { hits: 0, misses: 0, fullScans: 0, bloomFilterSaves: 0 };
    }

    getStats() {
        return {
            ...this.stats,
            ruleCount: this.allRules.length,
            functorCount: this.functorIndex.size,
            arityCount: this.arityIndex.size,
            signatureCount: this.signatureIndex.size
        };
    }
}
