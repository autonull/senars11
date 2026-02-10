export class BagBuffer {
    constructor(capacity = 100) {
        this.capacity = capacity;
        this.items = new Map(); // id -> { id, priority, data }
    }

    add(id, priority, data) {
        // Update existing or add new
        this.items.set(id, { id, priority, data });
        this._enforceCapacity();
    }

    decay(factor = 0.99, threshold = 0.05) {
        const removedIds = [];
        for (const [id, item] of this.items) {
            // Apply decay
            item.priority *= factor;

            // Remove if below threshold
            if (item.priority < threshold) {
                this.items.delete(id);
                removedIds.push(id);
            }
        }
        return removedIds;
    }

    remove(id) {
        this.items.delete(id);
    }

    get(id) {
        return this.items.get(id);
    }

    getAll() {
        return Array.from(this.items.values());
    }

    _enforceCapacity() {
        if (this.items.size <= this.capacity) return;

        // Convert to array to sort
        const entries = Array.from(this.items.entries());
        // Sort by priority ascending (lowest first)
        // If priorities are equal, maybe use data.timestamp? For now just priority.
        entries.sort((a, b) => a[1].priority - b[1].priority);

        // Remove items until capacity is met
        const toRemove = this.items.size - this.capacity;
        for (let i = 0; i < toRemove; i++) {
            this.items.delete(entries[i][0]);
        }
    }

    clear() {
        this.items.clear();
    }
}
