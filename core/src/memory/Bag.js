class ForgetPolicy {
    selectForRemoval(items, itemData, insertionOrder, accessTimes) {
    }

    orderItems(items, itemData, insertionOrder, accessTimes) {
    }
}

class PriorityForgetPolicy extends ForgetPolicy {
    selectForRemoval(items, itemData) {
        let min = Infinity, minItem = null;
        for (const [item, p] of itemData) {
            if (p < min) { min = p; minItem = item; }
        }
        return minItem;
    }

    orderItems(items, itemData) {
        return [...itemData.entries()]
            .sort(([, a], [, b]) => b - a)
            .map(([item]) => item);
    }
}

class LRUForgetPolicy extends ForgetPolicy {
    selectForRemoval(items, itemData, insertionOrder, accessTimes) {
        let min = Infinity, minItem = null;
        for (const [item, t] of accessTimes) {
            if (t < min) { min = t; minItem = item; }
        }
        return minItem;
    }

    orderItems(items, itemData, insertionOrder, accessTimes) {
        return [...accessTimes.entries()]
            .sort(([, a], [, b]) => b - a)
            .filter(([item]) => items.has(item))
            .map(([item]) => item);
    }
}

class FIFOForgetPolicy extends ForgetPolicy {
    selectForRemoval(items, itemData, insertionOrder) {
        return insertionOrder.find(item => items.has(item)) || null;
    }

    orderItems(items, itemData, insertionOrder) {
        return insertionOrder.filter(item => items.has(item));
    }
}

class RandomForgetPolicy extends ForgetPolicy {
    selectForRemoval(items) {
        const arr = [...items.keys()];
        return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
    }

    orderItems(items) {
        const arr = [...items.keys()];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
}

const DEFAULT_POLICY = 'priority';
const POLICIES = Object.freeze({
    'priority': new PriorityForgetPolicy(),
    'lru': new LRUForgetPolicy(),
    'fifo': new FIFOForgetPolicy(),
    'random': new RandomForgetPolicy()
});

export class Bag {
    constructor(maxSize, forgetPolicy = DEFAULT_POLICY, onItemRemoved = null) {
        this._items = new Map();
        this._itemKeys = new Map(); // Content Key -> Item
        this._maxSize = maxSize;
        this._insertionOrder = [];
        this._accessTimes = new Map();
        this.setForgetPolicy(forgetPolicy);
        this.onItemRemoved = onItemRemoved;
        this._cachedOrderedItems = null;
    }

    get size() {
        return this._items.size;
    }

    get maxSize() {
        return this._maxSize;
    }

    set maxSize(newSize) {
        if (newSize < this._maxSize) {
            while (this.size > newSize) {
                this._removeItemByPolicy();
            }
        }
        this._maxSize = newSize;
    }

    get forgetPolicy() {
        return this._forgetPolicyName;
    }

    setForgetPolicy(policy) {
        this._forgetPolicy = POLICIES[policy] || POLICIES[DEFAULT_POLICY];
        this._forgetPolicyName = policy;
    }

    _getKey(item) {
        return item && item.toString ? item.toString() : item;
    }

    add(item) {
        const key = this._getKey(item);
        if (this._itemKeys.has(key)) return false;

        // Double check referential equality just in case, though key check should suffice
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
        const result = this._items.delete(item);
        if (result) {
            const key = this._getKey(item);
            this._itemKeys.delete(key);

            this._insertionOrder = this._insertionOrder.filter(i => i !== item);
            this._accessTimes.delete(item);
            this._cachedOrderedItems = null;

            if (this.onItemRemoved) {
                try {
                    this.onItemRemoved(item);
                } catch (e) {
                    console.error('Error in Bag onItemRemoved callback:', e);
                }
            }
        }
        return result;
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
            this._cachedOrderedItems = this._forgetPolicy.orderItems(this._items, this._items, this._insertionOrder, this._accessTimes);
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
        for (const [item, priority] of this._items.entries()) {
            this._items.set(item, priority * (1 - decayRate));
        }
        // Invalidate cache if policy is not priority-based (e.g. random or potentially others)
        // For standard priority decay, relative order is preserved, so we might skip this.
        // But to be safe and address potential edge cases or mixed usage:
        this._cachedOrderedItems = null;
    }

    pruneTo(targetSize) {
        while (this.size > targetSize) {
            this._removeItemByPolicy();
        }
    }

    _removeItemByPolicy() {
        if (this.size > 0) {
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
                item: item.serialize ? item.serialize() : null,
                priority: priority
            })),
            insertionOrder: this._insertionOrder.map((item, index) => ({
                item: item.serialize ? item.serialize() : null,
                index: index
            })),
            accessTimes: Object.fromEntries([...this._accessTimes.entries()].map(([item, time]) => [
                JSON.stringify(item.serialize ? item.serialize() : item.toString ? item.toString() : item),
                time
            ])),
            version: '1.0.0'
        };
    }

    async deserialize(data, itemDeserializer = null) {
        try {
            if (!data) {
                throw new Error('Invalid bag data for deserialization');
            }

            this._maxSize = data.maxSize || this._maxSize;
            this._forgetPolicyName = data.forgetPolicyName || DEFAULT_POLICY;
            this.setForgetPolicy(this._forgetPolicyName);

            this.clear();

            if (data.items) {
                for (const {item: itemData, priority} of data.items) {
                    if (itemData) {
                        let item = null;
                        if (itemDeserializer) {
                            try {
                                item = await itemDeserializer(itemData);
                            } catch (e) {
                                console.warn('Failed to deserialize item in Bag:', e);
                            }
                        }

                        if (!item) {
                            item = {
                                budget: {priority: priority},
                                serialize: () => itemData,
                                toString: () => JSON.stringify(itemData)
                            };
                        }

                        // We use the internal method to force the exact priority from serialization
                        // instead of recalculating it from the item's budget
                        this._addItemToStorage(item, priority);
                        this._itemKeys.set(this._getKey(item), item);
                    }
                }
            }

            if (data.insertionOrder) {
                this._insertionOrder = data.insertionOrder.map((itemData, index) => {
                    return {
                        serialize: () => itemData.item,
                        toString: () => JSON.stringify(itemData.item)
                    };
                });
            }

            if (data.accessTimes) {
                // Process access times if needed
            }

            return true;
        } catch (error) {
            console.error('Error during bag deserialization:', error);
            return false;
        }
    }
}
