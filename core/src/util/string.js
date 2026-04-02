/**
 * String utilities for SeNARS
 */

/**
 * Clean text by removing extra spaces and special characters
 * @param {string} text - The text to clean
 * @returns {string} The cleaned text
 */
export const cleanText = (text) => text ? text.replace(/\s+/g, ' ').trim() : '';

/**
 * Capitalize first letter of string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
export const capitalize = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';

/**
 * Truncate string to specified length
 * @param {string} str - String to truncate
 * @param {number} length - Maximum length
 * @returns {string} Truncated string
 */
export const truncate = (str, length) => !str || str.length <= length ? str : str.slice(0, length) + '...';

/**
 * Escape special regex characters
 * @param {string} string - String to escape
 * @returns {string} Escaped string
 */
export const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Safely parse JSON with fallback
 * @param {string} jsonString - JSON string to parse
 * @param {*} fallback - Fallback value on parse error
 * @returns {*} Parsed object or fallback
 */
export const safeJSONParse = (jsonString, fallback = null) => {
    try {
        return JSON.parse(jsonString);
    } catch {
        return fallback;
    }
};

/**
 * Validate if a string's length is within a specified range
 * @param {string} str - The string to validate
 * @param {number} min - The minimum length
 * @param {number} max - The maximum length
 * @returns {boolean} True if length is valid, false otherwise
 */
export const isValidLength = (str, min, max) => typeof str === 'string' && str.length >= min && str.length <= max;

/**
 * Format timestamp to ISO string
 * @param {number} timestamp - Timestamp
 * @returns {string} ISO string
 */
export const formatTimestamp = (timestamp = Date.now()) => new Date(timestamp).toISOString();

/**
 * Generate a unique ID
 * @param {string} prefix - ID prefix
 * @returns {string} Unique ID
 */
export const generateId = (prefix = 'id') => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Check if string is empty
 * @param {string} str - String to check
 * @returns {boolean} True if string is empty
 */
export const isEmpty = (str) => !str || str.length === 0;

/**
 * Check if string is non-empty
 * @param {string} str - String to check
 * @returns {boolean} True if string is non-empty
 */
export const isNonEmpty = (str) => typeof str === 'string' && str.length > 0;

/**
 * Pad string to specified length
 * @param {string} str - String to pad
 * @param {number} length - Target length
 * @param {string} char - Padding character
 * @returns {string} Padded string
 */
export const pad = (str, length, char = ' ') => str ? str.padStart(length, char) : char.repeat(length);

/**
 * Repeat string n times
 * @param {string} str - String to repeat
 * @param {number} n - Number of times
 * @returns {string} Repeated string
 */
export const repeat = (str, n) => str?.repeat(n) ?? '';

/**
 * Generate a random alphanumeric string
 * @param {number} length - Length of the string
 * @returns {string} Random string
 */
export const randomString = (length = 8) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};
