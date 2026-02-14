import {WebSocketConfig} from './WebSocketConfig.js';
import {GraphConfig} from './GraphConfig.js';
import {UIConfig} from './UIConfig.js';

/**
 * Main Configuration module for SeNARS UI that combines all specific configuration modules
 */
export class Config {
    // Expose ELEMENT_IDS directly as a static property
    static ELEMENT_IDS = UIConfig.ELEMENT_IDS;

    static getWebSocketConfig() {
        // Get WebSocket configuration from the injected global variable
        const wsConfig = window.WEBSOCKET_CONFIG;

        let host = wsConfig?.host;

        // If host is explicitly localhost, but we are running on a different hostname, use that instead.
        // This fixes issues where the server injects 'localhost' (default) but the user is accessing via IP/hostname.
        if ((!host || host === 'localhost') && window.location.hostname && window.location.hostname !== 'localhost') {
            host = window.location.hostname;
        }

        return {
            host: host || 'localhost',
            port: wsConfig?.port || WebSocketConfig.DEFAULT_PORT
        };
    }

    static getWebSocketUrl() {
        const wsConfig = this.getWebSocketConfig();
        const protocol = WebSocketConfig.PROTOCOL_MAP[window.location.protocol] || 'ws:';
        return `${protocol}//${wsConfig.host}:${wsConfig.port}/ws`;
    }

    static getGraphStyle() {
        return GraphConfig.getGraphStyle();
    }

    static getGraphLayout(name) {
        return GraphConfig.getGraphLayout(name);
    }

    static getConstants() {
        return {
            // WebSocket-related constants
            RECONNECT_DELAY: WebSocketConfig.RECONNECT_DELAY,
            MAX_RECONNECT_ATTEMPTS: WebSocketConfig.MAX_RECONNECT_ATTEMPTS,

            // History and UI constants
            MAX_HISTORY_SIZE: UIConfig.MAX_HISTORY_SIZE,
            MAX_NOTEBOOK_CELLS: UIConfig.MAX_NOTEBOOK_CELLS,
            NOTIFICATION_DURATION: UIConfig.NOTIFICATION_DURATION,
            DEMO_DELAY: UIConfig.DEMO_DELAY,

            // Graph-related constants
            DEFAULT_NODE_WEIGHT: GraphConfig.DEFAULT_NODE_WEIGHT,
            TASK_NODE_WEIGHT: GraphConfig.TASK_NODE_WEIGHT,
            QUESTION_NODE_WEIGHT: GraphConfig.QUESTION_NODE_WEIGHT,

            // Message processing
            MESSAGE_BATCH_SIZE: UIConfig.MESSAGE_BATCH_SIZE,

            // DOM element IDs (for consistency)
            ELEMENT_IDS: UIConfig.ELEMENT_IDS
        };
    }
}
