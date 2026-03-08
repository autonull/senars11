/**
 * ConfigManager.js - Centralized configuration with runtime modification
 * Supports validation, change listeners, and A/B testing
 */

import { Logger } from '../../../core/src/util/Logger.js';

export class ConfigManager {
  constructor() {
    this._entries = new Map();
    this._listeners = new Map();
    this._frozen = false;
  }

  /**
   * Define a configuration key with default value and optional validator
   */
  define(key, defaultValue, validator = null, description = '') {
    if (this._frozen) {
      throw new Error(`Cannot define config after freeze: ${key}`);
    }

    if (validator && !validator(defaultValue)) {
      throw new Error(`Invalid default value for ${key}`);
    }

    this._entries.set(key, {
      value: defaultValue,
      validator,
      description,
      modified: false,
      modifiedAt: null
    });

    return this;
  }

  /**
   * Get a configuration value
   */
  get(key) {
    const entry = this._entries.get(key);
    if (!entry) {
      Logger.warn(`Config key not found: ${key}`);
      return undefined;
    }
    return entry.value;
  }

  /**
   * Set a configuration value with validation
   */
  set(key, value) {
    const entry = this._entries.get(key);
    if (!entry) {
      throw new Error(`Unknown config key: ${key}`);
    }

    if (entry.validator && !entry.validator(value)) {
      throw new Error(`Invalid value for ${key}: ${value}`);
    }

    const oldValue = entry.value;
    entry.value = value;
    entry.modified = true;
    entry.modifiedAt = Date.now();

    this._notifyListeners(key, oldValue, value);
    return this;
  }

  /**
   * Get all configuration values as plain object
   */
  getAll() {
    const config = {};
    for (const [key, entry] of this._entries.entries()) {
      config[key] = entry.value;
    }
    return config;
  }

  /**
   * Set multiple values at once
   */
  setAll(config) {
    for (const [key, value] of Object.entries(config)) {
      this.set(key, value);
    }
    return this;
  }

  /**
   * Register a listener for config changes
   */
  onChange(key, callback) {
    if (!this._listeners.has(key)) {
      this._listeners.set(key, []);
    }
    this._listeners.get(key).push(callback);
    return () => this.offChange(key, callback);
  }

  /**
   * Remove a listener
   */
  offChange(key, callback) {
    const listeners = this._listeners.get(key);
    if (listeners) {
      const idx = listeners.indexOf(callback);
      if (idx !== -1) listeners.splice(idx, 1);
    }
  }

  /**
   * Freeze configuration (prevent new definitions)
   */
  freeze() {
    this._frozen = true;
    return this;
  }

  /**
   * Get configuration statistics
   */
  getStats() {
    let modifiedCount = 0;
    for (const entry of this._entries.values()) {
      if (entry.modified) modifiedCount++;
    }

    return {
      totalKeys: this._entries.size,
      modifiedKeys: modifiedCount,
      listenerCount: this._listeners.size
    };
  }

  /**
   * Get metadata for a config key
   */
  getMeta(key) {
    const entry = this._entries.get(key);
    if (!entry) return null;

    return {
      value: entry.value,
      modified: entry.modified,
      modifiedAt: entry.modifiedAt,
      hasValidator: !!entry.validator,
      description: entry.description,
      listenerCount: this._listeners.get(key)?.length || 0
    };
  }

  /**
   * Reset a key to its default (if we stored defaults)
   */
  reset(key) {
    // Would need to store original defaults separately
    // For now, just mark as unmodified
    const entry = this._entries.get(key);
    if (entry) {
      entry.modified = false;
      entry.modifiedAt = null;
    }
    return this;
  }

  /**
   * Reset all keys
   */
  resetAll() {
    for (const entry of this._entries.values()) {
      entry.modified = false;
      entry.modifiedAt = null;
    }
    return this;
  }

  /**
   * Serialize configuration for persistence
   */
  serialize() {
    const data = {};
    for (const [key, entry] of this._entries.entries()) {
      data[key] = {
        value: entry.value,
        modified: entry.modified
      };
    }
    return JSON.stringify(data, null, 2);
  }

  /**
   * Deserialize configuration
   */
  deserialize(json) {
    const data = JSON.parse(json);
    for (const [key, entry] of Object.entries(data)) {
      if (this._entries.has(key)) {
        this.set(key, entry.value);
      }
    }
    return this;
  }

  /**
   * Create a snapshot for A/B testing
   */
  snapshot() {
    const snapshot = new Map();
    for (const [key, entry] of this._entries.entries()) {
      snapshot.set(key, entry.value);
    }
    return snapshot;
  }

  /**
   * Restore from a snapshot
   */
  restore(snapshot) {
    for (const [key, value] of snapshot.entries()) {
      this.set(key, value);
    }
    return this;
  }

  /**
   * Notify listeners of a change
   */
  _notifyListeners(key, oldValue, newValue) {
    const listeners = this._listeners.get(key) || [];
    for (const callback of listeners) {
      try {
        callback(newValue, oldValue, key);
      } catch (e) {
        Logger.error(`Config listener error for ${key}:`, e);
      }
    }

    // Also emit global change event
    const globalListeners = this._listeners.get('*') || [];
    for (const callback of globalListeners) {
      try {
        callback(key, newValue, oldValue);
      } catch (e) {
        Logger.error(`Global config listener error:`, e);
      }
    }
  }
}

/**
 * Common validators
 */
export const Validators = {
  number: (min = -Infinity, max = Infinity) => v => 
    typeof v === 'number' && v >= min && v <= max,
  
  integer: (min = -Infinity, max = Infinity) => v => 
    Number.isInteger(v) && v >= min && v <= max,
  
  boolean: v => typeof v === 'boolean',
  
  string: (minLength = 0, maxLength = Infinity) => v => 
    typeof v === 'string' && v.length >= minLength && v.length <= maxLength,
  
  array: v => Array.isArray(v),
  
  object: v => typeof v === 'object' && v !== null && !Array.isArray(v),
  
  positive: v => typeof v === 'number' && v > 0,
  
  nonNegative: v => typeof v === 'number' && v >= 0,
  
  oneOf: (values) => v => values.includes(v),
  
  regex: (pattern) => v => typeof v === 'string' && pattern.test(v)
};

/**
 * Create a pre-configured ConfigManager for MeTTa
 */
export function createMeTTaConfig() {
  const config = new ConfigManager();

  // P1: Performance Core
  config.define('zipperThreshold', 8, Validators.positive, 'Depth at which Zipper replaces recursive traversal');
  config.define('pathTrie', false, Validators.boolean, 'Enable PathTrie rule index');
  config.define('jit', true, Validators.boolean, 'Enable JIT compilation');
  config.define('jitThreshold', 50, Validators.positive, 'Calls before JIT compiling');
  config.define('parallelThreshold', 200, Validators.positive, 'Min superpose width for Workers');

  // P2: Graph & Space
  config.define('persist', false, Validators.boolean, 'Enable PersistentSpace checkpointing');
  config.define('persistThreshold', 50000, Validators.positive, 'Atoms before checkpoint');

  // P3: Reasoning Extensions
  config.define('il', false, Validators.boolean, 'Enable MeTTa-IL compilation');
  config.define('tensor', true, Validators.boolean, 'Enable NeuralBridge tensor ops');
  config.define('smt', false, Validators.boolean, 'Enable SMT constraint solver');
  config.define('smtVarThreshold', 5, Validators.positive, 'Min vars to trigger SMT');

  // P4: Debugging
  config.define('debugging', false, Validators.boolean, 'Enable debug mode');
  config.define('tracing', false, Validators.boolean, 'Enable execution tracing');
  config.define('profiling', false, Validators.boolean, 'Enable performance profiling');

  // Tier 1 optimizations (from original config)
  config.define('interning', true, Validators.boolean, 'Symbol interning');
  config.define('fastPaths', true, Validators.boolean, 'Monomorphic type guards');
  config.define('indexing', true, Validators.boolean, 'Multi-level rule indexing');
  config.define('caching', true, Validators.boolean, 'Reduction result caching');
  config.define('pooling', true, Validators.boolean, 'Object pooling');
  config.define('tco', true, Validators.boolean, 'Tail call optimization');
  config.define('bloomFilter', false, Validators.boolean, 'Fast negative lookups');

  return config.freeze();
}
