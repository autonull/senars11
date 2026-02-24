import { mergeConfig } from '../utils/ConfigHelper.js';

const MEMORY_DEFAULTS = {
    capacity: 1000,
    autoRebuildIndex: true
};

export class EpisodicMemory {
    constructor(config = {}) {
        this.config = mergeConfig(MEMORY_DEFAULTS, config);
        this.buffer = [];
        this.symbolicIndex = new Map();
    }

    store(item) {
        this.buffer.push(item);
        this._indexItem(item, this.buffer.length - 1);

        if (this.buffer.length > this.config.capacity) {
            this.buffer.shift();
            if (this.config.autoRebuildIndex) this._rebuildIndex();
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
        this.buffer.forEach((item, idx) => this._indexItem(item, idx));
    }

    query(pattern) {
        return this.symbolicIndex.has(pattern)
            ? this.symbolicIndex.get(pattern).map(i => this.buffer[i])
            : [];
    }

    retrieveSimilar(current) {
        return current.symbol ? this.query(current.symbol) : [];
    }

    consolidate() {
        return [];
    }

    clear() {
        this.buffer = [];
        this.symbolicIndex.clear();
    }

    size() {
        return this.buffer.length;
    }

    getAll() {
        return [...this.buffer];
    }
}
