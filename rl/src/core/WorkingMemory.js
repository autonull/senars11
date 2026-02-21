
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
        this.buffer.push(item);
        this._indexItem(item, this.buffer.length - 1);

        if (this.buffer.length > this.capacity) {
            this.buffer.shift();
            // Rebuild index occasionally or lazily?
            // For simplicity/correctness in this reference impl, we rebuild.
            this._rebuildIndex();
        }
    }

    _indexItem(item, index) {
        if (!item.symbol) return;

        if (!this.symbolicIndex.has(item.symbol)) {
            this.symbolicIndex.set(item.symbol, []);
        }
        this.symbolicIndex.get(item.symbol).push(index);
    }

    _rebuildIndex() {
        this.symbolicIndex.clear();
        this.buffer.forEach((it, idx) => this._indexItem(it, idx));
    }

    /**
     * Query memory using symbolic pattern matching.
     * @param {*} pattern
     * @returns {Array} matching items
     */
    query(pattern) {
        return this.symbolicIndex.has(pattern)
            ? this.symbolicIndex.get(pattern).map(i => this.buffer[i])
            : [];
    }

    /**
     * Retrieve similar episodes based on current situation (analogical retrieval).
     * @param {*} current
     * @returns {Array} similar items
     */
    retrieveSimilar(current) {
        return current.symbol ? this.query(current.symbol) : [];
    }

    /**
     * Consolidate memory to extract rules/skills from episodes.
     */
    consolidate() {
        // Placeholder for rule induction trigger
        return [];
    }
}
