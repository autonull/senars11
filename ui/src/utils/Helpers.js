/**
 * Common utility functions to reduce code duplication
 */

/**
 * Safely get nested property from an object using dot notation
 */
export function getNestedProperty(obj, path, defaultValue = undefined) {
  if (!obj || typeof path !== 'string') return defaultValue;
  
  const keys = path.split('.');
  let result = obj;
  
  for (const key of keys) {
    if (result == null) return defaultValue;
    result = result[key];
  }
  
  return result !== undefined ? result : defaultValue;
}

/**
 * Check if a value is a function
 */
export function isFunction(value) {
  return typeof value === 'function';
}

/**
 * Check if a value is an object (but not null or array)
 */
export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Deep clone an object
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
  return obj;
}

/**
 * Capitalize the first letter of a string
 */
export function capitalizeFirst(str) {
  if (!str) return '';
  return `${str.charAt(0).toUpperCase()}${str.slice(1)}`;
}

/**
 * Safely execute a function with error handling
 */
export function safeExecute(fn, ...args) {
  try {
    if (isFunction(fn)) {
      return fn(...args);
    }
    return undefined;
  } catch (error) {
    console.error('Error executing function:', error);
    return undefined;
  }
}

/**
 * Create a debounced version of a function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Generate a unique ID
 */
export function generateId(prefix = '') {
  return `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Wait for a specified time (async sleep)
 */
export async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}