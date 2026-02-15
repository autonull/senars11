import Logger from './utils/logger.js';
import {
  ADD_NODE, UPDATE_NODE, REMOVE_NODE, ADD_EDGE, UPDATE_EDGE, REMOVE_EDGE,
  SET_GRAPH_SNAPSHOT, CLEAR_GRAPH, PROCESS_EVENT_BATCH, SET_LOADING_SNAPSHOT
} from './constants/actions.js';

/**
 * GraphController - Coordinates between the GraphView (renderer), StateStore, and WebSocketService
 */
export default class GraphController {
    constructor(graphView, store, service) {
        this.graphView = graphView;
        this.rendererManager = graphView.rendererManager;
        this.renderer = graphView.renderer;
        this.store = store;
        this.service = service;
        this.unsubscribe = null;
        this.isUpdatingGraph = false;
        this.nodeCache = new Set(); // Keep track of nodes for duplicate checking
        this.fitTimeout = null; // For debounced fitting
        this.init();
    }

    init() {
        this.unsubscribe = this.store.subscribe((state, action) => {
            this.handleStoreChange(state, action);
        });
    }

    handleStoreChange(state, action) {
        if (!state.isLiveUpdateEnabled && !action.type.startsWith('SET_GRAPH_')) {
            return;
        }

        try {
            const actionHandlers = {
                [ADD_NODE]: (payload) => this.addNode(payload),
                [UPDATE_NODE]: (payload) => this.updateNode(payload),
                [REMOVE_NODE]: (payload) => this.removeNode(payload),
                [ADD_EDGE]: (payload) => this.addEdge(payload),
                [UPDATE_EDGE]: (payload) => this.updateEdge(payload),
                [REMOVE_EDGE]: (payload) => this.removeEdge(payload),
                [SET_GRAPH_SNAPSHOT]: (payload) => this.setGraphSnapshot(payload),
                [CLEAR_GRAPH]: () => this.clearGraph(),
                [PROCESS_EVENT_BATCH]: (payload) => this.processEventBatch(payload)
            };

            const handler = actionHandlers[action.type];
            if (handler) handler(action.payload);
        } catch (error) {
            Logger.error('Error in GraphController handleStoreChange', { error: error.message, action });
        }
    }

    addNode(nodeData) {
        try {
            this.rendererManager.callRendererMethod('addNode', nodeData);
            this.nodeCache.add(nodeData.id);
        } catch (error) {
            Logger.error('Error adding node to graph', { error: error.message, nodeData });
        }
    }

    updateNode(nodeData) {
        try {
            this.rendererManager.callRendererMethod('updateNode', nodeData);
        } catch (error) {
            Logger.error('Error updating node in graph', { error: error.message, nodeData });
        }
    }

    removeNode(nodeData) {
        try {
            this.rendererManager.callRendererMethod('removeNode', nodeData);
            this.nodeCache.delete(nodeData.id);
        } catch (error) {
            Logger.error('Error removing node from graph', { error: error.message, nodeData });
        }
    }

    addEdge(edgeData) {
        try {
            this.rendererManager.callRendererMethod('addEdge', edgeData);
        } catch (error) {
            Logger.error('Error adding edge to graph', { error: error.message, edgeData });
        }
    }

    updateEdge(edgeData) {
        try {
            this.rendererManager.callRendererMethod('updateEdge', edgeData);
        } catch (error) {
            Logger.error('Error updating edge in graph', { error: error.message, edgeData });
        }
    }

    removeEdge(edgeData) {
        try {
            this.rendererManager.callRendererMethod('removeEdge', edgeData);
        } catch (error) {
            Logger.error('Error removing edge from graph', { error: error.message, edgeData });
        }
    }

    setGraphSnapshot(snapshot) {
        try {
            this.clearGraph();
            this.nodeCache.clear();

            if (Array.isArray(snapshot.nodes) && snapshot.nodes.length) {
                snapshot.nodes.forEach(node => this.addNode(node));
            }

            if (Array.isArray(snapshot.edges) && snapshot.edges.length) {
                snapshot.edges.forEach(edge => this.addEdge(edge));
            }

            // Refresh layout after adding all nodes
            this.rendererManager.callRendererMethod('fit');
        } catch (error) {
            Logger.error('Error setting graph snapshot', { error: error.message, snapshot });
        }
    }

    clearGraph() {
        try {
            this.rendererManager.callRendererMethod('clear');
            this.nodeCache.clear();
        } catch (error) {
            Logger.error('Error clearing graph', { error: error.message });
        }
    }

    processEventBatch(eventBatch) {
        // This method is now handled primarily by EventProcessor, but kept for compatibility
        try {
            const { events } = eventBatch;
            for (const event of events) {
                const innerEvents = event.type === 'eventBatch' ? event.data : [event];
                innerEvents.forEach(event => {
                    // Process individual events as needed
                    this.processSingleEvent(event);
                });
            }
        } catch (error) {
            Logger.error('Error processing event batch', { error: error.message, eventBatch });
        }
    }

    processSingleEvent(event) {
        // This method is now handled primarily by EventProcessor, but kept for compatibility
        try {
            const eventHandlers = {
                'concept.created': (data) => {
                    const id = data.term?.toString() ?? `concept_${Date.now()}`;
                    this.addNode({
                        id,
                        label: data.term?.toString() ?? 'Unknown Concept',
                        type: 'concept',
                        term: data.term,
                        data
                    });
                },
                'task.added': (data) => {
                    this.createTaskNode(data, 'task');
                },
                'belief.added': (data) => {
                    this.createTaskNode(data, 'belief');
                },
                'goal.added': (data) => {
                    this.createTaskNode(data, 'goal');
                },
                'question.added': (data) => {
                    this.createTaskNode(data, 'question');
                },
                'task.processed': (data) => {
                    // Update the task node to reflect it has been processed
                    const id = data.task?.id ?? data.id ?? `task_${Date.now()}`;
                    this.updateNode({
                        id,
                        type: 'processed_task',
                        label: data.task?.toString() ?? 'Processed Task'
                    });
                },
                'reasoning.derivation': (data) => {
                    // Handle reasoning derivation events
                    const sourceId = `derivation_source_${Date.now()}`;
                    const targetId = `derivation_target_${Date.now()}`;

                    // Add source and target nodes for the derivation
                    this.addNode({
                        id: sourceId,
                        label: 'Derivation Source',
                        type: 'reasoning_step',
                        data
                    });

                    this.addNode({
                        id: targetId,
                        label: 'Derived Conclusion',
                        type: 'reasoning_step',
                        data
                    });

                    // Add an edge to represent the derivation
                    this.addEdge({
                        id: `edge_${sourceId}_${targetId}`,
                        source: sourceId,
                        target: targetId,
                        type: 'derivation',
                        label: 'derivation',
                        data
                    });
                }
            };

            const handler = eventHandlers[event.type];
            if (handler) handler(event.data);
        } catch (error) {
            Logger.error('Error processing single event', { error: error.message, event });
        }
    }

    createTaskNode(data, type) {
        try {
            const id = data.task?.id ?? data.id ?? `task_${Date.now()}`;
            this.addNode({
                id,
                label: data.task?.toString() ?? data.toString() ?? 'Unknown Task',
                type,
                data
            });
        } catch (error) {
            Logger.error('Error creating task node', { error: error.message, data, type });
        }
    }

    requestRefresh() {
        try {
            this.store.dispatch({ type: SET_LOADING_SNAPSHOT, payload: true });
            this.service.sendMessage('control/refresh', {});
        } catch (error) {
            Logger.error('Error requesting graph refresh', { error: error.message });
        }
    }

    handleRefreshResponse(payload) {
        try {
            this.store.dispatch({
                type: SET_GRAPH_SNAPSHOT,
                payload: {
                    nodes: payload.concepts?.map(concept => ({
                        id: concept.term?.toString() || `concept_${Date.now()}`,
                        label: concept.term?.toString() || 'Unknown Concept',
                        type: 'concept',
                        data: concept
                    })) || [],
                    edges: []
                }
            });

            this.store.dispatch({ type: SET_LOADING_SNAPSHOT, payload: false });
        } catch (error) {
            Logger.error('Error handling refresh response', { error: error.message, payload });
        }
    }

    destroy() {
        try {
            this.unsubscribe?.();
            this.nodeCache.clear();
            // Clear any pending fit timeout
            if (this.fitTimeout) {
                clearTimeout(this.fitTimeout);
                this.fitTimeout = null;
            }
            this.rendererManager?.destroy();
        } catch (error) {
            Logger.error('Error destroying GraphController', { error: error.message });
        }
    }
}