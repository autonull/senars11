/**
 * WebSocket configuration constants
 */
export const WebSocketConfig = {
  RECONNECT_DELAY: 3000,
  MAX_RECONNECT_ATTEMPTS: 10,
  DEFAULT_PORT: '8081',
  PROTOCOL_MAP: {
    'https:': 'wss:',
    'http:': 'ws:'
  }
};