/**
 * Collection Utilities
 * Common operations for Map, Set, and Array manipulations.
 */

export const CollectionUtils = {
    mergeMaps: (base, ...sources) => {
        const result = new Map(base);
        sources.forEach(source => {
            if (!source) return;
            source.forEach((value, key) => result.set(key, value));
        });
        return result;
    },

    mergeSets: (...sets) => {
        const result = new Set();
        sets.forEach(set => {
            if (!set) return;
            set.forEach(item => result.add(item));
        });
        return result;
    },

    intersectSets: (set1, set2) => {
        const result = new Set();
        for (const item of set1) {
            if (set2.has(item)) result.add(item);
        }
        return result;
    },

    differenceSets: (set1, set2) => {
        const result = new Set(set1);
        for (const item of set2) {
            result.delete(item);
        }
        return result;
    },

    groupBy: (array, keyFn) => {
        const groups = new Map();
        array.forEach(item => {
            const key = keyFn(item);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(item);
        });
        return groups;
    },

    partition: (array, predicate) => {
        const pass = [];
        const fail = [];
        array.forEach(item => (predicate(item) ? pass : fail).push(item));
        return [pass, fail];
    },

    unique: (array, keyFn) => {
        if (!keyFn) return [...new Set(array)];
        const seen = new Set();
        return array.filter(item => {
            const key = keyFn(item);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    },

    flatten: (array) => array.flat(),

    flattenDeep: (array) => array.flat(Infinity),

    chunk: (array, size) => {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    },

    zip: (...arrays) => {
        const len = Math.min(...arrays.map(a => a.length));
        return Array.from({ length: len }, (_, i) => arrays.map(a => a[i]));
    },

    unzip: (arrayOfArrays) => {
        if (!arrayOfArrays.length) return [];
        const len = Math.min(...arrayOfArrays.map(a => a.length));
        return Array.from({ length: len }, (_, i) =>
            arrayOfArrays.map(a => a[i])
        );
    },

    sortBy: (array, keyFn, ascending = true) => {
        return [...array].sort((a, b) => {
            const keyA = keyFn(a);
            const keyB = keyFn(b);
            const cmp = keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
            return ascending ? cmp : -cmp;
        });
    },

    minBy: (array, keyFn) => {
        if (!array.length) return undefined;
        return array.reduce((min, item) =>
            keyFn(item) < keyFn(min) ? item : min
        );
    },

    maxBy: (array, keyFn) => {
        if (!array.length) return undefined;
        return array.reduce((max, item) =>
            keyFn(item) > keyFn(max) ? item : max
        );
    },

    sumBy: (array, keyFn) => {
        return array.reduce((sum, item) => sum + (keyFn?.(item) ?? item), 0);
    },

    averageBy: (array, keyFn) => {
        if (!array.length) return 0;
        return CollectionUtils.sumBy(array, keyFn) / array.length;
    },

    countBy: (array, keyFn) => {
        const counts = new Map();
        array.forEach(item => {
            const key = keyFn?.(item) ?? item;
            counts.set(key, (counts.get(key) ?? 0) + 1);
        });
        return counts;
    },

    toMap: (array, keyFn, valueFn) => {
        return new Map(
            array.map(item => [keyFn(item), valueFn?.(item) ?? item])
        );
    },

    toObject: (array, keyFn, valueFn) => {
        return Object.fromEntries(
            array.map(item => [keyFn(item), valueFn?.(item) ?? item])
        );
    },

    compact: (array) => array.filter(Boolean),

    without: (array, ...values) => {
        const exclude = new Set(values);
        return array.filter(item => !exclude.has(item));
    },

    take: (array, n) => array.slice(0, n),

    takeRight: (array, n) => array.slice(-n),

    drop: (array, n) => array.slice(n),

    dropRight: (array, n) => array.slice(0, -n),

    fill: (array, value, start = 0, end = array.length) => {
        const result = [...array];
        for (let i = start; i < end; i++) {
            result[i] = value;
        }
        return result;
    },

    range: (start, end, step = 1) => {
        if (end === undefined) {
            end = start;
            start = 0;
        }
        const result = [];
        for (let i = start; step > 0 ? i < end : i > end; i += step) {
            result.push(i);
        }
        return result;
    }
};

export const {
    mergeMaps,
    mergeSets,
    intersectSets,
    differenceSets,
    groupBy,
    partition,
    unique,
    flatten,
    flattenDeep,
    chunk,
    zip,
    unzip,
    sortBy,
    minBy,
    maxBy,
    sumBy,
    averageBy,
    countBy,
    toMap,
    toObject,
    compact,
    without,
    take,
    takeRight,
    drop,
    dropRight,
    fill,
    range
} = CollectionUtils;

export default CollectionUtils;
