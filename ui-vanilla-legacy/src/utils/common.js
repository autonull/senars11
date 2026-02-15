/**
 * Shared utilities for the SeNARS UI
 */

/**
 * Safe DOM element selector with fallback
 * @param {string} selector - CSS selector
 * @param {HTMLElement} [parent=document] - Parent element to search in
 * @returns {HTMLElement|null} Element or null if not found
 */
export function selectElement(selector, parent = document) {
  try {
    return parent.querySelector(selector);
  } catch (error) {
    console.error(`Invalid selector: ${selector}`, error);
    return null;
  }
}

/**
 * Safe DOM element creation with properties
 * @param {string} tagName - HTML tag name
 * @param {Object} attributes - Attributes to set
 * @param {Object} styles - CSS styles to apply
 * @returns {HTMLElement} Created element
 */
export function createElement(tagName, attributes = {}, styles = {}) {
  const element = document.createElement(tagName);

  // Set attributes using destructuring and optional chaining
  Object.entries(attributes).forEach(([key, value]) => {
    element[key] = value;
  });

  // Apply styles using destructuring
  Object.entries(styles).forEach(([key, value]) => {
    element.style[key] = value;
  });

  return element;
}

/**
 * Safely retrieve value from localStorage
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if not found
 * @returns {*} Stored or default value
 */
export function getLocalStorage(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.warn(`Could not retrieve from localStorage: ${key}`, error);
    return defaultValue;
  }
}

/**
 * Safely save value to localStorage
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 */
export function setLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not save to localStorage: ${key}`, error);
  }
}

/**
 * Format log messages consistently
 * @param {string} type - Message type ('in', 'out', 'debug', 'info', 'error')
 * @param {string} content - Message content
 * @returns {string} Formatted message
 */
export function formatLogMessage(type, content) {
  const prefixes = {
    in: '[IN]',
    out: '[OUT]',
    debug: '[DEBUG]',
    info: '[INFO]',
    error: '[ERROR]'
  };

  const prefix = prefixes[type] ?? '[LOG]';
  return `${prefix} ${content}`;
}

/**
 * Truncate array to max length while preserving recent items
 * @param {Array} array - Array to truncate
 * @param {number} maxLength - Maximum length
 * @returns {Array} Truncated array
 */
export function truncateArray(array, maxLength) {
  if (array.length <= maxLength) return array;
  return array.slice(-maxLength);
}

/**
 * Create a debounced function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in ms
 * @returns {Function} Debounced function
 */
export function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Safely access nested object properties
 * @param {Object} obj - Object to access
 * @param {string} path - Dot-separated path (e.g., 'a.b.c')
 * @param {*} defaultValue - Default value if path doesn't exist
 * @returns {*} Value at path or default
 */
export function getNestedProperty(obj, path, defaultValue = undefined) {
  return path.split('.').reduce((current, key) => {
    return current?.[key] ?? defaultValue;
  }, obj);
}

/**
 * Check if a value is a plain object
 * @param {*} value - Value to check
 * @returns {boolean} True if plain object
 */
export function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

/**
 * Deep merge objects (shallow for performance in hot paths)
 * @param {...Object} sources - Objects to merge
 * @returns {Object} Merged object
 */
export function deepMerge(...sources) {
  const result = {};

  for (const source of sources) {
    if (!source || !isPlainObject(source)) continue;

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        if (isPlainObject(source[key])) {
          result[key] = deepMerge(result[key] ?? {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
  }

  return result;
}