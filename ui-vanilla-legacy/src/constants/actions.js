/**
 * Action constants for the SeNARS UI
 */

// Connection actions
export const SET_CONNECTION_STATUS = 'SET_CONNECTION_STATUS';

// State actions
export const SET_LIVE_UPDATE_ENABLED = 'SET_LIVE_UPDATE_ENABLED';
export const SET_LOADING_SNAPSHOT = 'SET_LOADING_SNAPSHOT';
export const CLEAR_LOG = 'CLEAR_LOG';
export const CLEAR_GRAPH = 'CLEAR_GRAPH';
export const QUEUE_EVENT = 'QUEUE_EVENT';

// Graph actions
export const ADD_NODE = 'ADD_NODE';
export const UPDATE_NODE = 'UPDATE_NODE';
export const REMOVE_NODE = 'REMOVE_NODE';
export const ADD_EDGE = 'ADD_EDGE';
export const UPDATE_EDGE = 'UPDATE_EDGE';
export const REMOVE_EDGE = 'REMOVE_EDGE';
export const SET_GRAPH_SNAPSHOT = 'SET_GRAPH_SNAPSHOT';

// Log actions
export const ADD_LOG_ENTRY = 'ADD_LOG_ENTRY';

// Event processing
export const PROCESS_EVENT_BATCH = 'PROCESS_EVENT_BATCH';