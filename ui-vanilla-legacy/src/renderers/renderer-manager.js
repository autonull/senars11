import BatchedCytoscapeRenderer from './batched-cytoscape-renderer.js';
import DirectCytoscapeRenderer from './direct-cytoscape-renderer.js';
import ListRenderer from './list-renderer.js';

/**
 * RendererManager - Manages different visualization renderers with enhanced lifecycle management
 */
export default class RendererManager {
  constructor() {
    this.renderers = new Map();
    this.currentRenderer = null;
    this.container = null;
    this.listeners = new Map(); // Event listeners for renderer events

    // Register default renderers
    this.registerRenderer('batched-cytoscape', BatchedCytoscapeRenderer);
    this.registerRenderer('direct-cytoscape', DirectCytoscapeRenderer);
    this.registerRenderer('list', ListRenderer);
  }

  /**
   * Register a new renderer type
   * @param {string} name - The name of the renderer
   * @param {EnhancedBaseRenderer} rendererClass - The renderer class
   */
  registerRenderer(name, rendererClass) {
    this.renderers.set(name, rendererClass);
  }

  /**
   * Initialize the renderer manager with a container
   * @param {HTMLElement} container - The container element for the visualization
   */
  init(container) {
    this.container = container;
  }

  /**
   * Switch to a different renderer
   * @param {string} rendererName - The name of the renderer to switch to
   * @param {Object} graphData - Optional graph data to preserve during switch
   * @param {Object} options - Renderer options
   */
  switchRenderer(rendererName, graphData = null, options = {}) {
    // Store current renderer's data if provided
    let currentData = null;
    if (this.currentRenderer && graphData) {
      // Try to export current renderer's data if it supports export
      currentData = this.currentRenderer.exportData() || graphData;
    } else if (this.currentRenderer) {
      // In a more sophisticated system, we might extract data from the current renderer
      currentData = { nodes: [], edges: [] };
    }

    // Destroy current renderer if it exists
    if (this.currentRenderer) {
      // Detach event listeners from old renderer
      this._detachEventListeners();
      this.currentRenderer.destroy();
      // Clear the container
      while (this.container.firstChild) {
        this.container.removeChild(this.container.firstChild);
      }
    }

    // Create and initialize the new renderer
    const RendererClass = this.renderers.get(rendererName);
    if (!RendererClass) {
      throw new Error(`Renderer '${rendererName}' not found`);
    }

    this.currentRenderer = new RendererClass();

    // Attach event listeners to the new renderer
    this._attachEventListeners();

    this.currentRenderer.init(this.container, options);

    // Set the graph data on the new renderer
    if (currentData && currentData.nodes && currentData.edges) {
      this.currentRenderer.setGraphSnapshot(currentData);
    }

    return this.currentRenderer;
  }

  /**
   * Attach event listeners to the current renderer
   */
  _attachEventListeners() {
    if (!this.currentRenderer) return;

    for (const [event, callbacks] of this.listeners) {
      for (const callback of callbacks) {
        this.currentRenderer.on(event, callback);
      }
    }
  }

  /**
   * Detach event listeners from the current renderer
   */
  _detachEventListeners() {
    if (!this.currentRenderer) return;

    // Note: Since we can't easily remove event listeners that were added with .on(),
    // we rely on the renderer's destroy method to clean up internal event listeners
  }

  /**
   * Subscribe to renderer events
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    // If we have a current renderer, also add the listener directly to it
    if (this.currentRenderer) {
      this.currentRenderer.on(event, callback);
    }
  }

  /**
   * Unsubscribe from renderer events
   * @param {string} event - Event name
   * @param {Function} callback - Callback function to remove
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * Get the current renderer
   */
  getCurrentRenderer() {
    return this.currentRenderer;
  }

  /**
   * Get renderer statistics
   */
  getStats() {
    if (this.currentRenderer) {
      return this.currentRenderer.getStats();
    }
    return { nodes: 0, edges: 0, operations: 0 };
  }

  /**
   * Call a method on the current renderer
   * @param {string} method - The method name to call
   * @param {...any} args - Arguments to pass to the method
   */
  callRendererMethod(method, ...args) {
    if (this.currentRenderer && typeof this.currentRenderer[method] === 'function') {
      return this.currentRenderer[method](...args);
    }
    console.warn(`Method '${method}' not found or not implemented on current renderer`);
    return null;
  }

  /**
   * Export current renderer data
   */
  exportData() {
    if (this.currentRenderer) {
      return this.currentRenderer.exportData();
    }
    return null;
  }

  /**
   * Destroy the renderer manager and clean up
   */
  destroy() {
    if (this.currentRenderer) {
      this._detachEventListeners();
      this.currentRenderer.destroy();
      this.currentRenderer = null;
    }

    // Clear our own listeners
    this.listeners.clear();
  }
}