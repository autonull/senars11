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
