import { Config } from '../config/Config.js';

/**
 * UIElements module to initialize and store DOM element references
 */
export class UIElements {
  constructor(elementIds = null) {
    this.elements = this._initializeElements(elementIds);
  }

  /**
   * Initialize all DOM elements
   */
  _initializeElements(elementIds = null) {
    // Use constants from Config module for default element IDs
    const defaultIds = Config.ELEMENT_IDS;

    const ids = elementIds ?? defaultIds;

    // Use Object.fromEntries and map for cleaner transformation
    return Object.fromEntries(
      Object.entries(ids).map(([key, id]) => [key, document.getElementById(id)])
    );
  }

  /**
   * Get a specific element by key
   */
  get(key) {
    return this.elements[key] ?? null;
  }

  /**
   * Get all elements
   */
  getAll() {
    return this.elements;
  }

  /**
   * Check if all required elements are present
   */
  isValid(requiredKeys = null) {
    const requiredElements = requiredKeys ?? [
      'statusIndicator', 'connectionStatus', 'messageCount', 'logsContainer',
      'commandInput', 'sendButton', 'graphContainer'
    ];

    return requiredElements.every(key => this.elements[key] !== null);
  }

  /**
   * Bulk get multiple elements by keys
   */
  getMultiple(keys) {
    return keys.reduce((acc, key) => {
      acc[key] = this.get(key);
      return acc;
    }, {});
  }
}