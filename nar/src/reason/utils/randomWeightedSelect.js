/**
 * Randomly select an item from an array based on assigned weights
 * @param {Array} items - Array of items to select from
 * @param {Array<number>} weights - Array of weights corresponding to each item
 * @returns {*} Selected item
 */
export function randomWeightedSelect(items, weights) {
    if (items.length !== weights.length) {
        throw new Error('Items and weights arrays must have the same length');
    }

    if (items.length === 0) {
        return null;
    }

    // Calculate total weight
    const totalWeight = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);

    if (totalWeight === 0) {
        // If all weights are 0, select randomly
        return items[Math.floor(Math.random() * items.length)];
    }

    // Generate a random value between 0 and totalWeight
    const randomValue = Math.random() * totalWeight;

    // Find the selected item based on cumulative weights
    let cumulativeWeight = 0;
    for (let i = 0; i < items.length; i++) {
        cumulativeWeight += Math.max(0, weights[i]);
        if (randomValue <= cumulativeWeight) {
            return items[i];
        }
    }

    // Fallback (should not happen if weights are properly calculated)
    return items[items.length - 1];
}