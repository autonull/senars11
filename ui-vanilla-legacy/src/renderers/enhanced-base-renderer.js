import { memoryManager } from '../utils/memory-manager.js';

/**
 * EnhancedBaseRenderer - Enhanced abstract base class for all graph renderers with standardized lifecycle management
 */
export default class EnhancedBaseRenderer {
  /**
   * Initialize the renderer
   * @param {HTMLElement} container - The DOM element to render into
   * @param {Object} options - Renderer options
   */
  init(container, options = {}) {
    this.container = container;
    this.options = options;
    this._initialized = false;
    this._stats = {
      nodes: 0,
      edges: 0,
      operations: 0
    };
    this._eventListeners = new Map();
    this._resources = new Set();
    
    // Call the renderer-specific initialization
    this._initRenderer();
    
    this._initialized = true;
    this._emit('initialized');
    return this;
  }

  /**
   * Internal renderer initialization - to be implemented by subclasses
   */
  _initRenderer() {
    throw new Error('_initRenderer method must be implemented');
  }

  /**
   * Add a node to the visualization
   * @param {Object} nodeData - The node data to add
   */
  addNode(nodeData) {
    if (!this._initialized) {
      throw new Error('Renderer not initialized. Call init() first.');
    }
    this._stats.operations++;
    this._stats.nodes++;
    const result = this._addNode(nodeData);
    this._emit('nodeAdded', nodeData);
    return result;
  }

  /**
   * Renderer-specific addNode implementation - to be implemented by subclasses
   * @param {Object} nodeData - The node data to add
   */
  _addNode(nodeData) {
    throw new Error('_addNode method must be implemented');
  }

  /**
   * Update a node in the visualization
   * @param {Object} nodeData - The node data to update
   */
  updateNode(nodeData) {
    if (!this._initialized) {
      throw new Error('Renderer not initialized. Call init() first.');
    }
    this._stats.operations++;
    const result = this._updateNode(nodeData);
    this._emit('nodeUpdated', nodeData);
    return result;
  }

  /**
   * Renderer-specific updateNode implementation - to be implemented by subclasses
   * @param {Object} nodeData - The node data to update
   */
  _updateNode(nodeData) {
    throw new Error('_updateNode method must be implemented');
  }

  /**
   * Remove a node from the visualization
   * @param {Object} nodeData - The node data to remove
   */
  removeNode(nodeData) {
    if (!this._initialized) {
      throw new Error('Renderer not initialized. Call init() first.');
    }
    this._stats.operations++;
    this._stats.nodes--;
    const result = this._removeNode(nodeData);
    this._emit('nodeRemoved', nodeData);
    return result;
  }

  /**
   * Renderer-specific removeNode implementation - to be implemented by subclasses
   * @param {Object} nodeData - The node data to remove
   */
  _removeNode(nodeData) {
    throw new Error('_removeNode method must be implemented');
  }

  /**
   * Add an edge to the visualization
   * @param {Object} edgeData - The edge data to add
   */
  addEdge(edgeData) {
    if (!this._initialized) {
      throw new Error('Renderer not initialized. Call init() first.');
    }
    this._stats.operations++;
    this._stats.edges++;
    const result = this._addEdge(edgeData);
    this._emit('edgeAdded', edgeData);
    return result;
  }

  /**
   * Renderer-specific addEdge implementation - to be implemented by subclasses
   * @param {Object} edgeData - The edge data to add
   */
  _addEdge(edgeData) {
    throw new Error('_addEdge method must be implemented');
  }

  /**
   * Update an edge in the visualization
   * @param {Object} edgeData - The edge data to update
   */
  updateEdge(edgeData) {
    if (!this._initialized) {
      throw new Error('Renderer not initialized. Call init() first.');
    }
    this._stats.operations++;
    const result = this._updateEdge(edgeData);
    this._emit('edgeUpdated', edgeData);
    return result;
  }

  /**
   * Renderer-specific updateEdge implementation - to be implemented by subclasses
   * @param {Object} edgeData - The edge data to update
   */
  _updateEdge(edgeData) {
    throw new Error('_updateEdge method must be implemented');
  }

  /**
   * Remove an edge from the visualization
   * @param {Object} edgeData - The edge data to remove
   */
  removeEdge(edgeData) {
    if (!this._initialized) {
      throw new Error('Renderer not initialized. Call init() first.');
    }
    this._stats.operations++;
    this._stats.edges--;
    const result = this._removeEdge(edgeData);
    this._emit('edgeRemoved', edgeData);
    return result;
  }

  /**
   * Renderer-specific removeEdge implementation - to be implemented by subclasses
   * @param {Object} edgeData - The edge data to remove
   */
  _removeEdge(edgeData) {
    throw new Error('_removeEdge method must be implemented');
  }

  /**
   * Set the complete graph snapshot
   * @param {Object} snapshot - The graph snapshot {nodes, edges}
   */
  setGraphSnapshot(snapshot) {
    if (!this._initialized) {
      throw new Error('Renderer not initialized. Call init() first.');
    }
    this._stats.operations++;
    const result = this._setGraphSnapshot(snapshot);
    this._emit('graphSnapshotSet', snapshot);
    return result;
  }

  /**
   * Renderer-specific setGraphSnapshot implementation - to be implemented by subclasses
   * @param {Object} snapshot - The graph snapshot {nodes, edges}
   */
  _setGraphSnapshot(snapshot) {
    throw new Error('_setGraphSnapshot method must be implemented');
  }

  /**
   * Clear the visualization
   */
  clear() {
    if (!this._initialized) {
      return;
    }
    this._stats.nodes = 0;
    this._stats.edges = 0;
    this._stats.operations++;
    const result = this._clear();
    this._emit('cleared');
    return result;
  }

  /**
   * Renderer-specific clear implementation - to be implemented by subclasses
   */
  _clear() {
    throw new Error('_clear method must be implemented');
  }

  /**
   * Fit the visualization to the container
   */
  fit() {
    if (!this._initialized) {
      return;
    }
    const result = this._fit();
    this._emit('fitted');
    return result;
  }

  /**
   * Renderer-specific fit implementation - optional for subclasses
   */
  _fit() {
    // Optional method, not all renderers need this
    console.warn('Fit method not implemented for this renderer');
  }

  /**
   * Export the visualization as data
   */
  exportData() {
    if (!this._initialized) {
      return null;
    }
    return this._exportData();
  }

  /**
   * Renderer-specific exportData implementation - optional for subclasses
   */
  _exportData() {
    // Optional method, not all renderers need this
    return null;
  }

  /**
   * Get renderer statistics
   */
  getStats() {
    return { ...this._stats };
  }

  /**
   * Subscribe to renderer events
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, new Set());
    }
    this._eventListeners.get(event).add(callback);
  }

  /**
   * Unsubscribe from renderer events
   * @param {string} event - Event name
   * @param {Function} callback - Callback function to remove
   */
  off(event, callback) {
    if (this._eventListeners.has(event)) {
      this._eventListeners.get(event).delete(callback);
    }
  }

  /**
   * Emit an event to all listeners
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  _emit(event, data) {
    if (this._eventListeners.has(event)) {
      for (const callback of this._eventListeners.get(event)) {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in renderer event listener for ${event}:`, error);
        }
      }
    }
  }

  /**
   * Register a resource for cleanup
   * @param {Function} cleanupFn - Function to clean up the resource
   * @returns {string} Resource ID
   */
  registerResource(cleanupFn) {
    const id = `resource_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this._resources.add({ id, cleanup: cleanupFn });
    return id;
  }

  /**
   * Clean up a specific resource
   * @param {string} id - Resource ID to clean up
   */
  cleanupResource(id) {
    for (const resource of this._resources) {
      if (resource.id === id) {
        try {
          resource.cleanup();
        } catch (error) {
          console.error('Error cleaning up resource:', error);
        }
        this._resources.delete(resource);
        break;
      }
    }
  }

  /**
   * Destroy the renderer and clean up resources
   */
  destroy() {
    if (!this._initialized) {
      return;
    }

    // Cleanup all registered resources
    for (const resource of this._resources) {
      try {
        resource.cleanup();
      } catch (error) {
        console.error('Error during renderer resource cleanup:', error);
      }
    }
    this._resources.clear();

    // Clear all event listeners
    this._eventListeners.clear();

    // Call renderer-specific destruction
    this._destroy();

    // Clean up internal state
    this.container = null;
    this.options = null;
    this._initialized = false;
    
    this._emit('destroyed');
  }

  /**
   * Renderer-specific destroy implementation - optional for subclasses
   */
  _destroy() {
    // Optional cleanup method
  }
}