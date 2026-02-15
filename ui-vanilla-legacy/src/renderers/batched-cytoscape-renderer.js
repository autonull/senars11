import EnhancedBaseRenderer from './enhanced-base-renderer.js';
import cytoscape from 'cytoscape';
import GraphLayout from '../config/graph-layout.js';
import { selectElement, debounce } from '../utils/common.js';

/**
 * BatchedCytoscapeRenderer - A renderer that batches operations for performance
 */
export default class BatchedCytoscapeRenderer extends EnhancedBaseRenderer {
  constructor() {
    super();
    this.cy = null;
    this.container = null;
    this.nodeCache = new Set();
    this.fitTimeout = null;
    this.isBatching = false;
    this.batchedOperations = [];
    this.graphDiv = null;
    this.detailsPanel = null;
  }

  _initRenderer() {
    // Create the graph container element
    this.graphDiv = document.createElement('div');
    Object.assign(this.graphDiv, { id: 'cy-graph' });
    Object.assign(this.graphDiv.style, {
      width: '100%',
      height: '100%',
      border: '1px solid var(--border-color, #ccc)'
    });

    this.container.appendChild(this.graphDiv);

    const styleConfig = GraphLayout.getNodeStyleOptions();

    this.cy = cytoscape({
      container: this.graphDiv,
      style: styleConfig.style,
      layout: GraphLayout.getLayoutOptions()
    });

    // Expose for testing if needed
    window.cy = this.cy;

    // Add event listeners for interactivity
    this._setupDetailsPanel();
  }

  _setupDetailsPanel() {
    this.detailsPanel = selectElement('#details-panel') ?? this._createDetailsPanel();

    if (this.detailsPanel) {
      // Debounced function to prevent excessive fitting
      this._debouncedFit = debounce(() => {
        try {
          this.cy.layout({
            name: 'cose',
            animate: false,
            fit: true,
            padding: 30
          }).run();
        } catch (error) {
          console.error('Error running layout/fit', { error: error.message });
        }
      }, 100);

      this.cy.on('tap', 'node', (evt) => {
        const node = evt.target;
        const nodeData = node.data();

        // Format the node details nicely
        let detailsHtml = '<h4>Node Details</h4>';
        detailsHtml += `<p><strong>ID:</strong> ${nodeData.id}</p>`;
        detailsHtml += `<p><strong>Label:</strong> ${nodeData.label || 'N/A'}</p>`;
        detailsHtml += `<p><strong>Type:</strong> ${nodeData.type || 'N/A'}</p>`;

        if (nodeData.term) {
            detailsHtml += `<p><strong>Term:</strong> ${nodeData.term.toString ? nodeData.term.toString() : JSON.stringify(nodeData.term)}</p>`;
        }

        if (nodeData.truth) {
            detailsHtml += `<p><strong>Truth:</strong> ${JSON.stringify(nodeData.truth)}</p>`;
        }

        if (nodeData.budget) {
            detailsHtml += `<p><strong>Budget:</strong> ${JSON.stringify(nodeData.budget)}</p>`;
        }

        if (nodeData.stamp) {
            detailsHtml += `<p><strong>Stamp:</strong> ${JSON.stringify(nodeData.stamp)}</p>`;
        }

        if (nodeData.data) {
            detailsHtml += `<p><strong>Extra Data:</strong> ${JSON.stringify(nodeData.data)}</p>`;
        }

        this.detailsPanel.innerHTML = detailsHtml;
        this.detailsPanel.style.display = 'block';
      });

      this.cy.on('tap', 'edge', (evt) => {
        const edge = evt.target;
        const edgeData = edge.data();

        // Format the edge details nicely
        let detailsHtml = '<h4>Edge Details</h4>';
        detailsHtml += `<p><strong>ID:</strong> ${edgeData.id}</p>`;
        detailsHtml += `<p><strong>Source:</strong> ${edgeData.source}</p>`;
        detailsHtml += `<p><strong>Target:</strong> ${edgeData.target}</p>`;
        detailsHtml += `<p><strong>Type:</strong> ${edgeData.type || 'N/A'}</p>`;

        if (edgeData.label) {
            detailsHtml += `<p><strong>Label:</strong> ${edgeData.label}</p>`;
        }

        if (edgeData.relation) {
            detailsHtml += `<p><strong>Relation:</strong> ${edgeData.relation}</p>`;
        }

        if (edgeData.truth) {
            detailsHtml += `<p><strong>Truth:</strong> ${JSON.stringify(edgeData.truth)}</p>`;
        }

        if (edgeData.data) {
            detailsHtml += `<p><strong>Extra Data:</strong> ${JSON.stringify(edgeData.data)}</p>`;
        }

        this.detailsPanel.innerHTML = detailsHtml;
        this.detailsPanel.style.display = 'block';
      });

      this.cy.on('tap', (evt) => {
        if (evt.target === this.cy) {
          this.detailsPanel.style.display = 'none';
        }
      });
    }
  }

  _createDetailsPanel() {
    // Create details panel if it doesn't exist
    const panel = document.createElement('div');
    panel.id = 'details-panel';
    panel.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(255, 255, 255, 0.9);
      padding: 10px;
      border: 1px solid var(--border-color, #ccc);
      border-radius: 5px;
      display: none;
      max-width: 300px;
      max-height: 90%;
      overflow-y: auto;
      font-family: monospace;
      z-index: 1000;
    `;
    document.body.appendChild(panel);
    return panel;
  }

  _batchOperation(operation) {
    if (this.isBatching) {
      this.batchedOperations.push(operation);
    } else {
      this._executeOperation(operation);
    }
  }

  _executeOperation(operation) {
    operation();
  }

  _executeBatch() {
    if (this.batchedOperations.length === 0) return;

    this.cy.batch(() => {
      this.batchedOperations.forEach(op => this._executeOperation(op));
    });

    this.batchedOperations = [];
    this.isBatching = false;

    // After batch operations, run layout and fit
    this._fit();
  }

  startBatch() {
    this.isBatching = true;
  }

  endBatch() {
    this._executeBatch();
  }

  _addNode(nodeData) {
    this._batchOperation(() => {
      try {
        if (!this.cy.getElementById(nodeData.id)) {
          const elementData = this.createElement('nodes', nodeData);
          this.cy.add(elementData);
          this.nodeCache.add(nodeData.id);

          // Request a fit after adding nodes
          this._requestFit();
        }
      } catch (error) {
        console.error('Error adding node to graph', { error: error.message, nodeData });
      }
    });
  }

  _updateNode(nodeData) {
    this._batchOperation(() => {
      try {
        const node = this.cy.getElementById(nodeData.id);
        if (node) {
          node.data({ ...node.data(), ...nodeData });
        }
      } catch (error) {
        console.error('Error updating node in graph', { error: error.message, nodeData });
      }
    });
  }

  _removeNode(nodeData) {
    this._batchOperation(() => {
      try {
        const node = this.cy.getElementById(nodeData.id);
        if (node) {
          node.remove();
          this.nodeCache.delete(nodeData.id);
        }
      } catch (error) {
        console.error('Error removing node from graph', { error: error.message, nodeData });
      }
    });
  }

  _addEdge(edgeData) {
    this._batchOperation(() => {
      try {
        if (!this.cy.getElementById(edgeData.id)) {
          this.cy.add(this.createElement('edges', edgeData));
          // Also request a fit when edges are added
          this._requestFit();
        }
      } catch (error) {
        console.error('Error adding edge to graph', { error: error.message, edgeData });
      }
    });
  }

  _updateEdge(edgeData) {
    this._batchOperation(() => {
      try {
        const edge = this.cy.getElementById(edgeData.id);
        if (edge) {
          edge.data({ ...edge.data(), ...edgeData });
        }
      } catch (error) {
        console.error('Error updating edge in graph', { error: error.message, edgeData });
      }
    });
  }

  _removeEdge(edgeData) {
    this._batchOperation(() => {
      try {
        const edge = this.cy.getElementById(edgeData.id);
        if (edge) edge.remove();
      } catch (error) {
        console.error('Error removing edge from graph', { error: error.message, edgeData });
      }
    });
  }

  _setGraphSnapshot(snapshot) {
    this._batchOperation(() => {
      try {
        this._clear();
        this.nodeCache.clear();

        if (Array.isArray(snapshot.nodes) && snapshot.nodes.length > 0) {
          snapshot.nodes.forEach(node => this._addNode(node));
        }

        if (Array.isArray(snapshot.edges) && snapshot.edges.length > 0) {
          snapshot.edges.forEach(edge => this._addEdge(edge));
        }

        // Refresh layout after adding all nodes
        this._fit();
      } catch (error) {
        console.error('Error setting graph snapshot', { error: error.message, snapshot });
      }
    });
  }

  _clear() {
    this._batchOperation(() => {
      try {
        this.cy.elements().remove();
        this.nodeCache.clear();
      } catch (error) {
        console.error('Error clearing graph', { error: error.message });
      }
    });
  }

  _fit() {
    this._batchOperation(() => {
      try {
        // Run the COSE layout and fit to make nodes visible
        this.cy.layout({
          name: 'cose',
          animate: false,
          fit: true,
          padding: 30
        }).run();
      } catch (error) {
        console.error('Error running layout/fit', { error: error.message });
      }
    });
  }

  // Debounced fit function to avoid excessive fitting
  _requestFit() {
    this._debouncedFit?.();
  }

  createElement(group, data) {
    return { group, data: { ...data, id: data.id } };
  }

  _destroy() {
    try {
      this.nodeCache.clear();
      // Clear any pending fit timeout
      if (this.fitTimeout) {
        clearTimeout(this.fitTimeout);
        this.fitTimeout = null;
      }
      if (this.cy) {
        this.cy.destroy();
        this.cy = null;
      }
      // Remove graph container from DOM if it exists
      if (this.graphDiv && this.graphDiv.parentNode) {
        this.graphDiv.parentNode.removeChild(this.graphDiv);
      }
      this.graphDiv = null;
    } catch (error) {
      console.error('Error destroying Cytoscape renderer', { error: error.message });
    }
  }

  /**
   * Export the current graph data as JSON
   */
  _exportData() {
    if (!this.cy) return null;

    const nodes = this.cy.nodes().map(node => node.data());
    const edges = this.cy.edges().map(edge => edge.data());

    return { nodes, edges };
  }
}