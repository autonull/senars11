export const IndexUtils = Object.freeze({
    addToIndex: (indexes, index, key, value) => {
        if (!indexes[index].has(key)) {
            indexes[index].set(key, new Set());
        }
        indexes[index].get(key).add(value);
    },

    removeFromIndex: (indexes, index, key, value) => {
        if (indexes[index].has(key)) {
            const set = indexes[index].get(key);
            set.delete(value);
            if (set.size === 0) indexes[index].delete(key);
        }
    },

    addMultipleToIndex: (indexes, indexEntries) => {
        for (const { index, key, value } of indexEntries) {
            IndexUtils.addToIndex(indexes, index, key, value);
        }
    },

    removeMultipleFromIndex: (indexes, indexEntries) => {
        for (const { index, key, value } of indexEntries) {
            IndexUtils.removeFromIndex(indexes, index, key, value);
        }
    }
});