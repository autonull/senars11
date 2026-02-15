/**
 * Unit tests for StateStore using centralized test utilities
 */

import StateStore from '../../../ui/src/state-store.js';
import configManager from '../../../ui/src/config/config-manager.js';
import {
    assert,
    assertTrue,
    assertFalse,
    assertEquals,
    assertDeepEqual,
    runTest,
    runTestSuite
} from './test-utils.js';

function testStateStore() {
    const tests = [
        {
            desc: 'Constructor initializes state properly',
            fn: () => {
                const store = new StateStore();
                const state = store.getState();

                assertEquals(state.connectionStatus, 'disconnected', 'Initial connection status should be disconnected');
                assertTrue(state.isLiveUpdateEnabled, 'Initial live update should be enabled');
                assertTrue(Array.isArray(state.logEntries), 'Log entries should be an array');
                assertTrue(state.graph.nodes instanceof Map, 'Graph nodes should be a Map');
                assertTrue(state.graph.edges instanceof Map, 'Graph edges should be a Map');
            }
        },
        {
            desc: 'Subscribe and get state',
            fn: () => {
                const store = new StateStore();
                let receivedState = null;

                const unsubscribe = store.subscribe((state) => {
                    receivedState = state;
                });

                store.dispatch({ type: 'SET_CONNECTION_STATUS', payload: 'connected' });

                assertTrue(receivedState !== null, 'Subscriber should receive state updates');
                assertEquals(receivedState.connectionStatus, 'connected', 'Subscriber should receive updated state');

                unsubscribe();
            }
        },
        {
            desc: 'SET_CONNECTION_STATUS action',
            fn: () => {
                const store = new StateStore();

                store.dispatch({ type: 'SET_CONNECTION_STATUS', payload: 'connecting' });
                assertEquals(store.getState().connectionStatus, 'connecting', 'Connection status should update to connecting');

                store.dispatch({ type: 'SET_CONNECTION_STATUS', payload: 'connected' });
                assertEquals(store.getState().connectionStatus, 'connected', 'Connection status should update to connected');
            }
        },
        {
            desc: 'SET_LIVE_UPDATE_ENABLED action',
            fn: () => {
                const store = new StateStore();

                store.dispatch({ type: 'SET_LIVE_UPDATE_ENABLED', payload: false });
                assertFalse(store.getState().isLiveUpdateEnabled, 'Live update should be disabled');

                store.dispatch({ type: 'SET_LIVE_UPDATE_ENABLED', payload: true });
                assertTrue(store.getState().isLiveUpdateEnabled, 'Live update should be enabled');
            }
        },
        {
            desc: 'ADD_LOG_ENTRY action with proper limiting',
            fn: () => {
                const store = new StateStore();
                const maxLogEntries = configManager.getMaxLogEntries();

                for (let i = 0; i < maxLogEntries + 5; i++) {
                    store.dispatch({
                        type: 'ADD_LOG_ENTRY',
                        payload: {
                            content: `Log entry ${i}`,
                            type: 'out'
                        }
                    });
                }

                const logEntries = store.getState().logEntries;
                assertTrue(logEntries.length <= maxLogEntries, `Log entries should be limited to ${maxLogEntries}`);
                assertEquals(logEntries[0].content, `Log entry ${maxLogEntries + 4}`, 'Latest entry should be first');
            }
        },
        {
            desc: 'ADD_NODE, UPDATE_NODE, REMOVE_NODE actions',
            fn: () => {
                const store = new StateStore();
                const nodeId = 'node1';

                // Add a node
                store.dispatch({
                    type: 'ADD_NODE',
                    payload: { id: nodeId, label: 'Test Node', type: 'concept' }
                });

                let nodes = store.getState().graph.nodes;
                assertTrue(nodes.has(nodeId), 'Node should be added to the graph');
                assertEquals(nodes.get(nodeId).label, 'Test Node', 'Node should have correct label');

                // Update the node
                store.dispatch({
                    type: 'UPDATE_NODE',
                    payload: { id: nodeId, label: 'Updated Node' }
                });

                nodes = store.getState().graph.nodes;
                assertEquals(nodes.get(nodeId).label, 'Updated Node', 'Node should be updated');

                // Remove the node
                store.dispatch({
                    type: 'REMOVE_NODE',
                    payload: { id: nodeId }
                });

                nodes = store.getState().graph.nodes;
                assertFalse(nodes.has(nodeId), 'Node should be removed from the graph');
            }
        },
        {
            desc: 'ADD_EDGE, UPDATE_EDGE, REMOVE_EDGE actions',
            fn: () => {
                const store = new StateStore();
                const edgeId = 'edge1';

                // Add an edge
                store.dispatch({
                    type: 'ADD_EDGE',
                    payload: { id: edgeId, source: 'node1', target: 'node2', type: 'relation' }
                });

                let edges = store.getState().graph.edges;
                assertTrue(edges.has(edgeId), 'Edge should be added to the graph');
                assertEquals(edges.get(edgeId).source, 'node1', 'Edge should have correct source');

                // Update the edge
                store.dispatch({
                    type: 'UPDATE_EDGE',
                    payload: { id: edgeId, source: 'node3' }
                });

                edges = store.getState().graph.edges;
                assertEquals(edges.get(edgeId).source, 'node3', 'Edge should be updated');

                // Remove the edge
                store.dispatch({
                    type: 'REMOVE_EDGE',
                    payload: { id: edgeId }
                });

                edges = store.getState().graph.edges;
                assertFalse(edges.has(edgeId), 'Edge should be removed from the graph');
            }
        },
        {
            desc: 'SET_GRAPH_SNAPSHOT action',
            fn: () => {
                const store = new StateStore();

                const snapshot = {
                    nodes: [
                        { id: 'test_node1', label: 'Test Node 1' },
                        { id: 'test_node2', label: 'Test Node 2' }
                    ],
                    edges: [
                        { id: 'test_edge1', source: 'test_node1', target: 'test_node2' }
                    ]
                };

                store.dispatch({
                    type: 'SET_GRAPH_SNAPSHOT',
                    payload: snapshot
                });

                const state = store.getState();
                assertEquals(state.graph.nodes.size, 2, 'Graph should have 2 nodes from snapshot');
                assertEquals(state.graph.edges.size, 1, 'Graph should have 1 edge from snapshot');
                assertTrue(state.graph.nodes.has('test_node1'), 'Graph should contain test_node1');
                assertTrue(state.graph.nodes.has('test_node2'), 'Graph should contain test_node2');
                assertTrue(state.graph.edges.has('test_edge1'), 'Graph should contain test_edge1');
            }
        },
        {
            desc: 'PROCESS_EVENT_BATCH action',
            fn: () => {
                const store = new StateStore();

                const events = [
                    {
                        type: 'concept.created',
                        data: { term: 'test_concept' },
                        timestamp: Date.now()
                    },
                    {
                        type: 'task.added',
                        data: { task: 'test_task' },
                        timestamp: Date.now()
                    }
                ];

                store.dispatch({
                    type: 'PROCESS_EVENT_BATCH',
                    payload: { events }
                });

                const state = store.getState();
                assertEquals(state.logEntries.length, 2, 'Should have 2 log entries from events');

                const nodes = state.graph.nodes;
                const foundNodes = Array.from(nodes.values()).some(node =>
                    node.label === 'test_concept' || node.label === 'test_task'
                );

                assertTrue(foundNodes, 'State should update graph based on events');
            }
        }
    ];

    return runTestSuite('StateStore', tests);
}

// Run the tests
testStateStore();