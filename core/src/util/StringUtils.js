/**
 * StringUtils.js - String manipulation utilities
 * Deduplicated string helpers
 */

// ... (other exports)

/**
 * Clean text by removing extra spaces and special characters
 * @param {string} text - The text to clean
 * @returns {string} - The cleaned text
 */
export const cleanText = (text) => {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').trim();
};

export const capitalize = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
};

export const truncate = (str, length) => {
    if (!str || str.length <= length) return str;
    return str.slice(0, length) + '...';
};

export const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const safeJSONParse = (jsonString, fallback = null) => {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        return fallback;
    }
};

/**
 * Validates if a string's length is within a specified range.
 * @param {string} str - The string to validate.
 * @param {number} min - The minimum length.
 * @param {number} max - The maximum length.
 * @returns {boolean} - True if length is valid, false otherwise.
 */
export const isValidLength = (str, min, max) => {
    if (typeof str !== 'string') return false;
    const len = str.length;
    return len >= min && len <= max;
};
