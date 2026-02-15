import { Config } from '../config/Config.js';

/**
 * UIEventHandlers module to handle all UI events and connect UI to business logic
 */
export class UIEventHandlers {
  constructor(uiElements, commandProcessor, demoManager, graphManager, webSocketManager) {
    this.uiElements = uiElements;
    this.commandProcessor = commandProcessor;
    this.demoManager = demoManager;
    this.graphManager = graphManager;
    this.webSocketManager = webSocketManager;
    this._eventHandlers = new Map();
  }

  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    // Define event configuration using a declarative approach
    const eventConfig = this._getEventConfigurations();

    // Apply all event configurations
    eventConfig.forEach(config => {
      this._attachEventHandler(config);
    });
  }

  /**
   * Get event configurations for all UI elements
   */
  _getEventConfigurations() {
    return [
      // Command input events
      { element: 'sendButton', event: 'click', handler: () => this._handleCommandSubmit() },
      { element: 'commandInput', event: 'keypress', handler: (e) => this._handleCommandKeyPress(e) },

      // Quick command events
      { element: 'execQuick', event: 'click', handler: () => this._handleQuickCommand() },

      // History button
      { element: 'showHistory', event: 'click', handler: () => this._showCommandHistory() },

      // Clear logs button
      { element: 'clearLogs', event: 'click', handler: () => this.commandProcessor.processCommand('/clear') },

      // Graph controls
      { element: 'refreshGraph', event: 'click', handler: () => this.commandProcessor.executeRefresh() },
      { element: 'toggleLive', event: 'click', handler: () => this._handleToggleLive() },

      // Demo events
      { element: 'runDemo', event: 'click', handler: () => this._handleRunDemo() }
    ];
  }

  /**
   * Attach a single event handler based on configuration
   */
  _attachEventHandler({ element, event, handler }) {
    const elementRef = this.uiElements.get(element);
    if (elementRef) {
      elementRef.addEventListener(event, handler);
      // Store reference for potential cleanup
      this._eventHandlers.set(`${element}-${event}`, { element: elementRef, event, handler });
    } else {
      this.commandProcessor.logger.log(`UI element not found: ${element}`, 'warning', '⚠️');
    }
  }

  /**
   * Remove all attached event handlers
   */
  removeEventListeners() {
    for (const [key, { element: elementRef, event, handler }] of this._eventHandlers) {
      elementRef.removeEventListener(event, handler);
    }
    this._eventHandlers.clear();
  }

  /**
   * Handle command submission
   */
  _handleCommandSubmit() {
    try {
      const commandInput = this.uiElements.get('commandInput');
      if (!commandInput) {
        this.commandProcessor.logger.log('Command input element not found', 'error', '❌');
        return;
      }

      const command = commandInput.value?.trim();
      if (command) {
        this.commandProcessor.processCommand(command);
        commandInput.value = '';
      }
    } catch (error) {
      this.commandProcessor.logger.log(`Error processing command: ${error.message}`, 'error', '❌');
    }
  }

  /**
   * Handle command key press (Enter key)
   */
  _handleCommandKeyPress(e) {
    if (e.key === 'Enter') {
      this._handleCommandSubmit();
    }
  }

  /**
   * Handle quick command execution
   */
  _handleQuickCommand() {
    try {
      const quickCommandsInput = this.uiElements.get('quickCommands');
      if (!quickCommandsInput) {
        this.commandProcessor.logger.log('Quick commands element not found', 'error', '❌');
        return;
      }

      const commandInput = this.uiElements.get('commandInput');
      if (!commandInput) {
        this.commandProcessor.logger.log('Command input element not found', 'error', '❌');
        return;
      }

      const quickCommand = quickCommandsInput.value?.trim();
      if (quickCommand) {
        commandInput.value = quickCommand;
        this.commandProcessor.processCommand(quickCommand);
      }
    } catch (error) {
      this.commandProcessor.logger.log(`Error executing quick command: ${error.message}`, 'error', '❌');
    }
  }

  /**
   * Handle toggle live button
   */
  _handleToggleLive() {
    try {
      this.commandProcessor.executeToggleLive();
      // Toggle button text
      const button = this.uiElements.get('toggleLive');
      if (button) {
        const currentText = button.textContent;
        button.textContent = currentText === 'Pause Live' ? 'Resume Live' : 'Pause Live';
      } else {
        this.commandProcessor.logger.log('Toggle live button not found', 'error', '❌');
      }
    } catch (error) {
      this.commandProcessor.logger.log(`Error toggling live mode: ${error.message}`, 'error', '❌');
    }
  }

  /**
   * Handle run demo button
   */
  _handleRunDemo() {
    try {
      const demoSelect = this.uiElements.get('demoSelect');
      if (!demoSelect) {
        this.commandProcessor.logger.log('Demo select element not found', 'error', '❌');
        return;
      }

      const demoName = demoSelect.value;
      if (demoName) {
        this.demoManager.runDemo(demoName);
      }
    } catch (error) {
      this.commandProcessor.logger.log(`Error running demo: ${error.message}`, 'error', '❌');
    }
  }

  /**
   * Show command history
   */
  _showCommandHistory() {
    const history = this.commandProcessor.getHistory();

    if (history.length === 0) {
      this.commandProcessor.logger.log('No commands in history', 'info', '📋');
      return;
    }

    this.commandProcessor.logger.log(`Command History (${history.length} commands):`, 'info', '📋');

    history.forEach((entry, i) => {
      const status = entry.status === 'error' ? '❌' : '✅';
      this.commandProcessor.logger.log(`${status} [${i + 1}] ${entry.command}`, 'debug', '📜');
    });
  }
}