/**
 * MemoizationCache.js
 * Implements an AIKR-compliant cache with WeakMap key lookup and fixed capacity (LRU) value storage.
 */

class DoublyLinkedList {
    constructor() {
        this.head = this.tail = null;
        this.size = 0;
    }

    addToHead(node) {
        if (this.head === node) return;
        if (node.prev) node.prev.next = node.next;
        if (node.next) node.next.prev = node.prev;

        if (this.tail === node) this.tail = node.prev;

        node.prev = null;
        node.next = this.head;
        if (this.head) this.head.prev = node;
        this.head = node;
        if (!this.tail) this.tail = node;
    }

    removeTail() {
        if (!this.tail) return null;
        const node = this.tail;
        if (node.prev) node.prev.next = null;
        else this.head = null;

        this.tail = node.prev;
        node.prev = node.next = null;
        return node;
    }

    clear() {
        this.head = this.tail = null;
        this.size = 0;
    }
}

export class MemoizationCache {
    constructor(capacity = 1000) {
        this.capacity = capacity;
        this.map = new WeakMap();
        this.stringMap = new Map(); // Phase P1-E: String-key map for ground atoms
        this.lru = new DoublyLinkedList();
        this.size = 0;
        this.stats = {hits: 0, misses: 0, evictions: 0};
    }

    get(term) {
        if (!term || typeof term !== 'object') return undefined;
        const node = this.map.get(term);

        if (node && !node.isEvicted) {
            this.stats.hits++;
            this.lru.addToHead(node);
            return node.value;
        }
        this.stats.misses++;
        return undefined;
    }

    set(term, value) {
        if (!term || typeof term !== 'object') return;
        let node = this.map.get(term);

        if (node) {
            if (node.isEvicted) { // Resurrection
                node.isEvicted = false;
                node.value = value;
                this.size++;
            } else {
                node.value = value;
            }
            this.lru.addToHead(node);
        } else {
            node = {value, prev: null, next: null, isEvicted: false};
            this.map.set(term, node);
            this.lru.addToHead(node);
            this.size++;
        }

        if (this.size > this.capacity) this.evict();
    }

    evict() {
        const tail = this.lru.removeTail();
        if (tail) {
            tail.value = null; // Release strong ref
            tail.isEvicted = true;
            this.size--;
            this.stats.evictions++;
        }
    }

    clear() {
        // Invalidate all nodes
        let curr = this.lru.head;
        while (curr) {
            curr.value = null;
            curr.isEvicted = true;
            curr = curr.next;
        }
        this.lru.clear();
        this.size = 0;
    }

    getStats() {
        return {size: this.size, capacity: this.capacity, ...this.stats};
    }
}
