import Logger from './utils/logger.js';
import {
  ADD_LOG_ENTRY, SET_CONNECTION_STATUS, ADD_NODE, ADD_EDGE
} from './constants/actions.js';

/**
 * REPLController - Coordinates between the REPLView, StateStore, and WebSocketService
 */
export default class REPLController {
    constructor(viewAPI, store, service) {
        this.viewAPI = viewAPI;
        this.store = store;
        this.service = service;
        this.unsubscribe = null;
        this.sessionInputCount = 0;
        this.sessionOutputCount = 0;
        this.commandHistory = [];
        this.init();
    }

    init() {
        try {
            this.unsubscribe = this.store.subscribe((state, action) => {
                this.handleStoreChange(state, action);
            });

            this.viewAPI.setCommandHandler(this.handleCommand.bind(this));
        } catch (error) {
            Logger.error('Error initializing REPLController', { error: error.message });
        }
    }

    handleStoreChange(state, action) {
        try {
            const actionHandlers = {
                [ADD_LOG_ENTRY]: () => {
                    const content = `[LOG] ${action.payload.content}`;
                    // Choose CSS class based on log type
                    let cssClass = 'console-info';
                    if (action.payload.type === 'error') {
                        cssClass = 'console-error';
                    } else if (action.payload.type === 'out') {
                        cssClass = 'console-sent';
                    } else if (action.payload.type === 'in') {
                        cssClass = 'console-received';
                    }
                    this.viewAPI.addOutput(content, cssClass);
                },
                [SET_CONNECTION_STATUS]: () => {
                    // Only show status changes if they're different from the previous status
                    this.viewAPI.addOutput(`[STATUS] Connection: ${state.connectionStatus}`, 'console-info');
                }
            };

            const handler = actionHandlers[action.type];
            handler?.();
        } catch (error) {
            Logger.error('Error in REPLController handleStoreChange', { error: error.message, action });
        }
    }

    handleCommand(command) {
        try {
            this.viewAPI.addToHistory(command);

            // Add to internal command history
            this.commandHistory.push({
                command: command,
                timestamp: new Date(),
                status: 'sent'
            });

            // Handle special debug commands
            if (command.trim().startsWith('/')) {
                this._handleDebugCommand(command.trim());
            } else {
                // Regular NARS command
                const success = this.service.sendCommand(command);

                if (success) {
                    this.sessionInputCount++; // Increment input counter
                    this.store.dispatch({
                        type: ADD_LOG_ENTRY,
                        payload: { content: `SENT: ${command}`, type: 'out' }
                    });
                    // Add to console output with sent message styling
                    this.viewAPI.addOutput(`[SENT] ${command}`, 'console-sent');
                    this._updateSessionStats();
                } else {
                    this.viewAPI.addOutput(`[ERROR] Failed to send command: ${command}`, 'console-error');
                    // Update history status
                    if (this.commandHistory.length > 0) {
                        this.commandHistory[this.commandHistory.length - 1].status = 'error';
                    }
                }
            }
        } catch (error) {
            Logger.error('Error handling command', { error: error.message, command });
        }
    }

    _updateSessionStats() {
        // Update the session stats in the UI
        const sessionStatsElement = document.getElementById('session-stats');
        if (sessionStatsElement) {
            sessionStatsElement.textContent = `Session: ${this.sessionInputCount} inputs, ${this.sessionOutputCount} outputs`;
        }
    }

    _handleDebugCommand(command) {
        if (command === '/tasks') {
            // Get current tasks from state
            const state = this.store.getState();
            const taskNodes = Array.from(state.graph.nodes.values()).filter(node =>
                ['task', 'belief', 'question', 'input_task', 'processed_task'].includes(node.type)
            );

            if (taskNodes.length > 0) {
                this.viewAPI.addOutput(`[DEBUG] Found ${taskNodes.length} tasks in graph state:`);
                taskNodes.forEach(node => {
                    // Handle both string and object labels
                    let labelDisplay = node.label;
                    if (typeof node.label === 'object' && node.label !== null) {
                        labelDisplay = node.label.toString ? node.label.toString() : JSON.stringify(node.label);
                    } else if (!labelDisplay) {
                        labelDisplay = node.id;
                    }
                    this.viewAPI.addOutput(`  - ${node.type.toUpperCase()}: ${labelDisplay}`);
                });
            } else {
                this.viewAPI.addOutput(`[DEBUG] No tasks found in graph state`);
            }

            // Also log to store
            this.store.dispatch({
                type: ADD_LOG_ENTRY,
                payload: { content: `DEBUG: Found ${taskNodes.length} tasks in graph state`, type: 'debug' }
            });
        } else if (command === '/concepts') {
            // Get current concepts from state
            const state = this.store.getState();
            const conceptNodes = Array.from(state.graph.nodes.values()).filter(node => node.type === 'concept');

            if (conceptNodes.length > 0) {
                this.viewAPI.addOutput(`[DEBUG] Found ${conceptNodes.length} concepts in graph state:`);
                conceptNodes.forEach(node => {
                    // Handle both string and object labels
                    let labelDisplay = node.label;
                    if (typeof node.label === 'object' && node.label !== null) {
                        labelDisplay = node.label.toString ? node.label.toString() : JSON.stringify(node.label);
                    } else if (!labelDisplay) {
                        labelDisplay = node.id;
                    }
                    this.viewAPI.addOutput(`  - CONCEPT: ${labelDisplay}`);
                });
            } else {
                this.viewAPI.addOutput(`[DEBUG] No concepts found in graph state`);
            }

            // Also log to store
            this.store.dispatch({
                type: ADD_LOG_ENTRY,
                payload: { content: `DEBUG: Found ${conceptNodes.length} concepts in graph state`, type: 'debug' }
            });
        } else if (command === '/nodes') {
            // Get all nodes from state
            const state = this.store.getState();
            const nodes = Array.from(state.graph.nodes.values());

            if (nodes.length > 0) {
                this.viewAPI.addOutput(`[DEBUG] Found ${nodes.length} total nodes in graph state:`);
                const typeCounts = {};
                nodes.forEach(node => {
                    typeCounts[node.type] = (typeCounts[node.type] || 0) + 1;
                    if (typeCounts[node.type] <= 5) { // Only show first 5 of each type to avoid spam
                        // Handle both string and object labels
                        let labelDisplay = node.label;
                        if (typeof node.label === 'object' && node.label !== null) {
                            labelDisplay = node.label.toString ? node.label.toString() : JSON.stringify(node.label);
                        } else if (!labelDisplay) {
                            labelDisplay = node.id;
                        }
                        this.viewAPI.addOutput(`  - ${node.type.toUpperCase()}: ${labelDisplay}`);
                    }
                });

                this.viewAPI.addOutput(`[DEBUG] Type breakdown: ${JSON.stringify(typeCounts)}`);
            } else {
                this.viewAPI.addOutput(`[DEBUG] No nodes found in graph state`);
            }

            // Also log to store
            this.store.dispatch({
                type: ADD_LOG_ENTRY,
                payload: { content: `DEBUG: Found ${nodes.length} total nodes in graph state`, type: 'debug' }
            });
        } else if (command === '/state') {
            // Show connection status and basic state info
            const state = this.store.getState();
            this.viewAPI.addOutput(`[DEBUG] Connection: ${state.connectionStatus}`);
            this.viewAPI.addOutput(`[DEBUG] Live updates: ${state.isLiveUpdateEnabled ? 'ON' : 'OFF'}`);
            this.viewAPI.addOutput(`[DEBUG] State Store - Nodes: ${state.graph.nodes.size}, Edges: ${state.graph.edges.size}`);

            // Also check what's actually in the Cytoscape graph directly
            try {
                // Access the global cytoscape instance that's exposed for testing
                if (window.cy) {
                    const cyNodesCount = window.cy.nodes().length;
                    const cyEdgesCount = window.cy.edges().length;
                    const cyElementsCount = window.cy.elements().length;

                    this.viewAPI.addOutput(`[DEBUG] Cytoscape Instance - Nodes: ${cyNodesCount}, Edges: ${cyEdgesCount}, Total Elements: ${cyElementsCount}`);

                    if (cyNodesCount > 0) {
                        this.viewAPI.addOutput(`[DEBUG] Sample Cytoscape nodes: ${window.cy.nodes().slice(0, 3).map(node => node.id()).join(', ')}`);
                    }
                    if (cyEdgesCount > 0) {
                        this.viewAPI.addOutput(`[DEBUG] Sample Cytoscape edges: ${window.cy.edges().slice(0, 3).map(edge => edge.id()).join(', ')}`);
                    }
                } else {
                    this.viewAPI.addOutput(`[DEBUG] Cytoscape instance not available in window.cy`);
                }
            } catch (error) {
                this.viewAPI.addOutput(`[DEBUG] Error accessing Cytoscape instance: ${error.message}`);
            }

            this.viewAPI.addOutput(`[DEBUG] Log entries: ${state.logEntries.length}`);

            // Also log to store
            this.store.dispatch({
                type: ADD_LOG_ENTRY,
                payload: { content: `DEBUG: State - ${state.connectionStatus}, StateStore: ${state.graph.nodes.size}/${state.graph.edges.size}, Cytoscape: ${window.cy ? window.cy.nodes().length + '/' + window.cy.edges().length : 'N/A'}`, type: 'debug' }
            });
        } else if (command === '/refresh' || command === '/reload') {
            // Trigger graph refresh similar to the refresh button
            this.viewAPI.addOutput(`[DEBUG] Requesting graph refresh...`);
            this.service.sendMessage('control/refresh', {});

            this.store.dispatch({
                type: ADD_LOG_ENTRY,
                payload: { content: 'DEBUG: Requested graph refresh', type: 'debug' }
            });
        } else if (command === '/cy-stats' || command === '/cy-info') {
            // Direct Cytoscape instance inspection
            this._inspectCytoscape();
        } else if (command === '/debug-visualize' || command === '/debug-graph') {
            // Add dummy nodes and edges for visualization testing
            this._addDummyVisualization();
        } else if (command === '/history') {
            if (this.commandHistory.length === 0) {
                this.viewAPI.addOutput(`[DEBUG] No commands in history.`);
            } else {
                this.viewAPI.addOutput(`[DEBUG] Command History (${this.commandHistory.length} commands):`);
                // Show last 10 commands
                const start = Math.max(0, this.commandHistory.length - 10);
                for (let i = start; i < this.commandHistory.length; i++) {
                    const entry = this.commandHistory[i];
                    const status = entry.status === 'error' ? '❌' : '✅';
                    this.viewAPI.addOutput(`  ${status} [${i + 1}] ${entry.command} (${entry.timestamp.toLocaleTimeString()})`);
                }
            }
        } else if (command === '/clear-history') {
            this.commandHistory = [];
            this.viewAPI.addOutput(`[DEBUG] Command history cleared.`);
        } else if (command === '/stats') {
            this.viewAPI.addOutput(`[DEBUG] Session Statistics:`);
            this.viewAPI.addOutput(`  Inputs sent: ${this.sessionInputCount}`);
            this.viewAPI.addOutput(`  Outputs received: ${this.sessionOutputCount}`);
            this.viewAPI.addOutput(`  Command history entries: ${this.commandHistory.length}`);
            this.viewAPI.addOutput(`  Connection status: ${this.store.getState().connectionStatus}`);
            this.viewAPI.addOutput(`  Live updates: ${this.store.getState().isLiveUpdateEnabled ? 'ON' : 'OFF'}`);
            this.viewAPI.addOutput(`  Graph nodes: ${this.store.getState().graph.nodes.size}`);
            this.viewAPI.addOutput(`  Graph edges: ${this.store.getState().graph.edges.size}`);
        } else if (command === '/help') {
            this.viewAPI.addOutput(`[DEBUG] Available debug commands:`);
            this.viewAPI.addOutput(`  /tasks - Show tasks in graph state`);
            this.viewAPI.addOutput(`  /concepts - Show concepts in graph state`);
            this.viewAPI.addOutput(`  /nodes - Show all nodes in graph state`);
            this.viewAPI.addOutput(`  /state - Show current state summary`);
            this.viewAPI.addOutput(`  /history - Show command history`);
            this.viewAPI.addOutput(`  /clear-history - Clear command history`);
            this.viewAPI.addOutput(`  /stats - Show session statistics`);
            this.viewAPI.addOutput(`  /refresh or /reload - Request graph refresh`);
            this.viewAPI.addOutput(`  /cy-stats or /cy-info - Show direct Cytoscape stats`);
            this.viewAPI.addOutput(`  /debug-visualize or /debug-graph - Add dummy nodes/edges for testing`);
            this.viewAPI.addOutput(`  /help - Show this help`);
        } else {
            this.viewAPI.addOutput(`[ERROR] Unknown debug command: ${command}. Type /help for available commands.`);
        }
    }

    _inspectCytoscape() {
        try {
            if (!window.cy) {
                this.viewAPI.addOutput(`[DEBUG] Cytoscape instance not available in window.cy`);
                return;
            }

            const cy = window.cy;
            const nodes = cy.nodes();
            const edges = cy.edges();
            const elements = cy.elements();

            this.viewAPI.addOutput(`[DEBUG] Cytoscape Direct Inspection:`);
            this.viewAPI.addOutput(`  - Total Elements: ${elements.length}`);
            this.viewAPI.addOutput(`  - Nodes: ${nodes.length}`);
            this.viewAPI.addOutput(`  - Edges: ${edges.length}`);
            this.viewAPI.addOutput(`  - Viewport dimensions: ${cy.width()} x ${cy.height()}`);

            if (nodes.length > 0) {
                this.viewAPI.addOutput(`  - Node IDs: ${nodes.map(node => node.id()).join(', ')}`);
                // Show detailed info for first node
                const firstNode = nodes[0];
                this.viewAPI.addOutput(`  - First node data: ${JSON.stringify(firstNode.data())}`);
            }

            if (edges.length > 0) {
                this.viewAPI.addOutput(`  - Edge IDs: ${edges.map(edge => edge.id()).join(', ')}`);
            }

            // Check viewport
            const viewport = cy.viewport();
            this.viewAPI.addOutput(`  - Zoom: ${viewport.zoom}`);
            this.viewAPI.addOutput(`  - Pan: (${viewport.pan.x}, ${viewport.pan.y})`);

        } catch (error) {
            this.viewAPI.addOutput(`[ERROR] Error inspecting Cytoscape: ${error.message}`);
            Logger.error('Error inspecting cytoscape', { error: error.message });
        }
    }

    _addDummyVisualization() {
        try {
            this.viewAPI.addOutput(`[DEBUG] Adding dummy visualization nodes and edges...`);

            // Create dummy nodes
            const dummyNodes = [
                {id: 'concept_a', label: 'Concept A', type: 'concept', data: {term: 'A'}},
                {id: 'concept_b', label: 'Concept B', type: 'concept', data: {term: 'B'}},
                {id: 'task_1', label: '<A --> B>', type: 'task', data: {task: '<A --> B>'}},
                {id: 'belief_1', label: '<A --> B>. %1.0;0.9%', type: 'belief', data: {task: '<A --> B>. %1.0;0.9%'}},
                {id: 'question_1', label: '<A --> B>?', type: 'question', data: {task: '<A --> B>?'}}
            ];

            // Create dummy edges
            const dummyEdges = [
                {id: 'edge_1', source: 'concept_a', target: 'concept_b', label: 'rel1', type: 'relation', data: {relation: 'inheritance'}},
                {id: 'edge_2', source: 'concept_a', target: 'task_1', label: 'input', type: 'input', data: {type: 'input'}},
                {id: 'edge_3', source: 'task_1', target: 'belief_1', label: 'result', type: 'result', data: {type: 'result'}}
            ];

            // Dispatch actions to add nodes to the state
            dummyNodes.forEach(node => {
                this.store.dispatch({
                    type: ADD_NODE,
                    payload: node
                });
            });

            dummyEdges.forEach(edge => {
                this.store.dispatch({
                    type: ADD_EDGE,
                    payload: edge
                });
            });

            this.viewAPI.addOutput(`[DEBUG] Added ${dummyNodes.length} dummy nodes and ${dummyEdges.length} dummy edges to graph state`);
            this.viewAPI.addOutput(`[DEBUG] Check the visualization to see if they appear`);

            this.store.dispatch({
                type: ADD_LOG_ENTRY,
                payload: { content: `DEBUG: Added ${dummyNodes.length} nodes and ${dummyEdges.length} edges for visualization testing`, type: 'debug' }
            });

        } catch (error) {
            Logger.error('Error adding dummy visualization', { error: error.message });
            this.viewAPI.addOutput(`[ERROR] Failed to add dummy visualization: ${error.message}`);
        }
    }

    handleIncomingMessage(message) {
        try {
            // Display certain message types with formatted output in the REPL log
            if (message.type === 'connection' || message.type === 'error') {
                const content = message.data?.message || message.payload?.message || JSON.stringify(message);
                this.store.dispatch({
                    type: ADD_LOG_ENTRY,
                    payload: { content: `INFO: ${content}`, type: 'in' }
                });

                this.viewAPI.addOutput(`[INFO] ${content}`, 'console-info');
                this.sessionOutputCount++;  // Increment output counter
                this._updateSessionStats();
            } else if (message.type === 'control/ack') {
                const content = `Command ack: ${message.payload?.command} - ${message.payload?.status}`;
                this.store.dispatch({
                    type: ADD_LOG_ENTRY,
                    payload: { content, type: 'in' }
                });

                this.viewAPI.addOutput(`[CMD] ${content}`, 'console-info');
                this.sessionOutputCount++;  // Increment output counter
                this._updateSessionStats();
            } else if (message.type === 'narsese.result') {
                // Handle Narsese results with appropriate formatting
                const content = message.payload?.result || message.data?.result || JSON.stringify(message.payload);
                this.store.dispatch({
                    type: ADD_LOG_ENTRY,
                    payload: { content: `RESULT: ${content}`, type: 'in' }
                });

                this.viewAPI.addOutput(`[RESULT] ${content}`, 'console-success');
                this.sessionOutputCount++;  // Increment output counter
                this._updateSessionStats();
            } else if (message.type === 'error' || message.type.includes('error')) {
                const content = message.payload?.message || message.data?.message || JSON.stringify(message);
                this.store.dispatch({
                    type: ADD_LOG_ENTRY,
                    payload: { content: `ERROR: ${content}`, type: 'error' }
                });

                this.viewAPI.addOutput(`[ERROR] ${content}`, 'console-error');
                this.sessionOutputCount++;  // Increment output counter
                this._updateSessionStats();
            } else {
                // For visualization-related messages, show them to provide feedback to user
                const visualizationTypes = ['task.added', 'concept.created', 'belief.added',
                                           'question.answered', 'reasoning.derivation', 'reasoning.step',
                                           'task.processed', 'task.input'];

                if (visualizationTypes.includes(message.type)) {
                    // Format visualization messages nicely for the user
                    const content = message.data?.task?.toString?.() ||
                                  message.data?.term?.toString?.() ||
                                  message.payload?.message ||
                                  JSON.stringify(message);

                    this.store.dispatch({
                        type: ADD_LOG_ENTRY,
                        payload: { content: `VISUAL: ${message.type} - ${content}`, type: 'in' }
                    });

                    this.viewAPI.addOutput(`[VIS] ${message.type} - ${content}`, 'console-debug');
                    this.sessionOutputCount++;  // Increment output counter
                    this._updateSessionStats();
                } else {
                    // For other message types that aren't visualization related, log them as debug info
                    if (message.type && !message.type.startsWith('internal.')) {
                        const content = JSON.stringify(message.payload || message.data || message);
                        this.viewAPI.addOutput(`[MSG] ${message.type}: ${content}`, 'console-debug');
                        this.sessionOutputCount++;  // Increment output counter
                        this._updateSessionStats();
                    }
                }
            }
            // Other message types are processed internally by the event processor for graph updates
            // but don't display the raw JSON in the REPL view
        } catch (error) {
            Logger.error('Error handling incoming message', { error: error.message, message });
            this.viewAPI.addOutput(`[ERROR] Failed to process message: ${error.message}`, 'console-error');
            this.sessionOutputCount++;  // Increment output counter
            this._updateSessionStats();
        }
    }

    destroy() {
        try {
            this.unsubscribe?.();
        } catch (error) {
            Logger.error('Error destroying REPLController', { error: error.message });
        }
    }
}