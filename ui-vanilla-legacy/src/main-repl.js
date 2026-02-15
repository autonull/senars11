import WebSocketService from './src/websocket-service.js';
import StateStore from './src/state-store.js';
import { init as initReplView } from './src/repl-view.js';
import REPLController from './src/repl-controller.js';
import StatusBarView from './src/status-bar-view.js';
import EventProcessor from './src/event-processor.js';
import { demos } from './src/demo.js';
import { SET_CONNECTION_STATUS, SET_LIVE_UPDATE_ENABLED } from './src/constants/actions.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('SeNARS REPL Debug UI Initialized');

    // Initialize core services
    const store = new StateStore();
    const service = new WebSocketService(null, store);
    window.service = service; // Expose for verification
    const eventProcessor = new EventProcessor(store);

    // Initialize REPL components
    let replController = null;
    const replContainer = document.getElementById('repl-container');
    if (replContainer) {
        const replView = initReplView(replContainer, () => {});
        replController = new REPLController(replView, store, service);
    } else {
        console.error('REPL container not found');
    }

    // WebSocket event handlers
    const eventHandlers = {
        'open': () => store.dispatch({ type: SET_CONNECTION_STATUS, payload: 'connected' }),
        'close': () => store.dispatch({ type: SET_CONNECTION_STATUS, payload: 'disconnected' }),
        'error': (error) => {
            store.dispatch({ type: SET_CONNECTION_STATUS, payload: 'error' });
            console.error('WebSocket error:', error);
        },
        'message': (message) => {
            // Process the message with the event processor
            eventProcessor.process(message);

            // Handle the message in the REPL controller if it exists
            if (replController) {
                replController.handleIncomingMessage(message);
            }
        }
    };

    Object.entries(eventHandlers).forEach(([event, handler]) => {
        service.subscribe(event, handler);
    });

    service.connect().catch(error => {
        console.error('Failed to connect to WebSocket:', error);
        store.dispatch({ type: SET_CONNECTION_STATUS, payload: 'error' });
    });

    // Initialize status bar view
    new StatusBarView(store);

    // Set up debug buttons
    if (replController) {
        document.getElementById('btn-state')?.addEventListener('click', () => {
            replController.handleCommand('/state');
        });

        document.getElementById('btn-nodes')?.addEventListener('click', () => {
            replController.handleCommand('/nodes');
        });

        document.getElementById('btn-tasks')?.addEventListener('click', () => {
            replController.handleCommand('/tasks');
        });

        document.getElementById('btn-concepts')?.addEventListener('click', () => {
            replController.handleCommand('/concepts');
        });

        document.getElementById('btn-cy-info')?.addEventListener('click', () => {
            replController.handleCommand('/cy-info');
        });

        document.getElementById('btn-add-dummy')?.addEventListener('click', () => {
            replController.handleCommand('/debug-visualize');
        });

        document.getElementById('btn-refresh')?.addEventListener('click', () => {
            replController.handleCommand('/refresh');
        });

        document.getElementById('btn-help')?.addEventListener('click', () => {
            replController.handleCommand('/help');
        });

        document.getElementById('btn-clear-output')?.addEventListener('click', () => {
            replController.viewAPI.clearOutput();
            replController.viewAPI.addOutput('SeNARS REPL - Ready\n');
        });

        document.getElementById('btn-send-test')?.addEventListener('click', () => {
            const select = document.getElementById('test-inputs-select');
            const testInput = select.value;
            if (testInput) {
                replController.handleCommand(testInput);
            }
        });

        // Toggle live updates
        let liveUpdatesEnabled = true;
        const toggleLiveBtn = document.getElementById('btn-toggle-live');
        if (toggleLiveBtn) {
            toggleLiveBtn.textContent = 'Pause Live Updates';

            toggleLiveBtn.addEventListener('click', () => {
                liveUpdatesEnabled = !liveUpdatesEnabled;
                store.dispatch({ type: SET_LIVE_UPDATE_ENABLED, payload: liveUpdatesEnabled });
                toggleLiveBtn.textContent = liveUpdatesEnabled ? 'Pause Live Updates' : 'Resume Live Updates';
            });
        }

        // Set up connection status updates
        store.subscribe((state) => {
            document.getElementById('conn-status').textContent = state.connectionStatus;
            document.getElementById('live-updates-status').textContent = state.isLiveUpdateEnabled ? 'ON' : 'OFF';
            document.getElementById('nodes-count').textContent = state.graph.nodes.size;
            document.getElementById('edges-count').textContent = state.graph.edges.size;
        });
    }
});