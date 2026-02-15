import BaseRenderer from './base-renderer.js';
import cytoscape from 'cytoscape';
import GraphLayout from '../config/graph-layout.js';

/**
 * DirectCytoscapeRenderer - A renderer that applies changes immediately without batching
 */
export default class DirectCytoscapeRenderer extends BaseRenderer {
  constructor() {
    super();
    this.cy = null;
    this.container = null;
    this.nodeCache = new Set();
  }

  init(container) {
    this.container = container;
    
    // Create the graph container element
    const graphDiv = document.createElement('div');
    Object.assign(graphDiv, { id: 'cy-graph' });
    Object.assign(graphDiv.style, {
      width: '100%',
      height: '100%',
      border: '1px solid #ccc'
    });

    container.appendChild(graphDiv);

    const styleConfig = GraphLayout.getNodeStyleOptions();

    this.cy = cytoscape({
      container: graphDiv,
      style: styleConfig.style,
      layout: GraphLayout.getLayoutOptions()
    });

    // Expose for testing if needed
    window.cy = this.cy;

    // Add event listeners for interactivity
    const detailsPanel = document.getElementById('details-panel') || 
                         document.querySelector('#details-panel') ||
                         this._createDetailsPanel();
    
    if (detailsPanel) {
      this.cy.on('tap', 'node', (evt) => {
        const node = evt.target;
        detailsPanel.innerHTML = `<pre>${JSON.stringify(node.data(), null, 2)}</pre>`;
        detailsPanel.style.display = 'block';
      });

      this.cy.on('tap', (evt) => {
        if (evt.target === this.cy) {
          detailsPanel.style.display = 'none';
        }
      });
    }

    return this.cy;
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
      border: 1px solid #ccc;
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

  addNode(nodeData) {
    try {
      if (!this.cy.getElementById(nodeData.id)) {
        const elementData = this.createElement('nodes', nodeData);
        this.cy.add(elementData);
        this.nodeCache.add(nodeData.id);

        // Immediately run layout to make the node visible
        this.fit();
      }
    } catch (error) {
      console.error('Error adding node to graph', { error: error.message, nodeData });
    }
  }

  updateNode(nodeData) {
    try {
      const node = this.cy.getElementById(nodeData.id);
      if (node) {
        node.data({ ...node.data(), ...nodeData });
      }
    } catch (error) {
      console.error('Error updating node in graph', { error: error.message, nodeData });
    }
  }

  removeNode(nodeData) {
    try {
      const node = this.cy.getElementById(nodeData.id);
      if (node) {
        node.remove();
        this.nodeCache.delete(nodeData.id);
        this.fit();
      }
    } catch (error) {
      console.error('Error removing node from graph', { error: error.message, nodeData });
    }
  }

  addEdge(edgeData) {
    try {
      if (!this.cy.getElementById(edgeData.id)) {
        this.cy.add(this.createElement('edges', edgeData));
        this.fit();
      }
    } catch (error) {
      console.error('Error adding edge to graph', { error: error.message, edgeData });
    }
  }

  updateEdge(edgeData) {
    try {
      const edge = this.cy.getElementById(edgeData.id);
      if (edge) {
        edge.data({ ...edge.data(), ...edgeData });
      }
    } catch (error) {
      console.error('Error updating edge in graph', { error: error.message, edgeData });
    }
  }

  removeEdge(edgeData) {
    try {
      const edge = this.cy.getElementById(edgeData.id);
      if (edge) {
        edge.remove();
        this.fit();
      }
    } catch (error) {
      console.error('Error removing edge from graph', { error: error.message, edgeData });
    }
  }

  setGraphSnapshot(snapshot) {
    try {
      this.clear();
      this.nodeCache.clear();

      if (Array.isArray(snapshot.nodes) && snapshot.nodes.length) {
        snapshot.nodes.forEach(node => this.addNode(node));
      }

      if (Array.isArray(snapshot.edges) && snapshot.edges.length) {
        snapshot.edges.forEach(edge => this.addEdge(edge));
      }

      // Refresh layout after adding all nodes
      this.fit();
    } catch (error) {
      console.error('Error setting graph snapshot', { error: error.message, snapshot });
    }
  }

  clear() {
    try {
      this.cy.elements().remove();
      this.nodeCache.clear();
    } catch (error) {
      console.error('Error clearing graph', { error: error.message });
    }
  }

  fit() {
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
  }

  createElement(group, data) {
    return { group, data: { ...data, id: data.id } };
  }

  destroy() {
    try {
      this.nodeCache.clear();
      if (this.cy) {
        this.cy.destroy();
        this.cy = null;
      }
    } catch (error) {
      console.error('Error destroying Cytoscape renderer', { error: error.message });
    }
  }
}