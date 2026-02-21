
// Episodic buffer enriched with symbolic annotations
export class WorkingMemory {
    constructor(capacity = 1000) {
        this.capacity = capacity;
        this.buffer = [];
        this.symbolicIndex = new Map(); // Symbol -> List of Indices
    }

    /**
     * Store a trajectory or transition with symbolic labels.
     * @param {Object} item {(s,a,r,s')} with symbolic labels
     */
    store(item) {
        const index = this.buffer.length;
        this.buffer.push(item);

        // Index by symbol if available
        if (item.symbol) {
            if (!this.symbolicIndex.has(item.symbol)) {
                this.symbolicIndex.set(item.symbol, []);
            }
            this.symbolicIndex.get(item.symbol).push(index);
        }

        if (this.buffer.length > this.capacity) {
            // Remove oldest
            const removed = this.buffer.shift();
            // Need to update indices in Map or rebuild
            // Simple: Rebuild index (expensive) or just shift indices?
            // For now, let's just clear index occasionally or keep it simple.
            // If we remove index 0, all indices shift down by 1.

            // Rebuilding index for simplicity
            this.symbolicIndex.clear();
            this.buffer.forEach((it, idx) => {
                if (it.symbol) {
                    if (!this.symbolicIndex.has(it.symbol)) {
                        this.symbolicIndex.set(it.symbol, []);
                    }
                    this.symbolicIndex.get(it.symbol).push(idx);
                }
            });
        }
    }

    /**
     * Query memory using symbolic pattern matching.
     * @param {*} pattern
     * @returns {Array} matching items
     */
    query(pattern) {
        if (this.symbolicIndex.has(pattern)) {
            const indices = this.symbolicIndex.get(pattern);
            return indices.map(i => this.buffer[i]);
        }
        return [];
    }

    /**
     * Retrieve similar episodes based on current situation (analogical retrieval).
     * @param {*} current
     * @returns {Array} similar items
     */
    retrieveSimilar(current) {
        // Placeholder: find items with same symbol first
        if (current.symbol) {
            return this.query(current.symbol);
        }

        // If vector, compute similarity (expensive without index)
        return [];
    }

    /**
     * Consolidate memory to extract rules/skills from episodes.
     */
    consolidate() {
        // Identify frequent patterns
        // This is where RuleInducer would process episodes
        // Return structured summaries or rule candidates
        return [];
    }
}
