/**
 * Custom error types for better diagnostics
 */

export class WebSocketConnectionError extends Error {
  constructor(message, code = 'WEBSOCKET_CONNECTION_ERROR') {
    super(message);
    this.name = 'WebSocketConnectionError';
    this.code = code;
  }
}

export class GraphOperationError extends Error {
  constructor(message, operation = 'unknown', code = 'GRAPH_OPERATION_ERROR') {
    super(message);
    this.name = 'GraphOperationError';
    this.operation = operation;
    this.code = code;
  }
}

export class MessageProcessingError extends Error {
  constructor(message, messageType = 'unknown', code = 'MESSAGE_PROCESSING_ERROR') {
    super(message);
    this.name = 'MessageProcessingError';
    this.messageType = messageType;
    this.code = code;
  }
}

export class CommandExecutionError extends Error {
  constructor(message, command = 'unknown', code = 'COMMAND_EXECUTION_ERROR') {
    super(message);
    this.name = 'CommandExecutionError';
    this.command = command;
    this.code = code;
  }
}

export class ConfigurationError extends Error {
  constructor(message, configKey = 'unknown', code = 'CONFIGURATION_ERROR') {
    super(message);
    this.name = 'ConfigurationError';
    this.configKey = configKey;
    this.code = code;
  }
}