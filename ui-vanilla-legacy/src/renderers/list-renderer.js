import EnhancedBaseRenderer from './enhanced-base-renderer.js';

/**
 * ListRenderer - A renderer that displays nodes and edges as lists
 */
export default class ListRenderer extends EnhancedBaseRenderer {
  constructor() {
    super();
    this.container = null;
    this.nodes = new Map();
    this.edges = new Map();
    this.nodesListElement = null;
    this.edgesListElement = null;
    this.listContainer = null;
  }

  _initRenderer() {
    // Create container for the list view
    this.listContainer = document.createElement('div');
    this.listContainer.id = 'list-container';
    this.listContainer.style.cssText = `
      width: 100%;
      height: 100%;
      overflow: auto;
      padding: 10px;
      background-color: var(--bg-secondary, #f9f9f9);
      border: 1px solid var(--border-color, #ccc);
    `;

    // Create sections for nodes and edges
    const nodesSection = document.createElement('div');
    nodesSection.innerHTML = '<h3>Nodes</h3>';
    this.nodesListElement = document.createElement('div');
    this.nodesListElement.style.cssText = 'margin-bottom: 20px; max-height: 40vh; overflow-y: auto;';
    nodesSection.appendChild(this.nodesListElement);

    const edgesSection = document.createElement('div');
    edgesSection.innerHTML = '<h3>Edges</h3>';
    this.edgesListElement = document.createElement('div');
    edgesSection.appendChild(this.edgesListElement);

    this.listContainer.appendChild(nodesSection);
    this.listContainer.appendChild(edgesSection);

    this.container.appendChild(this.listContainer);
  }

  _addNode(nodeData) {
    this.nodes.set(nodeData.id, nodeData);
    this._updateNodesList();
  }

  _updateNode(nodeData) {
    if (this.nodes.has(nodeData.id)) {
      this.nodes.set(nodeData.id, { ...this.nodes.get(nodeData.id), ...nodeData });
      this._updateNodesList();
    }
  }

  _removeNode(nodeData) {
    this.nodes.delete(nodeData.id);
    this._updateNodesList();
  }

  _addEdge(edgeData) {
    this.edges.set(edgeData.id, edgeData);
    this._updateEdgesList();
  }

  _updateEdge(edgeData) {
    if (this.edges.has(edgeData.id)) {
      this.edges.set(edgeData.id, { ...this.edges.get(edgeData.id), ...edgeData });
      this._updateEdgesList();
    }
  }

  _removeEdge(edgeData) {
    this.edges.delete(edgeData.id);
    this._updateEdgesList();
  }

  _setGraphSnapshot(snapshot) {
    this._clear();

    if (Array.isArray(snapshot.nodes)) {
      snapshot.nodes.forEach(node => this._addNode(node));
    }

    if (Array.isArray(snapshot.edges)) {
      snapshot.edges.forEach(edge => this._addEdge(edge));
    }
  }

  _clear() {
    this.nodes.clear();
    this.edges.clear();
    this._updateNodesList();
    this._updateEdgesList();
  }

  _updateNodesList() {
    if (!this.nodesListElement) return;

    this.nodesListElement.innerHTML = '';

    for (const [id, node] of this.nodes) {
      const nodeElement = document.createElement('div');
      nodeElement.style.cssText = `
        padding: 5px;
        margin: 2px 0;
        background-color: var(--bg-secondary, #e9ecef);
        border-radius: 3px;
        border-left: 3px solid var(--accent-color, #007bff);
      `;
      nodeElement.innerHTML = `
        <strong>${node.label || id}</strong>
        <span style="font-size: 0.8em; color: var(--text-secondary, #6c757d);">(${node.type || 'unknown'})</span>
        <div style="font-size: 0.8em; margin-top: 3px; color: var(--text-secondary, #6c757d);">ID: ${id}</div>
      `;
      this.nodesListElement.appendChild(nodeElement);
    }
  }

  _updateEdgesList() {
    if (!this.edgesListElement) return;

    this.edgesListElement.innerHTML = '';

    for (const [id, edge] of this.edges) {
      const edgeElement = document.createElement('div');
      edgeElement.style.cssText = `
        padding: 5px;
        margin: 2px 0;
        background-color: var(--bg-secondary, #f8f9fa);
        border-radius: 3px;
        border-left: 3px solid var(--success-color, #28a745);
      `;
      edgeElement.innerHTML = `
        <strong>${edge.source}</strong> → <strong>${edge.target}</strong>
        <div style="font-size: 0.8em; margin-top: 3px; color: var(--text-secondary, #6c757d);">ID: ${id}</div>
      `;
      this.edgesListElement.appendChild(edgeElement);
    }
  }

  _destroy() {
    this.nodes.clear();
    this.edges.clear();
    // Remove the list container from DOM if it exists
    if (this.listContainer && this.listContainer.parentNode) {
      this.listContainer.parentNode.removeChild(this.listContainer);
    }
    this.listContainer = null;
    this.nodesListElement = null;
    this.edgesListElement = null;
  }

  /**
   * Export the current data as JSON
   */
  _exportData() {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values())
    };
  }
}