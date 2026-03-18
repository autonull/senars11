/**
 * FNV-1a Hash implementation
 * @param {string} str - The string to hash
 * @returns {number} The hash as a 32-bit unsigned integer
 */
export const fnv1a = (str) => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash;
};
