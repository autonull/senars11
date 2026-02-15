import { Config } from '../config/Config.js';
import { CommandRegistry } from './CommandRegistry.js';

/**
 * CommandProcessor handles command sending and history management
 */
export class CommandProcessor {
  constructor(webSocketManager, logger, graphManager = null) {
    this.webSocketManager = webSocketManager;
    this.logger = logger;
    this.graphManager = graphManager;
    this.history = [];
    this.maxHistorySize = Config.getConstants().MAX_HISTORY_SIZE;

    // Initialize command registry for extensible command processing
    this.commandRegistry = new CommandRegistry();
  }

  /**
   * Process and send a command to the backend
   * @param {string} command - The command string to process
   * @param {boolean} [isDebug=false] - Whether this is a debug command (currently unused)
   * @returns {boolean} - True if command was processed successfully, false otherwise
   */
  processCommand(command, isDebug = false) {
    const trimmedCommand = command?.trim();
    if (!trimmedCommand) return false;

    // Add to history
    this._addToHistory(trimmedCommand);

    // Log the command
    this.logger.log(`> ${trimmedCommand}`, 'input', '⌨️');

    // Handle debug commands locally if they start with /
    if (trimmedCommand.startsWith('/')) {
      this._processDebugCommand(trimmedCommand);
      return true;
    }

    // Send via WebSocket
    if (this.webSocketManager.isConnected()) {
      this.webSocketManager.sendMessage('narseseInput', { input: trimmedCommand });
      return true;
    } else {
      this.logger.log(`Cannot send: Not connected`, 'error', '❌');
      return false;
    }
  }

  /**
   * Process a debug command using the command registry
   */
  _processDebugCommand(command) {
    const cmd = command.toLowerCase();

    // Create context object for command handlers
    const context = {
      webSocketManager: this.webSocketManager,
      logger: this.logger,
      graphManager: this.graphManager,
      commandProcessor: this
    };

    // Execute the command through the registry
    this.commandRegistry.executeCommand(cmd, context);
  }

  /**
   * Register a new command with the command registry
   */
  registerCommand(command, handler) {
    this.commandRegistry.registerCommand(command, handler);
    return this;
  }

  /**
   * Unregister a command from the command registry
   */
  unregisterCommand(command) {
    return this.commandRegistry.unregisterCommand(command);
  }

  /**
   * Add command to history
   */
  _addToHistory(command) {
    const entry = {
      command: command,
      timestamp: new Date(),
      status: 'sent'
    };

    this.history.push(entry);

    // Maintain max history size
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get command history
   */
  getHistory(limit = 10) {
    return this.history.slice(-limit);
  }

  /**
   * Execute a control command
   */
  executeControlCommand(type, payload = {}) {
    this.webSocketManager.sendMessage(type, payload);
  }

  /**
   * Execute a refresh command
   */
  executeRefresh() {
    this.executeControlCommand('control/refresh', {});
    this.logger.log('Graph refresh requested', 'info', '🔄');
  }

  /**
   * Execute a toggle live command
   */
  executeToggleLive() {
    this.executeControlCommand('control/toggleLive', {});
  }
}