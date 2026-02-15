import cytoscape from 'cytoscape';
import WebSocketService from './websocket-service.js';
import StateStore from './state-store.js';
import { init as initReplView } from './repl-view.js';
import { init as initGraphView } from './graph-view.js';
import REPLController from './repl-controller.js';
import GraphController from './graph-controller.js';
import StatusBarView from './status-bar-view.js';
import EventProcessor from './event-processor.js';
import { demos } from './demo.js';
import { SET_CONNECTION_STATUS, SET_LIVE_UPDATE_ENABLED } from './constants/actions.js';
import { Dropdown, Button, FormGroup } from './utils/form-components.js';
import { selectElement, createElement } from './utils/common.js';

// Application initialization
class AppInitializer {
    constructor() {
        this.store = null;
        this.service = null;
        this.eventProcessor = null;
        this.replController = null;
        this.graphController = null;
        this.addNotificationStyles();
    }

    addNotificationStyles() {
        // Add CSS animations for notifications
        if (!document.querySelector('#notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }

                @keyframes fadeOut {
                    from {
                        opacity: 1;
                    }
                    to {
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }

    async initialize() {
        console.log('SeNARS UI Initialized');

        this.initializeCoreServices();
        await this.setupWebSocketConnection();
        this.initializeComponents();
        this.setupEventHandlers();
        this.setupUIControls();
    }

    initializeCoreServices() {
        this.store = new StateStore();
        this.service = new WebSocketService(null, this.store);
        window.service = this.service; // Expose for verification
        this.eventProcessor = new EventProcessor(this.store);
    }

    async setupWebSocketConnection() {
        try {
            await this.service.connect();
        } catch (error) {
            console.error('Failed to connect to WebSocket:', error);
            this.store.dispatch({ type: SET_CONNECTION_STATUS, payload: 'error' });
        }
    }

    initializeComponents() {
        // Initialize services and store first
        this.initializeStatusBarView();  // This must happen after service is created
        this.initializeReplComponent();
        this.initializeGraphComponent();

        // Set up additional UI controls after components are initialized
        this.setupAdditionalControls();
    }

    initializeReplComponent() {
        const replContainer = selectElement('#repl-container');
        if (replContainer) {
            const replView = initReplView(replContainer, () => {});
            this.replController = new REPLController(replView, this.store, this.service);
        } else {
            console.error('REPL container not found');
        }
    }

    initializeGraphComponent() {
        const graphContainer = selectElement('#cy-container');
        if (graphContainer) {
            const graphView = initGraphView(graphContainer, { rendererType: 'batched-cytoscape' });
            this.graphController = new GraphController(graphView, this.store, this.service);
        }
    }

    initializeStatusBarView() {
        this.statusBarView = new StatusBarView(this.store);
        // Connect the WebSocket service to the status bar view for message count updates
        // Ensure service exists before setting the status bar view
        if (this.service) {
            this.service.setStatusBarView(this.statusBarView);
        }
    }

    setupEventHandlers() {
        const eventHandlers = this.createWebSocketEventHandlers();

        for (const [event, handler] of Object.entries(eventHandlers)) {
            this.service.subscribe(event, handler);
        }
    }

    createWebSocketEventHandlers() {
        return {
            'open': () => {
                this.store.dispatch({ type: SET_CONNECTION_STATUS, payload: 'connected' });
                this.showNotification('Connected to SeNARS server', 'success');
            },
            'close': () => {
                this.store.dispatch({ type: SET_CONNECTION_STATUS, payload: 'disconnected' });
                this.showNotification('Disconnected from server', 'warning');
            },
            'error': (error) => {
                this.store.dispatch({ type: SET_CONNECTION_STATUS, payload: 'error' });
                const errorMessage = error?.message || error?.data || 'WebSocket connection error';
                this.showNotification(`Connection Error: ${errorMessage}`, 'error');
                console.error('WebSocket error:', error);
            },
            'message': (message) => {
                // Process the message with the event processor
                this.eventProcessor.process(message);

                // Handle the message in the REPL controller if it exists
                this.replController?.handleIncomingMessage?.(message);
            }
        };
    }

    showNotification(message, type = 'info') {
        // Create a notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;

        // Style the notification
        const bgColor = {
            'success': '#d4edda',
            'error': '#f8d7da',
            'warning': '#fff3cd',
            'info': '#d1ecf1'
        }[type] || '#d1ecf1';

        const textColor = {
            'success': '#155724',
            'error': '#721c24',
            'warning': '#856404',
            'info': '#0c5460'
        }[type] || '#0c5460';

        notification.style.cssText = `
            background-color: ${bgColor};
            color: ${textColor};
            border: 1px solid;
            border-radius: 4px;
            padding: 10px 15px;
            margin-bottom: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            animation: slideIn 0.3s ease-out;
            max-width: 100%;
            word-wrap: break-word;
        `;

        notification.textContent = message;

        // Add to notification container
        const container = document.getElementById('notification-container');
        if (container) {
            container.appendChild(notification);

            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.animation = 'fadeOut 0.5s ease-out';
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                    }, 500);
                }
            }, 5000);
        }
    }

    setupUIControls() {
        this.setupRefreshButton();
        this.setupLiveUpdatesToggle();
        this.setupDemoControls();
    }

    setupAdditionalControls() {
        this.setupClearConsoleButton();
        this.setupQuickCommands();
        this.setupExecuteQuickButton();
        this.setupNotificationSystem();
    }

    setupNotificationSystem() {
        // Create notification container if it doesn't exist
        let notificationContainer = document.getElementById('notification-container');
        if (!notificationContainer) {
            notificationContainer = document.createElement('div');
            notificationContainer.id = 'notification-container';
            notificationContainer.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                max-width: 400px;
            `;
            document.body.appendChild(notificationContainer);
        }
    }

    setupClearConsoleButton() {
        const clearConsoleBtn = selectElement('#clear-console-btn');
        if (clearConsoleBtn) {
            clearConsoleBtn.addEventListener('click', () => {
                const consoleOutput = selectElement('#console-output');
                if (consoleOutput) {
                    consoleOutput.innerHTML = '<div class="console-output-line console-info">Console cleared. Ready to receive commands</div>';
                }
            });
        }
    }

    setupQuickCommands() {
        // Quick command selection is handled by the execute button
    }

    setupExecuteQuickButton() {
        const executeQuickBtn = selectElement('#execute-quick-btn');
        const quickCommandSelect = selectElement('#quick-command-select');

        if (executeQuickBtn && quickCommandSelect) {
            executeQuickBtn.addEventListener('click', () => {
                if (quickCommandSelect.value) {
                    const replInput = selectElement('#repl-input');
                    if (replInput) {
                        replInput.value = quickCommandSelect.value;
                        replInput.focus();
                    }
                }
            });
        }
    }

    setupRefreshButton() {
        const refreshBtn = selectElement('#refresh-btn');
        refreshBtn?.addEventListener('click', () => {
            this.graphController
                ? this.graphController.requestRefresh()
                : console.error('Graph controller not initialized');
        });
    }

    setupLiveUpdatesToggle() {
        const toggleLiveBtn = selectElement('#toggle-live-btn');
        if (toggleLiveBtn) {
            let liveUpdatesEnabled = true;
            toggleLiveBtn.textContent = 'Pause Live Updates';

            toggleLiveBtn.addEventListener('click', () => {
                liveUpdatesEnabled = !liveUpdatesEnabled;
                this.store.dispatch({ type: SET_LIVE_UPDATE_ENABLED, payload: liveUpdatesEnabled });
                toggleLiveBtn.textContent = liveUpdatesEnabled ? 'Pause Live Updates' : 'Resume Live Updates';
            });
        }
    }

    setupDemoControls() {
        const demoContainer = selectElement('#demo-controls') ?? selectElement('.demo-controls');

        if (demoContainer) {
            this.createModernDemoControls(demoContainer);
        } else {
            this.createLegacyDemoControls();
        }
    }

    createModernDemoControls(container) {
        // Create dropdown for demo selection
        const demoDropdown = new Dropdown({
            name: 'demo-select',
            options: Object.keys(demos).map(name => ({ value: name, text: name })),
            className: 'demo-select'
        });

        // Create run demo button
        const runDemoBtn = new Button({
            text: 'Run Demo',
            variant: 'primary',
            className: 'run-demo-btn'
        });

        // Create form group for demo controls
        const demoFormGroup = new FormGroup({
            label: 'Select Demo',
            input: demoDropdown,
            className: 'demo-form-group'
        });

        // Add elements to container
        container.appendChild(demoFormGroup.element);
        container.appendChild(runDemoBtn.element);

        // Add event listener to run demo button
        runDemoBtn.element.addEventListener('click', () => {
            this.runSelectedDemo(demoDropdown.getValue());
        });
    }

    createLegacyDemoControls() {
        const demoSelect = selectElement('#demo-select');
        const demoBtn = selectElement('#run-demo-btn');

        if (demoSelect && demoBtn) {
            // Populate demo selection dropdown
            Object.keys(demos).forEach(name => {
                const option = createElement('option', {
                    value: name,
                    textContent: name
                });
                demoSelect.appendChild(option);
            });

            demoBtn.addEventListener('click', () => {
                this.runSelectedDemo(demoSelect.value);
            });
        }
    }

    runSelectedDemo(selectedDemo) {
        const demoScript = demos[selectedDemo];
        if (!demoScript) return;

        this.service.sendMessage('control/reset', {});

        let i = 0;
        const interval = setInterval(() => {
            if (i < demoScript.length) {
                this.service.sendMessage('narseseInput', { input: demoScript[i] });
                i++;
            } else {
                clearInterval(interval);
            }
        }, 1000);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new AppInitializer();
    app.initialize().catch(error => {
        console.error('Failed to initialize application:', error);
    });
});
