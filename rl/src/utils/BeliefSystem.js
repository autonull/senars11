/**
 * Belief System
 * Unified utilities for belief management, revision, and inference.
 * Deeply deduplicated from repeated patterns across cognitive modules.
 */

/**
 * Belief class representing a single belief
 */
export class Belief {
    constructor(content, confidence = 1.0, metadata = {}) {
        this.content = content;
        this.confidence = confidence;
        this.timestamp = Date.now();
        this.metadata = { ...metadata };
        this.source = metadata.source ?? 'unknown';
        this.evidence = metadata.evidence ?? [];
    }

    /**
     * Update belief with new evidence
     */
    update(newConfidence, metadata = {}) {
        this.confidence = (this.confidence + newConfidence) / 2;
        this.timestamp = Date.now();
        if (metadata) {
            this.metadata = { ...this.metadata, ...metadata };
        }
        return this;
    }

    /**
     * Add evidence to belief
     */
    addEvidence(evidence) {
        this.evidence.push(evidence);
        return this;
    }

    /**
     * Check if belief is still valid
     */
    isValid(minConfidence = 0.1, maxAge = null) {
        if (this.confidence < minConfidence) return false;
        if (maxAge && Date.now() - this.timestamp > maxAge) return false;
        return true;
    }

    /**
     * Serialize belief
     */
    toJSON() {
        return {
            content: this.content,
            confidence: this.confidence,
            timestamp: this.timestamp,
            metadata: this.metadata,
            source: this.source,
            evidence: this.evidence
        };
    }

    /**
     * Deserialize belief
     */
    static fromJSON(json) {
        const belief = new Belief(json.content, json.confidence, json.metadata);
        belief.timestamp = json.timestamp ?? Date.now();
        belief.source = json.source ?? 'unknown';
        belief.evidence = json.evidence ?? [];
        return belief;
    }
}

/**
 * BeliefSystem manages a collection of beliefs with revision and decay
 */
export class BeliefSystem {
    constructor(config = {}) {
        this.beliefs = new Map();
        this.config = {
            decayRate: config.decayRate ?? 0.05,  // per minute
            minConfidence: config.minConfidence ?? 0.1,
            maxBeliefs: config.maxBeliefs ?? 1000,
            revisionThreshold: config.revisionThreshold ?? 0.3,
            ...config
        };
        this.history = [];
    }

    /**
     * Add or update a belief
     */
    update(key, content, confidence = 1.0, metadata = {}) {
        const existing = this.beliefs.get(key);
        
        if (existing) {
            // Belief revision
            const diff = Math.abs(existing.confidence - confidence);
            
            if (diff > this.config.revisionThreshold) {
                // Significant revision - average
                existing.update(confidence, metadata);
            } else {
                // Minor update - boost confidence
                existing.confidence = Math.min(1.0, existing.confidence + 0.1);
                existing.timestamp = Date.now();
            }
        } else {
            // New belief
            if (this.beliefs.size >= this.config.maxBeliefs) {
                this.prune();
            }
            this.beliefs.set(key, new Belief(content, confidence, metadata));
        }
        
        this._recordHistory('update', key);
        return this;
    }

    /**
     * Get a belief by key
     */
    get(key) {
        return this.beliefs.get(key);
    }

    /**
     * Check if belief exists
     */
    has(key) {
        return this.beliefs.has(key);
    }

    /**
     * Remove a belief
     */
    remove(key) {
        const removed = this.beliefs.delete(key);
        if (removed) {
            this._recordHistory('remove', key);
        }
        return removed;
    }

    /**
     * Get all beliefs matching predicate
     */
    query(predicate) {
        const results = [];
        for (const [key, belief] of this.beliefs) {
            if (predicate(belief, key)) {
                results.push({ key, belief });
            }
        }
        return results;
    }

    /**
     * Get beliefs by confidence threshold
     */
    getByConfidence(minConfidence) {
        return this.query((b) => b.confidence >= minConfidence);
    }

    /**
     * Get beliefs by content pattern
     */
    getByPattern(pattern) {
        if (typeof pattern === 'string') {
            return this.query((b) => b.content?.includes?.(pattern));
        }
        if (pattern instanceof RegExp) {
            return this.query((b) => pattern.test(String(b.content)));
        }
        return this.query((b) => pattern(b.content));
    }

    /**
     * Apply time-based decay to all beliefs
     */
    decay() {
        const now = Date.now();
        const removed = [];
        
        for (const [key, belief] of this.beliefs) {
            const age = (now - belief.timestamp) / 60000;  // minutes
            belief.confidence *= Math.exp(-age * this.config.decayRate);
            
            if (!belief.isValid(this.config.minConfidence)) {
                removed.push(key);
                this.beliefs.delete(key);
            }
        }
        
        if (removed.length > 0) {
            this._recordHistory('decay', null, { removed });
        }
        
        return { decayed: this.beliefs.size, removed: removed.length };
    }

    /**
     * Prune low-confidence beliefs
     */
    prune(count = null) {
        const entries = Array.from(this.beliefs.entries())
            .sort((a, b) => a[1].confidence - b[1].confidence);
        
        const toRemove = count ?? Math.floor(this.beliefs.size * 0.1);
        const removed = [];
        
        for (let i = 0; i < Math.min(toRemove, entries.length); i++) {
            const [key] = entries[i];
            this.beliefs.delete(key);
            removed.push(key);
        }
        
        this._recordHistory('prune', null, { removed, count: toRemove });
        return removed;
    }

    /**
     * Combine two belief systems
     */
    merge(other, strategy = 'average') {
        for (const [key, belief] of other.beliefs) {
            const existing = this.beliefs.get(key);
            
            if (existing) {
                switch (strategy) {
                    case 'average':
                        existing.confidence = (existing.confidence + belief.confidence) / 2;
                        break;
                    case 'max':
                        existing.confidence = Math.max(existing.confidence, belief.confidence);
                        break;
                    case 'min':
                        existing.confidence = Math.min(existing.confidence, belief.confidence);
                        break;
                    case 'product':
                        existing.confidence = existing.confidence * belief.confidence;
                        break;
                }
                existing.timestamp = Date.now();
            } else {
                this.beliefs.set(key, Belief.fromJSON(belief.toJSON()));
            }
        }
        
        return this;
    }

    /**
     * Get belief statistics
     */
    getStats() {
        const confidences = Array.from(this.beliefs.values()).map(b => b.confidence);
        
        return {
            count: this.beliefs.size,
            avgConfidence: confidences.reduce((a, b) => a + b, 0) / confidences.length || 0,
            minConfidence: Math.min(...confidences, 0),
            maxConfidence: Math.max(...confidences, 1),
            historyLength: this.history.length
        };
    }

    /**
     * Clear all beliefs
     */
    clear() {
        this.beliefs.clear();
        this._recordHistory('clear', null);
        return this;
    }

    /**
     * Export beliefs to JSON
     */
    toJSON() {
        return {
            beliefs: Object.fromEntries(
                Array.from(this.beliefs.entries()).map(([k, v]) => [k, v.toJSON()])
            ),
            config: this.config,
            stats: this.getStats()
        };
    }

    /**
     * Import beliefs from JSON
     */
    static fromJSON(json, config = {}) {
        const system = new BeliefSystem(config);
        
        for (const [key, beliefJson] of Object.entries(json.beliefs ?? {})) {
            system.beliefs.set(key, Belief.fromJSON(beliefJson));
        }
        
        return system;
    }

    /**
     * Record history entry
     */
    _recordHistory(action, key, data = {}) {
        this.history.push({
            action,
            key,
            timestamp: Date.now(),
            ...data
        });
        
        // Keep history bounded
        if (this.history.length > 1000) {
            this.history.shift();
        }
    }
}

/**
 * Inference utilities for belief-based reasoning
 */
export const InferenceUtils = {
    /**
     * Transitive inference: A->B, B->C => A->C
     */
    transitive: (belief1, belief2) => {
        if (!belief1 || !belief2) return null;
        
        // Simple heuristic: can combine if they share structure
        const key1 = String(belief1.content).split('_')[0];
        const key2 = String(belief2.content).split('_')[0];
        
        if (key1 === key2) {
            return {
                content: `${belief1.content}_${belief2.content}`,
                confidence: (belief1.confidence + belief2.confidence) / 2
            };
        }
        
        return null;
    },

    /**
     * Modus ponens: If P then Q, P => Q
     */
    modusPonens: (conditional, antecedent) => {
        if (!conditional || !antecedent) return null;
        
        const condStr = String(conditional.content);
        const antStr = String(antecedent.content);
        
        if (condStr.includes('if') && condStr.includes(antStr)) {
            // Extract consequent (simplified)
            const parts = condStr.split('then');
            if (parts.length > 1) {
                return {
                    content: parts[1].trim(),
                    confidence: conditional.confidence * antecedent.confidence
                };
            }
        }
        
        return null;
    },

    /**
     * Belief aggregation from multiple sources
     */
    aggregate: (beliefs, method = 'weighted') => {
        if (!beliefs || beliefs.length === 0) return null;
        
        switch (method) {
            case 'average': {
                const avgConf = beliefs.reduce((s, b) => s + b.confidence, 0) / beliefs.length;
                return {
                    content: beliefs[0].content,
                    confidence: avgConf
                };
            }
            
            case 'weighted': {
                const totalWeight = beliefs.reduce((s, b) => s + b.confidence, 0);
                const weightedContent = beliefs.reduce((s, b) => 
                    s + String(b.content) * b.confidence, 0);
                return {
                    content: weightedContent / totalWeight,
                    confidence: totalWeight / beliefs.length
                };
            }
            
            case 'max': {
                const maxBelief = beliefs.reduce((max, b) => 
                    b.confidence > max.confidence ? b : max);
                return { ...maxBelief };
            }
            
            default:
                return beliefs[0];
        }
    }
};

/**
 * Belief system utilities namespace
 */
export const BeliefUtils = {
    Belief,
    BeliefSystem,
    ...InferenceUtils
};

export default BeliefUtils;
