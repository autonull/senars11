/**
 * Bag.js
 *
 * A probabilistic priority queue implementation for NARS memory management.
 * Items are stored with associated priorities and removed based on a configurable forgetting policy.
 */

// --- Forget Policies ---

const PriorityForgetPolicy = {
    selectForRemoval(items, itemData) {
        let min = Infinity, minItem = null;
        for (const [item, p] of itemData) {
            if (p < min) { min = p; minItem = item; }
        }
        return minItem;
    },

    orderItems(items, itemData) {
        return [...itemData.entries()]
            .sort(([, a], [, b]) => b - a)
            .map(([item]) => item);
    }
};

const LRUForgetPolicy = {
    selectForRemoval(items, itemData, insertionOrder, accessTimes) {
        let min = Infinity, minItem = null;
        for (const [item, t] of accessTimes) {
            if (t < min) { min = t; minItem = item; }
        }
        return minItem;
    },

    orderItems(items, itemData, insertionOrder, accessTimes) {
        return [...accessTimes.entries()]
            .sort(([, a], [, b]) => b - a)
            .filter(([item]) => items.has(item))
            .map(([item]) => item);
    }
};

const FIFOForgetPolicy = {
    selectForRemoval(items, itemData, insertionOrder) {
        // Optimization: insertionOrder[0] is the oldest if we push to end and shift from start
        // But insertionOrder includes removed items in the original implementation (filtered later)
        // Let's stick to the find strategy for safety unless we refactor insertionOrder management heavily
        return insertionOrder.find(item => items.has(item)) || null;
    },

    orderItems(items, itemData, insertionOrder) {
        return insertionOrder.filter(item => items.has(item));
    }
};

const RandomForgetPolicy = {
    selectForRemoval(items) {
        // Reservoir sampling or just converting keys to array.
        // For standard Map, keys iterator is insertion ordered but we want random.
        // Converting to array is O(N).
        const size = items.size;
        if (size === 0) return null;
        const index = Math.floor(Math.random() * size);
        let i = 0;
        for (const key of items.keys()) {
            if (i === index) return key;
            i++;
        }
        return null;
    },

    orderItems(items) {
        const arr = [...items.keys()];
        // Fisher-Yates shuffle
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
};

const DEFAULT_POLICY = 'priority';
const POLICIES = Object.freeze({
    'priority': PriorityForgetPolicy,
    'lru': LRUForgetPolicy,
    'fifo': FIFOForgetPolicy,
    'random': RandomForgetPolicy
});

export class Bag {
    /**
     * @param {number} maxSize - Maximum capacity
     * @param {string} forgetPolicy - Policy name ('priority', 'lru', 'fifo', 'random')
     * @param {Function} [onItemRemoved] - Callback when item is removed
     */
    constructor(maxSize, forgetPolicy = DEFAULT_POLICY, onItemRemoved = null) {
        this._items = new Map(); // Item -> Priority
        this._itemKeys = new Map(); // Content Key -> Item
        this._maxSize = maxSize;
        this._insertionOrder = [];
        this._accessTimes = new Map();
        this.setForgetPolicy(forgetPolicy);
        this.onItemRemoved = onItemRemoved;
        this._cachedOrderedItems = null;
    }

    get size() { return this._items.size; }
    get maxSize() { return this._maxSize; }

    set maxSize(newSize) {
        if (newSize < this._maxSize) {
            this.pruneTo(newSize);
        }
        this._maxSize = newSize;
    }

    get forgetPolicy() { return this._forgetPolicyName; }

    setForgetPolicy(policy) {
        this._forgetPolicy = POLICIES[policy] || POLICIES[DEFAULT_POLICY];
        this._forgetPolicyName = policy;
        this._cachedOrderedItems = null;
    }

    _getKey(item) {
        return item && item.toString ? item.toString() : item;
    }

    add(item) {
        const key = this._getKey(item);
        if (this._itemKeys.has(key)) return false;

        // Double check referential equality just in case
        if (this._items.has(item)) return false;

        if (this.size >= this.maxSize) {
            this._removeItemByPolicy();
        }

        const priority = item.budget?.priority ?? 0;
        this._addItemToStorage(item, priority);
        this._itemKeys.set(key, item);
        this._cachedOrderedItems = null;

        return true;
    }

    _addItemToStorage(item, priority) {
        this._items.set(item, priority);
        this._insertionOrder.push(item);
        this._accessTimes.set(item, Date.now());
    }

    remove(item) {
        if (!this._items.has(item)) return false;

        this._items.delete(item);
        const key = this._getKey(item);
        this._itemKeys.delete(key);
        this._accessTimes.delete(item);

        // Clean up insertion order lazily? No, existing logic filters it eagerly.
        // Optimization: filter is O(N). If remove is frequent, this is slow.
        // But for now, keeping behavior consistent.
        this._insertionOrder = this._insertionOrder.filter(i => i !== item);

        this._cachedOrderedItems = null;

        if (this.onItemRemoved) {
            try {
                this.onItemRemoved(item);
            } catch (e) {
                console.error('Error in Bag onItemRemoved callback:', e);
            }
        }
        return true;
    }

    contains(item) {
        const key = this._getKey(item);
        return this._itemKeys.has(key);
    }

    find(predicate) {
        for (const item of this._items.keys()) {
            if (predicate(item)) return item;
        }
        return null;
    }

    peek() {
        if (this.size === 0) return null;
        const orderedItems = this.getItemsInPriorityOrder();
        return orderedItems[0] || null;
    }

    getItemsInPriorityOrder() {
        if (!this._cachedOrderedItems) {
            this._cachedOrderedItems = this._forgetPolicy.orderItems(
                this._items,
                this._items,
                this._insertionOrder,
                this._accessTimes
            );
        }
        return this._cachedOrderedItems;
    }

    getAveragePriority() {
        if (this.size === 0) return 0;
        let sum = 0;
        for (const priority of this._items.values()) {
            sum += priority;
        }
        return sum / this._items.size;
    }

    getPriority(item) {
        return this._items.get(item);
    }

    applyDecay(decayRate) {
        // Optimized: iterate entries directly
        const factor = 1 - decayRate;
        for (const [item, priority] of this._items) {
            this._items.set(item, priority * factor);
        }
        // Invalidate cache only if strict ordering might change (rare for uniform decay)
        // But to be safe:
        this._cachedOrderedItems = null;
    }

    pruneTo(targetSize) {
        while (this.size > targetSize) {
            this._removeItemByPolicy();
        }
    }

    _removeItemByPolicy() {
        if (this.size === 0) return;

        const itemToRemove = this._forgetPolicy.selectForRemoval(
            this._items,
            this._items,
            this._insertionOrder,
            this._accessTimes
        );

        if (itemToRemove !== null) {
            this.remove(itemToRemove);
        }
    }

    clear() {
        this._items.clear();
        this._itemKeys.clear();
        this._insertionOrder = [];
        this._accessTimes.clear();
        this._cachedOrderedItems = null;
    }

    serialize() {
        return {
            maxSize: this._maxSize,
            forgetPolicyName: this._forgetPolicyName,
            items: Array.from(this._items.entries()).map(([item, priority]) => ({
                item: item.serialize ? item.serialize() : item.toString(),
                priority: priority
            })),
            insertionOrder: this._insertionOrder.map((item, index) => ({
                item: item.serialize ? item.serialize() : item.toString(),
                index: index
            })),
            // Access times not critical for serialization usually, but keeping for completeness
            // Simplify structure to avoid JSON key issues with objects
            version: '1.0.0'
        };
    }

    async deserialize(data, itemDeserializer = null) {
        try {
            if (!data) throw new Error('Invalid bag data');

            this._maxSize = data.maxSize || this._maxSize;
            this.setForgetPolicy(data.forgetPolicyName || DEFAULT_POLICY);
            this.clear();

            if (Array.isArray(data.items)) {
                for (const {item: itemData, priority} of data.items) {
                    if (!itemData) continue;

                    let item = null;
                    if (itemDeserializer) {
                        try {
                            item = await itemDeserializer(itemData);
                        } catch (e) {
                            console.warn('Failed to deserialize item in Bag:', e);
                        }
                    }

                    if (!item) {
                        // Fallback proxy object
                        item = {
                            budget: {priority: priority},
                            serialize: () => itemData,
                            toString: () => typeof itemData === 'string' ? itemData : JSON.stringify(itemData)
                        };
                    }

                    this._addItemToStorage(item, priority);
                    this._itemKeys.set(this._getKey(item), item);
                }
            }

            // Reconstruct insertion order from data if available, otherwise use loaded items order
            if (Array.isArray(data.insertionOrder)) {
                 // Map indices to items is tricky without ID, but strict order reconstruction
                 // requires matching deserialized items.
                 // For now, rely on _addItemToStorage pushing to insertionOrder.
                 // If data.insertionOrder is needed for FIFO strictness, we'd need ID mapping.
                 // The simplified loop above preserves order if data.items is ordered or if we trust the push.
            }

            return true;
        } catch (error) {
            console.error('Error during bag deserialization:', error);
            return false;
        }
    }
}
