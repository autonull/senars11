/**
 * EventBus - Centralized event management system for inter-component communication
 */
class EventBus {
    constructor() {
        this.listeners = new Map();
        this.middleware = [];
    }

    // Subscribe to an event
    subscribe(eventType, callback, priority = 0) {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, []);
        }

        const eventListeners = this.listeners.get(eventType);
        const listener = { callback, priority };

        // Insert based on priority (higher priority first)
        const index = eventListeners.findIndex(l => l.priority < priority);
        if (index === -1) {
            eventListeners.push(listener);
        } else {
            eventListeners.splice(index, 0, listener);
        }

        // Return unsubscribe function
        return () => this.unsubscribe(eventType, callback);
    }

    // Unsubscribe from an event
    unsubscribe(eventType, callback) {
        if (!this.listeners.has(eventType)) return;

        const eventListeners = this.listeners.get(eventType);
        const index = eventListeners.findIndex(l => l.callback === callback);
        
        if (index > -1) {
            eventListeners.splice(index, 1);
        }
    }

    // Add middleware for event processing
    use(middleware) {
        this.middleware.push(middleware);
    }

    // Emit an event
    async emit(eventType, payload, context = {}) {
        if (!this.listeners.has(eventType)) return;

        const event = {
            type: eventType,
            payload,
            context,
            timestamp: Date.now()
        };

        // Apply middleware
        for (const middleware of this.middleware) {
            try {
                await middleware(event);
            } catch (error) {
                console.error('EventBus middleware error:', error);
            }
        }

        // Get listeners in priority order
        const listeners = this.listeners.get(eventType);
        
        // Execute listeners
        for (const { callback } of listeners) {
            try {
                await Promise.resolve(callback(event.payload, event.context));
            } catch (error) {
                console.error(`Error in event listener for ${eventType}:`, error);
            }
        }
    }

    // Get all listeners for an event type
    getListeners(eventType) {
        return this.listeners.get(eventType) || [];
    }

    // Clear all listeners for an event type
    clearListeners(eventType) {
        if (eventType) {
            this.listeners.delete(eventType);
        } else {
            this.listeners.clear();
        }
    }

    // Check if event has listeners
    hasListeners(eventType) {
        return this.listeners.has(eventType) && this.listeners.get(eventType).length > 0;
    }
}

// Singleton instance
const eventBus = new EventBus();

export { EventBus, eventBus };