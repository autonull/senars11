import { Config } from '../config/Config.js';
import { GraphOperationError } from '../errors/CustomErrors.js';

/**
 * GraphManager handles the Cytoscape instance and graph operations
 */
export class GraphManager {
  constructor(uiElements = null) {
    this.cy = null;
    this.uiElements = uiElements;
    this.graphData = {
      nodes: new Map(),
      edges: new Map()
    };

    // Debouncing for layout updates to improve performance
    this.layoutTimeout = null;
    this.pendingLayout = false;
    this.layoutDebounceTime = 300; // milliseconds
  }

  /**
   * Initialize the Cytoscape instance
   */
  initialize() {
    // Guard clause: Check if UI elements are available
    if (!this.uiElements?.graphContainer) {
      console.error('Graph container element not found');
      return false;
    }

    try {
      this.cy = cytoscape({
        container: this.uiElements.graphContainer,
        style: Config.getGraphStyle(),
        layout: Config.getGraphLayout()
      });
    } catch (error) {
      console.error('Failed to initialize Cytoscape:', error);
      return false;
    }

    // Add click event for graph details
    this.cy.on('tap', 'node', (event) => {
      const node = event.target;
      this._updateGraphDetails({
        type: 'node',
        label: node.data('label'),
        id: node.id(),
        nodeType: node.data('type') || 'unknown',
        weight: node.data('weight') || 0
      });
    });

    this.cy.on('tap', 'edge', (event) => {
      const edge = event.target;
      this._updateGraphDetails({
        type: 'edge',
        label: edge.data('label') || 'Relationship',
        source: edge.data('source'),
        target: edge.data('target'),
        edgeType: edge.data('type') || 'unknown'
      });
    });

    return true;
  }

  /**
   * Add a node to the graph
   * @param {Object} nodeData - Data for the node to be added
   * @param {string|number} [nodeData.id] - Unique identifier for the node
   * @param {string} [nodeData.label] - Display label for the node
   * @param {string} [nodeData.term] - Alternative term for the node
   * @param {string} [nodeData.type] - Type of the node (concept, task, etc.)
   * @param {string} [nodeData.nodeType] - Alternative property for node type
   * @param {Object} [nodeData.truth] - Truth value data for the node
   * @param {boolean} [runLayout=true] - Whether to run layout after adding the node
   * @returns {boolean} - True if node was successfully added, false otherwise
   */
  addNode(nodeData, runLayout = true) {
    if (!this.cy) return false;

    const { id, label, term, type: nodeType, nodeType: nodeTypeOverride } = nodeData;
    const nodeId = id || `concept_${Date.now()}`;

    // Don't add duplicate nodes
    if (this.cy.getElementById(nodeId).length) {
      return false;
    }

    // Create node data object efficiently
    const newNode = {
      group: 'nodes',
      data: {
        id: nodeId,
        label: label || term || id,
        type: nodeTypeOverride || nodeType || 'concept',
        weight: this._getNodeWeight(nodeData)
      }
    };

    this.cy.add(newNode);

    if (runLayout) {
      this._scheduleLayout();
    }
    return true;
  }

  /**
   * Calculate node weight based on input data
   */
  _getNodeWeight(nodeData) {
    const truth = nodeData.truth;
    return nodeData.weight || (truth?.confidence ? truth.confidence * 100 : Config.getConstants().DEFAULT_NODE_WEIGHT);
  }

  /**
   * Add an edge to the graph
   */
  addEdge(edgeData, runLayout = true) {
    if (!this.cy) return false;

    const { id, source, target, label, type: edgeType, edgeType: edgeTypeOverride } = edgeData;
    const edgeId = id || `edge_${Date.now()}_${source}_${target}`;

    // Don't add duplicate edges
    if (this.cy.getElementById(edgeId).length) {
      return false;
    }

    const newEdge = {
      group: 'edges',
      data: {
        id: edgeId,
        source,
        target,
        label: label || 'Relationship',
        type: edgeTypeOverride || edgeType || 'relationship'
      }
    };

    this.cy.add(newEdge);

    if (runLayout) {
      this._scheduleLayout();
    }
    return true;
  }

  /**
   * Update graph from a memory snapshot
   */
  updateFromSnapshot(payload) {
    if (!this.cy || !payload?.concepts) return;

    // Clear existing elements
    this.cy.elements().remove();

    // Add nodes from concepts in batch
    const nodes = payload.concepts?.map((concept, index) => ({
      group: 'nodes',
      data: {
        id: concept.id || `concept_${index}`,
        label: concept.term || `Concept ${index}`,
        type: concept.type || 'concept',
        weight: concept.truth?.confidence ? concept.truth.confidence * 100 : 50
      }
    })) || [];

    // Add nodes to graph if any exist
    if (nodes.length > 0) {
      this.cy.add(nodes);
    }

    // Layout the graph
    this._scheduleLayout();
  }

  /**
   * Update graph based on incoming message
   */
  updateFromMessage(message) {
    if (!this.cy) return;

    const messageUpdates = {
      'concept.created': () => this._addNodeWithPayload(message.payload, false),
      'concept.added': () => this._addNodeWithPayload(message.payload, false),
      'task.added': () => this._addNodeWithPayload({ ...message.payload, nodeType: 'task' }, false),
      'task.input': () => this._addNodeWithPayload({ ...message.payload, nodeType: 'task' }, false),
      'question.answered': () => this._addQuestionNode(message.payload),
      'memorySnapshot': () => {
        this.updateFromSnapshot(message.payload);
        return; // Snapshot updates already run layout
      }
    };

    const updateFn = messageUpdates[message.type];
    if (updateFn) {
      updateFn();

      // Only run layout once after processing the message, if we added nodes/edges
      if (this._shouldRunLayoutAfterMessage(message.type)) {
        this._scheduleLayout();
      }
    }
  }

  /**
   * Helper method to add a node with payload
   */
  _addNodeWithPayload(payload, runLayout = true) {
    if (payload) {
      this.addNode(payload, runLayout);
    }
  }

  /**
   * Helper method to add a question node
   */
  _addQuestionNode(payload) {
    if (payload) {
      const { answer, question } = payload;
      this.addNode({
        label: answer || question || 'Answer',
        nodeType: 'question',
        weight: Config.getConstants().QUESTION_NODE_WEIGHT
      }, false); // Don't run layout immediately
    }
  }

  /**
   * Determine if layout should run after a specific message type
   */
  _shouldRunLayoutAfterMessage(messageType) {
    return ['concept.created', 'concept.added', 'task.added', 'task.input', 'question.answered'].includes(messageType);
  }

  /**
   * Schedule a graph layout run with debouncing to improve performance
   * This prevents excessive layout calculations when multiple graph changes occur rapidly
   */
  _scheduleLayout() {
    this.pendingLayout = true;

    // Clear existing timeout to debounce
    if (this.layoutTimeout) {
      clearTimeout(this.layoutTimeout);
    }

    // Schedule layout to run after debounce time
    this.layoutTimeout = setTimeout(() => {
      if (this.pendingLayout && this.cy) {
        this.cy.layout(Config.getGraphLayout()).run();
        this.pendingLayout = false;
      }
    }, this.layoutDebounceTime);
  }

  /**
   * Run the graph layout immediately (without debouncing)
   */
  _runLayout() {
    if (this.cy) {
      this.cy.layout(Config.getGraphLayout()).run();
    }
  }

  /**
   * Update the graph details panel
   */
  _updateGraphDetails(details) {
    const graphDetailsElement = this.uiElements?.graphDetails;
    if (!graphDetailsElement) return;

    // Create content based on type to avoid duplicate code
    const content = details.type === 'node'
      ? this._createNodeDetailsContent(details)
      : this._createEdgeDetailsContent(details);

    graphDetailsElement.innerHTML = content;
  }

  /**
   * Create content for node details
   */
  _createNodeDetailsContent(details) {
    return `
      <strong>Node:</strong> ${details.label}<br>
      <strong>ID:</strong> ${details.id}<br>
      <strong>Type:</strong> ${details.nodeType}<br>
      <strong>Weight:</strong> ${details.weight}
    `;
  }

  /**
   * Create content for edge details
   */
  _createEdgeDetailsContent(details) {
    return `
      <strong>Edge:</strong> ${details.label}<br>
      <strong>Source:</strong> ${details.source}<br>
      <strong>Target:</strong> ${details.target}<br>
      <strong>Type:</strong> ${details.edgeType}
    `;
  }

  /**
   * Get node count
   */
  getNodeCount() {
    return this.cy ? this.cy.nodes().length : 0;
  }

  /**
   * Get task nodes
   */
  getTaskNodes() {
    return this.cy ? this.cy.nodes('[type = "task"]') : null;
  }

  /**
   * Get concept nodes
   */
  getConceptNodes() {
    return this.cy ? this.cy.nodes('[type = "concept"]') : null;
  }

  /**
   * Clear the graph
   */
  clear() {
    if (this.cy) {
      this.cy.elements().remove();
    }
  }

  /**
   * Destroy the graph manager and clean up resources
   */
  destroy() {
    if (this.layoutTimeout) {
      clearTimeout(this.layoutTimeout);
      this.layoutTimeout = null;
    }
    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }
  }
}