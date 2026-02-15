import { UIElements } from './ui/UIElements.js';
import { WebSocketManager } from './connection/WebSocketManager.js';
import { GraphManager } from './visualization/GraphManager.js';
import { Logger } from './logging/Logger.js';
import { CommandProcessor } from './command/CommandProcessor.js';
import { DemoManager } from './demo/DemoManager.js';
import { UIEventHandlers } from './ui/UIEventHandlers.js';
import { MessageHandler } from './message-handlers/MessageHandler.js';
import { capitalizeFirst } from './utils/Helpers.js';

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
    this.demoManager = new DemoManager(this.commandProcessor, this.logger);
    this.uiEventHandlers = new UIEventHandlers(
      this.uiElements,
      this.commandProcessor,
      this.demoManager,
      this.graphManager,
      this.webSocketManager
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
      // Update message count display
      this._updateMessageCount();

      // Process message with appropriate handler
      const { content, type, icon } = this.messageHandler.processMessage(message);

      this.logger.addLogEntry(content, type, icon);

      // Update graph for relevant events
      this.graphManager.updateFromMessage(message);
    } catch (error) {
      const errorMsg = `Error handling message of type ${message?.type || 'unknown'}: ${error.message}`;
      this.logger.log(errorMsg, 'error', '❌');
      console.error('Full error details:', error, message);
    }
  }

  /**
   * Update the message count display
   */
  _updateMessageCount() {
    const messageCountElement = this.uiElements.get('messageCount');
    if (messageCountElement) {
      const currentCount = parseInt(messageCountElement.textContent) || 0;
      messageCountElement.textContent = currentCount + 1;
    }
  }

  /**
   * Update connection status display
   */
  _updateStatus(status) {
    const connectionStatusElement = this.uiElements.get('connectionStatus');
    if (connectionStatusElement) {
      const statusText = capitalizeFirst(status);
      connectionStatusElement.textContent = statusText;
    }

    // Update indicator class
    const indicator = this.uiElements.get('statusIndicator');
    if (indicator) {
      indicator.className = 'status-indicator';
      indicator.classList.add(`status-${status}`);
    }
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new SeNARSUI();
});