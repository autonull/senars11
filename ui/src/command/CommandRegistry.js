/**
 * CommandRegistry - Extensible command system that allows new commands to be registered
 */
export class CommandRegistry {
  constructor() {
    this.commands = new Map();
    this._initializeDefaultCommands();
  }

  /**
   * Initialize default commands
   */
  _initializeDefaultCommands() {
    this.registerCommand('/help', this._showHelp.bind(this));
    this.registerCommand('/state', this._showState.bind(this));
    this.registerCommand('/nodes', this._listNodes.bind(this));
    this.registerCommand('/tasks', this._listTasks.bind(this));
    this.registerCommand('/concepts', this._listConcepts.bind(this));
    this.registerCommand('/refresh', this._requestRefresh.bind(this));
    this.registerCommand('/clear', this._clearLogs.bind(this));
  }

  /**
   * Register a new command
   */
  registerCommand(command, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Command handler must be a function');
    }
    this.commands.set(command.toLowerCase(), handler);
    return this;
  }

  /**
   * Unregister a command
   */
  unregisterCommand(command) {
    return this.commands.delete(command.toLowerCase());
  }

  /**
   * Execute a command
   */
  executeCommand(command, context) {
    const cmd = command.toLowerCase();
    const handler = this.commands.get(cmd);
    
    if (handler) {
      return handler(context);
    } else {
      // Return a function to handle unknown command
      return (context) => {
        context.logger.log(`Unknown debug command: ${command}. Type /help for available commands.`, 'warning', '⚠️');
        return false;
      };
    }
  }

  /**
   * Get list of available commands
   */
  getCommandList() {
    return Array.from(this.commands.keys());
  }

  /**
   * Default command handlers
   */
  _showHelp(context) {
    context.logger.log('Available debug commands:', 'info', '💡');
    context.logger.log('/help - Show this help', 'info', 'ℹ️');
    context.logger.log('/state - Show connection and state info', 'info', 'ℹ️');
    context.logger.log('/nodes - List all nodes in graph', 'info', 'ℹ️');
    context.logger.log('/tasks - Show task nodes', 'info', 'ℹ️');
    context.logger.log('/concepts - Show concept nodes', 'info', 'ℹ️');
    context.logger.log('/refresh - Request graph refresh', 'info', 'ℹ️');
    context.logger.log('/clear - Clear log messages', 'info', 'ℹ️');
    return true;
  }

  _showState(context) {
    const { logger, webSocketManager, commandProcessor } = context;
    logger.log(`Connection: ${webSocketManager.getConnectionStatus()}`, 'info', '📡');
    logger.log(`Command History: ${commandProcessor.getHistory().length} commands`, 'info', '📜');
    return true;
  }

  _listNodes(context) {
    const { commandProcessor, graphManager, logger } = context;
    if (!commandProcessor._validateGraphManager()) return false;

    const nodeCount = graphManager.getNodeCount();
    logger.log(`Graph has ${nodeCount} nodes`, 'info', '🌐');

    const allNodes = graphManager.cy.nodes();
    allNodes.forEach(node => {
      try {
        const label = node.data('label') || 'unnamed';
        const id = node.id() || 'no-id';
        logger.log(`Node: ${label} (ID: ${id})`, 'info', '📍');
      } catch (error) {
        logger.log(`Error getting node data: ${error.message}`, 'error', '❌');
      }
    });
    return true;
  }

  _listTasks(context) {
    if (!context.commandProcessor._validateGraphManager()) return false;

    try {
      const taskNodes = context.graphManager.getTaskNodes();
      context.logger.log(`Found ${taskNodes?.length || 0} task nodes`, 'info', '📋');

      taskNodes?.forEach(node => {
        try {
          const label = node.data('label') || 'unnamed task';
          context.logger.log(`Task: ${label}`, 'task', '📋');
        } catch (error) {
          context.logger.log(`Error getting task node data: ${error.message}`, 'error', '❌');
        }
      });
    } catch (error) {
      context.logger.log(`Error listing task nodes: ${error.message}`, 'error', '❌');
      return false;
    }
    return true;
  }

  _listConcepts(context) {
    if (!context.commandProcessor._validateGraphManager()) return false;

    try {
      const conceptNodes = context.graphManager.getConceptNodes();
      context.logger.log(`Found ${conceptNodes?.length || 0} concept nodes`, 'info', '🧠');

      conceptNodes?.forEach(node => {
        try {
          const label = node.data('label') || 'unnamed concept';
          context.logger.log(`Concept: ${label}`, 'concept', '🧠');
        } catch (error) {
          context.logger.log(`Error getting concept node data: ${error.message}`, 'error', '❌');
        }
      });
    } catch (error) {
      context.logger.log(`Error listing concept nodes: ${error.message}`, 'error', '❌');
      return false;
    }
    return true;
  }

  _requestRefresh(context) {
    context.webSocketManager.sendMessage('control/refresh', {});
    context.logger.log('Graph refresh requested', 'info', '🔄');
    return true;
  }

  _clearLogs(context) {
    context.logger.clearLogs();
    return true;
  }
}