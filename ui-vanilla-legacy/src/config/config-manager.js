/**
 * ConfigManager - Centralized configuration management system
 * Provides a unified interface for application configuration
 */

class ConfigManager {
    constructor() {
        this.config = this._getDefaultConfig();
        this._loadEnvironmentConfig();
    }

    _getDefaultConfig() {
        return {
            // WebSocket settings
            websocket: {
                defaultPort: 8080,
                defaultHost: 'localhost',  // Use localhost as default for client-side connections
                defaultPath: '/ws',
                reconnectDelay: 3000,
                maxReconnectAttempts: 10,
                connectionTimeout: 10000
            },

            // UI settings
            ui: {
                maxLogEntries: 1000,
                batchProcessingInterval: 150,
                maxGraphNodes: 5000,
                maxGraphEdges: 10000,
                uiUpdateInterval: 1000
            },

            // Graph settings
            graph: {
                nodeShapes: {
                    concept: 'ellipse',
                    task: 'rectangle',
                    belief: 'triangle',
                    input_task: 'diamond',
                    processed_task: 'ellipse',
                    question: 'pentagon',
                    derivation: 'hexagon',
                    reasoning_step: 'star',
                    goal: 'pentagon'
                },
                nodeColors: {
                    concept: '#3399FF',
                    task: '#FF6B6B',
                    belief: '#6BCF7F',
                    goal: '#9B59B6',
                    input_task: '#FFD93D',
                    processed_task: '#A0A0A0',
                    question: '#9B59B6',
                    derivation: '#E67E22',
                    reasoning_step: '#1ABC9C'
                },
                layout: {
                    name: 'cose',
                    animate: false,
                    fit: true,
                    padding: 30
                }
            },

            // Validation settings
            validation: {
                enableMessageValidation: true,
                strictValidation: false
            },

            // Logging settings
            logging: {
                level: 'info', // 'debug', 'info', 'warn', 'error'
                enableConsoleLogging: true
            }
        };
    }

    _loadEnvironmentConfig() {
        // For now, loading from environment variables or other sources
        // In the future, this could load from config files, environment variables, etc.
        if (typeof window !== 'undefined' && window.APP_CONFIG) {
            this._mergeConfig(window.APP_CONFIG);
        }
    }

    _mergeConfig(newConfig) {
        this.config = this._deepMerge(this.config, newConfig);
    }

    _deepMerge(target, source) {
        const output = { ...target };
        if (this._isObject(target) && this._isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this._isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    } else {
                        output[key] = this._deepMerge(target[key], source[key]);
                    }
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    }

    _isObject(item) {
        return (item && typeof item === 'object' && !Array.isArray(item));
    }

    // Getter methods
    getWebSocketConfig() {
        return this.config.websocket;
    }

    getUIConfig() {
        return this.config.ui;
    }

    getGraphConfig() {
        return this.config.graph;
    }

    getValidationConfig() {
        return this.config.validation;
    }

    getLoggingConfig() {
        return this.config.logging;
    }

    // Individual property getters
    getWebSocketPort() {
        return this.config.websocket.defaultPort;
    }

    getWebSocketHost() {
        return this.config.websocket.defaultHost;
    }

    getWebSocketPath() {
        return this.config.websocket.defaultPath;
    }

    getReconnectDelay() {
        return this.config.websocket.reconnectDelay;
    }

    getMaxReconnectAttempts() {
        return this.config.websocket.maxReconnectAttempts;
    }

    getMaxLogEntries() {
        return this.config.ui.maxLogEntries;
    }

    getBatchProcessingInterval() {
        return this.config.ui.batchProcessingInterval;
    }

    getMaxGraphNodes() {
        return this.config.ui.maxGraphNodes;
    }

    getMaxGraphEdges() {
        return this.config.ui.maxGraphEdges;
    }

    getNodeShapes() {
        return this.config.graph.nodeShapes;
    }

    getNodeColors() {
        return this.config.graph.nodeColors;
    }

    getGraphLayout() {
        return this.config.graph.layout;
    }

    getValidationEnabled() {
        return this.config.validation.enableMessageValidation;
    }

    getStrictValidation() {
        return this.config.validation.strictValidation;
    }

    getLoggingLevel() {
        return this.config.logging.level;
    }

    getEnableConsoleLogging() {
        return this.config.logging.enableConsoleLogging;
    }

    // Setter methods for runtime configuration changes
    setWebSocketPort(port) {
        this.config.websocket.defaultPort = port;
    }

    setMaxLogEntries(count) {
        this.config.ui.maxLogEntries = count;
    }

    updateConfig(newConfig) {
        this._mergeConfig(newConfig);
    }

    // Get the entire config object
    getConfig() {
        return { ...this.config };
    }
}

// Create a singleton instance
const configManager = new ConfigManager();
export default configManager;