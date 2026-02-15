/**
 * @deprecated Use config/config-manager.js instead
 * Old flat export configuration - kept for backward compatibility
 */
import configManager from './config/config-manager.js';

// Export the same constants for backward compatibility
export const MAX_LOG_ENTRIES = configManager.getMaxLogEntries();

// WebSocket settings
export const WEBSOCKET_DEFAULT_PORT = configManager.getWebSocketPort();
export const WEBSOCKET_DEFAULT_HOST = configManager.getWebSocketConfig().defaultHost;
export const WEBSOCKET_DEFAULT_PATH = configManager.getWebSocketConfig().defaultPath;
export const WEBSOCKET_RECONNECT_DELAY = configManager.getReconnectDelay();
export const WEBSOCKET_MAX_RECONNECT_ATTEMPTS = configManager.getMaxReconnectAttempts();
export const WEBSOCKET_CONNECTION_TIMEOUT = configManager.getWebSocketConfig().connectionTimeout;

// UI settings
export const UI_BATCH_PROCESSING_INTERVAL = configManager.getBatchProcessingInterval();
export const UI_MAX_GRAPH_NODES = configManager.getMaxGraphNodes();
export const UI_MAX_GRAPH_EDGES = configManager.getMaxGraphEdges();
export const UI_UPDATE_INTERVAL = configManager.getUIConfig().uiUpdateInterval;

// Graph settings
export const GRAPH_NODE_SHAPES = configManager.getNodeShapes();
export const GRAPH_NODE_COLORS = configManager.getNodeColors();
export const GRAPH_LAYOUT = configManager.getGraphLayout();

// Validation settings
export const VALIDATION_ENABLE_MESSAGE_VALIDATION = configManager.getValidationEnabled();
export const VALIDATION_STRICT_VALIDATION = configManager.getStrictValidation();

// Logging settings
export const LOGGING_LEVEL = configManager.getLoggingLevel();