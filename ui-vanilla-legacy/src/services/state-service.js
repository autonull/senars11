import Logger from '../utils/logger.js';
import { eventBus } from '../utils/event-bus.js';
import configManager from '../config/config-manager.js';

/**
 * StateService - Advanced state management with persistence and synchronization
 */
class StateService {
    constructor(options = {}) {
        this.state = {};
        this.listeners = new Map();
        this.middleware = [];
        this.persistKeys = options.persistKeys || [];
        this.storageKey = options.storageKey || 'senars-ui-state';
        this.syncInterval = options.syncInterval || configManager.getUIConfig().uiUpdateInterval;
        this.isHydrated = false;
        this.pendingActions = [];
        this.batching = false;
        this.batchedActions = [];
        
        this.init();
    }

    async init() {
        // Load persisted state
        await this.hydrate();
        
        // Start sync interval if persistence is enabled
        if (this.persistKeys.length > 0) {
            this._startSyncLoop();
        }
        
        Logger.info('StateService initialized');
    }

    // Subscribe to state changes
    subscribe(path, callback, options = {}) {
        const { once = false, filter = null } = options;
        
        if (!this.listeners.has(path)) {
            this.listeners.set(path, []);
        }

        const listener = { callback, once, filter };
        this.listeners.get(path).push(listener);

        // Return unsubscribe function
        return () => {
            const listeners = this.listeners.get(path);
            if (listeners) {
                const index = listeners.indexOf(listener);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            }
        };
    }

    // Dispatch an action to update state
    dispatch(action, options = {}) {
        const { skipPersistence = false, skipListeners = false } = options;
        
        // Apply middleware
        const processedAction = this._applyMiddleware(action);
        if (!processedAction) return; // Middleware cancelled action

        // Add timestamp
        const actionWithMeta = {
            ...processedAction,
            timestamp: Date.now(),
            meta: {
                ...processedAction.meta,
                processedAt: Date.now()
            }
        };

        // Add to pending actions if batching
        if (this.batching) {
            this.batchedActions.push(actionWithMeta);
            return;
        }

        // Process the action
        const newState = this._processAction(this.state, actionWithMeta);
        
        // Update state
        this.state = newState;
        
        // Emit action processed event
        if (!skipListeners) {
            eventBus.emit('state.action.processed', {
                action: actionWithMeta,
                newState: this.state
            });
        }

        // Notify listeners
        if (!skipListeners) {
            this._notifyListeners(actionWithMeta);
        }

        // Persist state if needed
        if (!skipPersistence && this.persistKeys.length > 0) {
            this._persistState();
        }

        return actionWithMeta;
    }

    // Process multiple actions in batch
    batch(actions, options = {}) {
        this.batching = true;
        this.batchedActions = [];

        try {
            for (const action of actions) {
                this.dispatch(action, { ...options, skipListeners: true, skipPersistence: true });
            }
        } finally {
            this.batching = false;
            
            // Process all batched actions at once
            const batchedState = this.batchedActions.reduce((state, action) => {
                return this._processAction(state, action);
            }, this.state);

            this.state = batchedState;

            // Notify listeners and persist
            for (const action of this.batchedActions) {
                this._notifyListeners(action);
            }

            if (!options.skipPersistence && this.persistKeys.length > 0) {
                this._persistState();
            }

            // Emit batch processed event
            eventBus.emit('state.batch.processed', {
                actions: this.batchedActions,
                newState: this.state
            });

            this.batchedActions = [];
        }
    }

    // Get state value at path
    getState(path = null) {
        if (!path) return { ...this.state };
        
        return this._getNestedValue(this.state, path);
    }

    // Set state value at path
    setState(path, value, options = {}) {
        const action = {
            type: 'SET_STATE',
            payload: { path, value }
        };
        return this.dispatch(action, options);
    }

    // Add middleware
    use(middleware) {
        this.middleware.push(middleware);
    }

    // Hydrate state from storage
    async hydrate() {
        try {
            const stored = await this._loadFromStorage();
            if (stored) {
                this.state = { ...this.state, ...stored };
                this.isHydrated = true;
                
                await eventBus.emit('state.hydrated', {
                    keys: Object.keys(stored),
                    timestamp: Date.now()
                });
                
                Logger.info('State hydrated from storage');
            }
        } catch (error) {
            Logger.error('Error hydrating state', { error: error.message });
        }
    }

    // Clear all state
    clear() {
        this.state = {};
        if (this.persistKeys.length > 0) {
            this._clearStorage();
        }
        eventBus.emit('state.cleared', { timestamp: Date.now() });
    }

    // Get state statistics
    getStats() {
        return {
            keys: Object.keys(this.state).length,
            size: JSON.stringify(this.state).length,
            persistedKeys: this.persistKeys,
            listeners: Array.from(this.listeners.keys()),
            hydrated: this.isHydrated
        };
    }

    // Add listener for state changes at path
    onPathChange(path, callback) {
        return this.subscribe(path, callback);
    }

    // Add listener for specific action types
    onAction(actionType, callback) {
        return this.subscribe(`action:${actionType}`, callback);
    }

    // Private methods
    async _loadFromStorage() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return null;
        }

        try {
            const stored = window.localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : null;
        } catch (error) {
            Logger.error('Error loading state from storage', { error: error.message });
            return null;
        }
    }

    _persistState() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return;
        }

        try {
            // Only persist the keys that are marked for persistence
            const persistState = {};
            for (const key of this.persistKeys) {
                if (this.state.hasOwnProperty(key)) {
                    persistState[key] = this.state[key];
                }
            }
            
            if (Object.keys(persistState).length > 0) {
                window.localStorage.setItem(this.storageKey, JSON.stringify(persistState));
            }
        } catch (error) {
            Logger.error('Error persisting state to storage', { error: error.message });
        }
    }

    _clearStorage() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return;
        }

        try {
            window.localStorage.removeItem(this.storageKey);
        } catch (error) {
            Logger.error('Error clearing state storage', { error: error.message });
        }
    }

    _processAction(state, action) {
        // Handle special SET_STATE action
        if (action.type === 'SET_STATE') {
            const { path, value } = action.payload;
            return this._setNestedValue(state, path, value);
        }

        // Use a generic reducer approach for other actions
        return this._defaultReducer(state, action);
    }

    _defaultReducer(state, action) {
        // This can be extended based on specific action types
        // For now, return state as-is since most complex logic is in the original StateStore
        return state;
    }

    _setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((acc, key) => {
            if (!acc[key]) acc[key] = {};
            return acc[key];
        }, { ...obj });

        target[lastKey] = value;
        return { ...obj, ...this._getPathObject(path, value) };
    }

    _getPathObject(path, value) {
        const keys = path.split('.');
        let result = {};
        let current = result;

        for (let i = 0; i < keys.length - 1; i++) {
            current[keys[i]] = {};
            current = current[keys[i]];
        }

        current[keys[keys.length - 1]] = value;
        return result;
    }

    _getNestedValue(obj, path) {
        return path.split('.').reduce((acc, part) => acc?.[part], obj);
    }

    _applyMiddleware(action) {
        let result = action;
        for (const middleware of this.middleware) {
            result = middleware(result);
            if (!result) break; // Middleware cancelled action
        }
        return result;
    }

    _notifyListeners(action) {
        // Notify path-specific listeners
        const paths = Object.keys(this.state);
        for (const path of paths) {
            this._notifyPathListeners(path, this.state[path]);
        }

        // Notify action-specific listeners
        if (this.listeners.has(`action:${action.type}`)) {
            const listeners = this.listeners.get(`action:${action.type}`);
            this._executeListeners(listeners, action);
        }
    }

    _notifyPathListeners(path, value) {
        if (!this.listeners.has(path)) return;

        const listeners = this.listeners.get(path);
        this._executeListeners(listeners, { path, value });
    }

    _executeListeners(listeners, data) {
        const remainingListeners = [];
        
        for (const listener of listeners) {
            try {
                listener.callback(data);
                if (!listener.once) {
                    remainingListeners.push(listener);
                }
            } catch (error) {
                Logger.error('Error in listener callback', { error: error.message, data });
            }
        }

        // Update listeners array, removing 'once' listeners
        if (remainingListeners.length !== listeners.length) {
            const path = this._findPathForListener(listeners[0]); // find the path for this listener set
            if (path) {
                this.listeners.set(path, remainingListeners);
            }
        }
    }

    _findPathForListener(listener) {
        for (const [path, listeners] of this.listeners.entries()) {
            if (listeners.includes(listener)) {
                return path;
            }
        }
        return null;
    }

    _startSyncLoop() {
        setInterval(() => {
            if (this.persistKeys.length > 0) {
                this._persistState();
            }
        }, this.syncInterval);
    }
}

// Singleton instance
const stateService = new StateService({
    persistKeys: ['ui', 'graph', 'connectionStatus', 'logEntries'],
    storageKey: 'senars-ui-state',
    syncInterval: configManager.getUIConfig().uiUpdateInterval
});

export { StateService, stateService };