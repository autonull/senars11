/**
 * Shared data structures for RL components
 */
import { generateId as _genId } from '@senars/core';

export class SumTree {
    constructor(capacity) {
        this.capacity = capacity;
        this.tree = new Float64Array(2 * capacity);
        this.size = 0;
    }

    update(idx, priority) {
        let currentIdx = idx + this.capacity;
        this.tree[currentIdx] = Math.pow(priority + 1e-6, 0.6);

        while (currentIdx > 1) {
            currentIdx = currentIdx >> 1;
            this.tree[currentIdx] = this.tree[2 * currentIdx] + this.tree[2 * currentIdx + 1];
        }

        if (this.size <= idx) {
            this.size = idx + 1;
        }
    }

    find(value) {
        let idx = 1;

        while (idx < this.capacity) {
            const left = 2 * idx;
            if (value <= this.tree[left]) {
                idx = left;
            } else {
                value -= this.tree[left];
                idx = left + 1;
            }
        }

        return idx - this.capacity;
    }

    sample(k) {
        const indices = [];
        const segmentSize = this.total / k;
        for (let i = 0; i < k; i++) {
            const target = segmentSize * i + Math.random() * segmentSize;
            indices.push(this.find(target));
        }
        return indices;
    }

    get total() {
        return this.tree[1];
    }

    clear() {
        this.tree.fill(0);
        this.size = 0;
    }
}

export class PrioritizedBuffer {
    constructor(capacity) {
        this.capacity = capacity;
        this.sumTree = new SumTree(capacity);
        this.data = new Array(capacity).fill(null);
        this.writeIdx = 0;
        this.size = 0;
    }

    add(item, priority = 1.0) {
        this.data[this.writeIdx] = item;
        this.sumTree.update(this.writeIdx, priority);
        this.writeIdx = (this.writeIdx + 1) % this.capacity;
        this.size = Math.min(this.size + 1, this.capacity);
    }

    sample(k) {
        const indices = this.sumTree.sample(k);
        return indices.map(i => this.data[i]).filter(d => d !== null);
    }

    updatePriority(idx, priority) {
        this.sumTree.update(idx, priority);
    }

    get length() {
        return this.size;
    }

    clear() {
        this.data.fill(null);
        this.sumTree.clear();
        this.size = 0;
        this.writeIdx = 0;
    }
}

export class CircularBuffer {
    constructor(capacity) {
        this.capacity = capacity;
        this.buffer = [];
    }

    push(item) {
        if (this.buffer.length >= this.capacity) {
            this.buffer.shift();
        }
        this.buffer.push(item);
    }

    get(idx) {
        return this.buffer[idx];
    }

    at(idx) {
        return this.buffer.at(idx);
    }

    get length() {
        return this.buffer.length;
    }

    clear() {
        this.buffer = [];
    }

    toArray() {
        return [...this.buffer];
    }

    slice(start, end) {
        return this.buffer.slice(start, end);
    }

    filter(fn) {
        return this.buffer.filter(fn);
    }

    map(fn) {
        return this.buffer.map(fn);
    }

    reduce(fn, initial) {
        return this.buffer.reduce(fn, initial);
    }

    find(fn) {
        return this.buffer.find(fn);
    }

    forEach(fn) {
        this.buffer.forEach(fn);
    }
}

export class Index {
    constructor() {
        this.byKey = new Map();
        this.timeline = [];
    }

    add(key, id) {
        if (!this.byKey.has(key)) {
            this.byKey.set(key, new Set());
        }
        this.byKey.get(key).add(id);
        this.timeline.push(id);
    }

    remove(id) {
        for (const set of this.byKey.values()) {
            set.delete(id);
        }
        const idx = this.timeline.indexOf(id);
        if (idx >= 0) this.timeline.splice(idx, 1);
    }

    get(key) {
        return this.byKey.get(key) ?? new Set();
    }

    query(keys) {
        if (!keys || keys.length === 0) {
            return new Set(this.timeline);
        }

        const sets = keys.map(k => this.byKey.get(k) ?? new Set());
        const result = new Set(sets[0]);
        for (const set of sets.slice(1)) {
            for (const item of result) {
                if (!set.has(item)) result.delete(item);
            }
        }
        return result;
    }

    get stats() {
        return {
            total: this.timeline.length,
            keys: this.byKey.size
        };
    }

    clear() {
        this.byKey.clear();
        this.timeline = [];
    }
}

export function generateId(prefix = 'id') {
    return _genId(prefix);
}

export function serializeValue(value) {
    if (value?.data) return Array.from(value.data);
    if (Array.isArray(value)) return [...value];
    return value;
}

export function hashState(state, decimals = 1) {
    const factor = Math.pow(10, decimals);
    return Array.isArray(state)
        ? state.map(x => Math.round(x * factor) / factor).join('_')
        : String(state);
}
