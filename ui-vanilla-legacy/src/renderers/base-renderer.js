/**
 * BaseRenderer - Abstract base class for all graph renderers
 */
export default class BaseRenderer {
  /**
   * Initialize the renderer
   * @param {HTMLElement} container - The DOM element to render into
   */
  init(container) {
    throw new Error('init method must be implemented');
  }

  /**
   * Add a node to the visualization
   * @param {Object} nodeData - The node data to add
   */
  addNode(nodeData) {
    throw new Error('addNode method must be implemented');
  }

  /**
   * Update a node in the visualization
   * @param {Object} nodeData - The node data to update
   */
  updateNode(nodeData) {
    throw new Error('updateNode method must be implemented');
  }

  /**
   * Remove a node from the visualization
   * @param {Object} nodeData - The node data to remove
   */
  removeNode(nodeData) {
    throw new Error('removeNode method must be implemented');
  }

  /**
   * Add an edge to the visualization
   * @param {Object} edgeData - The edge data to add
   */
  addEdge(edgeData) {
    throw new Error('addEdge method must be implemented');
  }

  /**
   * Update an edge in the visualization
   * @param {Object} edgeData - The edge data to update
   */
  updateEdge(edgeData) {
    throw new Error('updateEdge method must be implemented');
  }

  /**
   * Remove an edge from the visualization
   * @param {Object} edgeData - The edge data to remove
   */
  removeEdge(edgeData) {
    throw new Error('removeEdge method must be implemented');
  }

  /**
   * Set the complete graph snapshot
   * @param {Object} snapshot - The graph snapshot {nodes, edges}
   */
  setGraphSnapshot(snapshot) {
    throw new Error('setGraphSnapshot method must be implemented');
  }

  /**
   * Clear the visualization
   */
  clear() {
    throw new Error('clear method must be implemented');
  }

  /**
   * Fit the visualization to the container
   */
  fit() {
    // Optional method, not all renderers need this
  }

  /**
   * Destroy the renderer and clean up resources
   */
  destroy() {
    // Optional cleanup method
  }
}