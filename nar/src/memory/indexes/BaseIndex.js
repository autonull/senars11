/**
 * Base class for all indexes in MemoryIndex
 */
export class BaseIndex {
    constructor(config = {}) {
        this.config = config;
    }

    add(concept) {
        throw new Error('Method not implemented');
    }

    remove(concept) {
        throw new Error('Method not implemented');
    }

    find(filters = {}) {
        throw new Error('Method not implemented');
    }

    update(concept, updates) {
        this.remove(concept);
        Object.assign(concept, updates);
        this.add(concept);
    }

    clear() {
        throw new Error('Method not implemented');
    }

    getAll() {
        throw new Error('Method not implemented');
    }
}