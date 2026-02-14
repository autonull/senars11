import {UIElements} from './ui/UIElements.js';
import {WebSocketManager} from './connection/WebSocketManager.js';
import {GraphManager} from './visualization/GraphManager.js';
import {Logger} from './logging/Logger.js';
import {CommandProcessor} from './command/CommandProcessor.js';
import {DemoManager} from './demo/DemoManager.js';
import {UIEventHandlers} from './ui/UIEventHandlers.js';
import {MessageHandler} from '../../src/ui/message-handlers/MessageHandler.js';
import {capitalizeFirst} from './utils/Helpers.js';
import {ControlPanel} from './ui/ControlPanel.js';

/**
 * Main SeNARS UI Application class - orchestrator that combines all modules
 */
export class SeNARSUI {
    constructor() {
        this.uiElements = new UIElements();

        // Initialize core modules
        this.logger = new Logger();
        this.webSocketManager = new WebSocketManager();
        this.graphManager = new GraphManager(this.uiElements.getAll());
        this.commandProcessor = new CommandProcessor(this.webSocketManager, this.logger, this.graphManager);
        this.controlPanel = new ControlPanel(this.uiElements, this.commandProcessor, this.logger);
        this.demoManager = new DemoManager(this.uiElements, this.commandProcessor, this.logger);
        this.uiEventHandlers = new UIEventHandlers(
            this.uiElements,
            this.commandProcessor,
            this.demoManager,
            this.graphManager,
            this.webSocketManager,
            this.controlPanel
        );

        // Initialize message handler
        this.messageHandler = new MessageHandler(this.graphManager);

        // Set logger UI elements
        this.logger.setUIElements(this.uiElements.getAll());

        // Initialize the application
        this.initialize();
    }

    /**
     * Initialize the application
     */
    initialize() {
        // Initialize graph
        this.graphManager.initialize();

        // Setup UI event listeners
        this.uiEventHandlers.setupEventListeners();

        // Setup WebSocket message handlers
        this._setupWebSocketHandlers();

        // Connect to WebSocket
        this.webSocketManager.connect();

        // Initialize Demo Manager (fetches demos)
        this.webSocketManager.subscribe('connection.status', (status) => {
            if (status === 'connected') {
                this.demoManager.initialize();
            }
        });

        // Add initial log entry
        this.logger.addLogEntry('SeNARS UI2 - Ready', 'info', '🚀');
    }

    /**
     * Setup WebSocket message handlers
     */
    _setupWebSocketHandlers() {
        // Subscribe to general messages
        this.webSocketManager.subscribe('*', (message) => {
            this._handleMessage(message);
        });

        // Subscribe to connection status changes
        this.webSocketManager.subscribe('connection.status', (status) => {
            this._updateStatus(status);
        });
    }

    /**
     * Handle incoming messages
     */
    _handleMessage(message) {
        try {
            // Early return if message is null/undefined
            if (!message) return;

            // Update message count display
            this._updateMessageCount();

            // Update system state (cycle count, etc.)
            this._updateSystemState(message);

            // Handle specialized messages that shouldn't go through the generic logger
            if (this._handleSpecializedMessages(message)) {
                return;
            }

            // Process message with appropriate handler
            const {content, type, icon} = this.messageHandler.processMessage(message);

            // Add log entry and update graph simultaneously
            this.logger.addLogEntry(content, type, icon);
            this.graphManager.updateFromMessage(message);
        } catch (error) {
            const errorMsg = `Error handling message of type ${message?.type ?? 'unknown'}: ${error.message}`;
            this.logger.log(errorMsg, 'error', '❌');

            // Only log to console in development mode to avoid spam
            if (process?.env?.NODE_ENV !== 'production') {
                console.error('Full error details:', error, message);
            }
        }
    }

    /**
     * Handle specialized messages (demos, agent results)
     * Returns true if message was handled and should stop processing
     */
    _handleSpecializedMessages(message) {
        // Map of message types to handler functions for DRY principle
        const specializedMessageHandlers = {
            'demoList': (payload) => this.demoManager.handleDemoList(payload),
            'demoStep': (payload) => this.demoManager.handleDemoStep(payload),
            'demoState': (payload) => this.demoManager.handleDemoState(payload),
            'demoMetrics': (payload) => {
                // Update cycle count from metrics
                const metrics = payload?.metrics;
                if (metrics && metrics.cyclesCompleted !== undefined) {
                    this.controlPanel.updateCycleCount(metrics.cyclesCompleted);
                }
                // Suppress from logs (return true to stop processing)
                return true;
            },
            'agent/result': (payload) => {
                // Log agent result specifically
                const result = typeof payload.result === 'string' ? payload.result : JSON.stringify(payload.result);
                this.logger.addLogEntry(result, 'info', '🤖');
            }
        };

        const handler = specializedMessageHandlers[message.type];
        if (handler) {
            handler(message.payload);
            // demoMetrics should suppress from logs (return true to stop processing)
            if (message.type === 'demoMetrics') return true;
            // agent/result doesn't need special suppression handling, let it continue
        }

        return false;
    }

    /**
     * Update system state based on message
     */
    _updateSystemState(message) {
        // Map of message types to cycle update functions
        const cycleUpdateMap = {
            'nar.cycle.step': (payload) => payload?.cycle,
            'narInstance': (payload) => payload?.cycleCount
        };

        const getCycleValue = cycleUpdateMap[message.type];
        if (getCycleValue) {
            const cycleValue = getCycleValue(message.payload);
            if (cycleValue !== undefined) {
                this.controlPanel.updateCycleCount(cycleValue);
            }
        }
    }

    /**
     * Update the message count display
     */
    _updateMessageCount() {
        const messageCountElement = this.uiElements.get('messageCount');
        if (messageCountElement) {
            const currentCount = parseInt(messageCountElement.textContent) ?? 0;
            messageCountElement.textContent = currentCount + 1;
        }
    }

    /**
     * Update connection status display
     */
    _updateStatus(status) {
        const {connectionStatus, statusIndicator} = this.uiElements.getAll();

        if (connectionStatus) {
            connectionStatus.textContent = capitalizeFirst(status);
        }

        // Update indicator class
        if (statusIndicator) {
            statusIndicator.className = `status-indicator status-${status}`;
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SeNARSUI();
});