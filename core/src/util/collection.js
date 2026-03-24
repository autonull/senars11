/**
 * Collection utilities for SeNARS
 */

/**
 * Sort array by property
 * @param {Array} items - Items to sort
 * @param {string} prop - Property to sort by
 * @param {boolean} desc - Sort descending
 * @returns {Array} Sorted array
 */
export const sortByProperty = (items, prop, desc = false) => {
    if (!Array.isArray(items) || items.length === 0) return [];
    return [...items].sort((a, b) => {
        const aVal = a[prop] ?? 0;
        const bVal = b[prop] ?? 0;
        return desc ? bVal - aVal : aVal - bVal;
    });
};

/**
 * Filter array by predicate
 * @param {Array} items - Items to filter
 * @param {Function} predicate - Predicate function
 * @returns {Array} Filtered array
 */
export const filterBy = (items, predicate) => items.filter(predicate);

/**
 * Find first item matching predicate
 * @param {Array} items - Items to search
 * @param {Function} predicate - Predicate function
 * @returns {*} First matching item or undefined
 */
export const findBy = (items, predicate) => items.find(predicate);

/**
 * Group array items by a key function
 * @param {Array} items - Items to group
 * @param {Function} keyFn - Key function
 * @returns {Object} Grouped items
 */
export const groupBy = (items, keyFn) => {
    if (!Array.isArray(items) || items.length === 0) return {};
    return items.reduce((groups, item) => {
        const key = keyFn(item) ?? 'unknown';
        (groups[key] ??= []).push(item);
        return groups;
    }, {});
};

/**
 * Apply function to all items
 * @param {Array} items - Items
 * @param {Function} fn - Function to apply
 */
export const applyToAll = (items, fn) => items.forEach(fn);

/**
 * Create a Map from array
 * @param {Array} items - Items
 * @param {Function} keyFn - Key function
 * @param {Function} valueFn - Value function (default: identity)
 * @returns {Map} Created Map
 */
export const createMap = (items, keyFn, valueFn = x => x) =>
    Array.isArray(items) ? new Map(items.map(item => [keyFn(item), valueFn(item)])) : new Map();

/**
 * Create a Set from array
 * @param {Array} items - Items
 * @param {Function} keyFn - Key function (default: identity)
 * @returns {Set} Created Set
 */
export const createSet = (items, keyFn = x => x) =>
    Array.isArray(items) ? new Set(items.map(keyFn)) : new Set();

/**
 * Chunk an array into smaller arrays
 * @param {Array} array - Array to chunk
 * @param {number} size - Chunk size
 * @returns {Array} Array of chunks
 */
export const chunk = (array, size) => {
    if (!Array.isArray(array) || size <= 0) return [];
    return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
        array.slice(i * size, i * size + size)
    );
};

/**
 * Flatten an array of arrays
 * @param {Array} arrays - Array of arrays
 * @returns {Array} Flattened array
 */
export const flatten = (arrays) => Array.isArray(arrays) ? arrays.flat() : [];

/**
 * Deep flatten a nested array
 * @param {Array} arr - Nested array
 * @returns {Array} Deep flattened array
 */
export const flattenDeep = (arr) => arr.reduce((acc, v) =>
    acc.concat(Array.isArray(v) ? flattenDeep(v) : v), []);

/**
 * Calculate average of values
 * @param {number[]} values - Values
 * @returns {number} Average
 */
export const calculateAverage = (values) =>
    Array.isArray(values) && values.length > 0
        ? values.reduce((sum, val) => sum + val, 0) / values.length
        : 0;

/**
 * Calculate statistics for values
 * @param {number[]} values - Values
 * @returns {Object} Statistics object
 */
export const calculateStatistics = (values) => {
    if (!Array.isArray(values) || values.length === 0) {
        return { mean: 0, median: 0, std: 0, min: 0, max: 0, count: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const n = values.length;
    const mean = calculateAverage(values);
    const min = sorted[0];
    const max = sorted[n - 1];
    const median = n % 2 === 0
        ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
        : sorted[Math.floor(n / 2)];
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const std = Math.sqrt(variance);

    return { mean, median, std, min, max, count: n, variance };
};

/**
 * Get percentile value
 * @param {number[]} values - Values
 * @param {number} percentile - Percentile (0-1)
 * @returns {number} Percentile value
 */
export const getPercentile = (values, percentile) => {
    if (!Array.isArray(values) || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(percentile * (sorted.length - 1))];
};

/**
 * Get outliers from values
 * @param {number[]} values - Values
 * @param {number} threshold - Standard deviation threshold
 * @returns {number[]} Outlier values
 */
export const getOutliers = (values, threshold = 2) => {
    if (!Array.isArray(values) || values.length === 0) return [];
    const mean = calculateAverage(values);
    const std = Math.sqrt(values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length);
    return values.filter(value => Math.abs(value - mean) > threshold * std);
};

/**
 * Calculate correlation between two arrays
 * @param {number[]} values1 - First array
 * @param {number[]} values2 - Second array
 * @returns {number} Correlation coefficient
 */
export const correlation = (values1, values2) => {
    if (!Array.isArray(values1) || !Array.isArray(values2) ||
        values1.length !== values2.length || values1.length === 0) return 0;

    const avg1 = calculateAverage(values1);
    const avg2 = calculateAverage(values2);
    const diffs = values1.map((val, i) => ({ diff1: val - avg1, diff2: values2[i] - avg2 }));

    const numerator = diffs.reduce((sum, { diff1, diff2 }) => sum + diff1 * diff2, 0);
    const sumSq1 = diffs.reduce((sum, { diff1 }) => sum + diff1 * diff1, 0);
    const sumSq2 = diffs.reduce((sum, { diff2 }) => sum + diff2 * diff2, 0);
    const denominator = Math.sqrt(sumSq1 * sumSq2);
    return denominator === 0 ? 0 : numerator / denominator;
};

/**
 * Sum of values
 * @param {number[]} values - Values
 * @returns {number} Sum
 */
export const sum = (values) => Array.isArray(values) ? values.reduce((acc, val) => acc + val, 0) : 0;

/**
 * Minimum value
 * @param {number[]} values - Values
 * @returns {number} Minimum
 */
export const min = (values) => Array.isArray(values) && values.length > 0 ? Math.min(...values) : Infinity;

/**
 * Maximum value
 * @param {number[]} values - Values
 * @returns {number} Maximum
 */
export const max = (values) => Array.isArray(values) && values.length > 0 ? Math.max(...values) : -Infinity;

/**
 * Get unique values from an array
 * @param {Array} arr - Input array
 * @returns {Array} Array with unique values
 */
export const unique = (arr) => [...new Set(arr)];

/**
 * Partition an array into two arrays based on predicate
 * @param {Array} array - Array to partition
 * @param {Function} predicate - Predicate function
 * @returns {[Array, Array]} [matching, non-matching]
 */
export const partition = (array, predicate) => {
    if (!Array.isArray(array)) return [[], []];
    return array.reduce((acc, item) => {
        acc[predicate(item) ? 0 : 1].push(item);
        return acc;
    }, [[], []]);
};
