/**
 * NavigationManager - Centralized navigation and routing management for the UI
 */

/**
 * Simple router for single page applications
 */
export class NavigationManager {
  constructor() {
    this.routes = new Map();
    this.currentView = null;
    this.defaultRoute = '/';
  }

  /**
   * Register a route with its view controller
   * @param {string} path - The route path
   * @param {Function} handler - Function to handle the route
   */
  addRoute(path, handler) {
    this.routes.set(path, handler);
  }

  /**
   * Navigate to a specific route
   * @param {string} path - The path to navigate to
   * @param {Object} params - Optional parameters
   */
  navigate(path, params = {}) {
    if (this.routes.has(path)) {
      // Clean up current view if it has a cleanup method
      if (this.currentView && typeof this.currentView.cleanup === 'function') {
        this.currentView.cleanup();
      }
      
      // Execute the route handler
      this.currentView = this.routes.get(path)(params);
      
      // Update the browser history if possible (for SPA)
      if (typeof window !== 'undefined' && window.history) {
        window.history.pushState({ path, params }, '', path);
      }
    } else {
      console.warn(`Route ${path} not found, navigating to default route`);
      this.navigate(this.defaultRoute);
    }
  }

  /**
   * Get current route path
   */
  getCurrentPath() {
    return typeof window !== 'undefined' ? window.location.pathname : this.defaultRoute;
  }

  /**
   * Initialize the router by listening to popstate events
   */
  init() {
    if (typeof window !== 'undefined') {
      // Handle browser back/forward buttons
      window.addEventListener('popstate', (event) => {
        if (event.state && event.state.path) {
          this.navigate(event.state.path, event.state.params || {});
        } else {
          this.navigate(this.getCurrentPath());
        }
      });

      // Check initial route
      this.navigate(this.getCurrentPath());
    }
  }

  /**
   * Go back to the previous route
   */
  goBack() {
    if (typeof window !== 'undefined' && window.history) {
      window.history.back();
    }
  }

  /**
   * Go forward to the next route
   */
  goForward() {
    if (typeof window !== 'undefined' && window.history) {
      window.history.forward();
    }
  }

  /**
   * Set the default route
   */
  setDefaultRoute(path) {
    this.defaultRoute = path;
  }
}

/**
 * ViewManager - Manages different views and their lifecycle
 */
export class ViewManager {
  constructor() {
    this.views = new Map();
    this.currentView = null;
    this.viewStack = [];
  }

  /**
   * Register a view with a name
   * @param {string} name - Name of the view
   * @param {Object} view - The view object with init and destroy methods
   */
  registerView(name, view) {
    this.views.set(name, view);
  }

  /**
   * Switch to a specific view
   * @param {string} name - Name of the view to switch to
   * @param {Object} options - Options to pass to the view
   */
  async switchToView(name, options = {}) {
    // Clean up current view
    if (this.currentView) {
      const currentViewObj = this.views.get(this.currentView);
      if (currentViewObj && typeof currentViewObj.destroy === 'function') {
        currentViewObj.destroy();
      }
    }

    // Get the new view
    const view = this.views.get(name);
    if (!view) {
      throw new Error(`View ${name} not found`);
    }

    // Initialize the new view
    if (typeof view.init === 'function') {
      await view.init(options);
    }

    // Set as current view
    this.currentView = name;
    
    // Add to view stack for history
    this.viewStack.push(name);
    if (this.viewStack.length > 10) { // Limit history to 10 views
      this.viewStack.shift();
    }
  }

  /**
   * Get current view name
   */
  getCurrentView() {
    return this.currentView;
  }

  /**
   * Go back to the previous view
   */
  async goBack() {
    if (this.viewStack.length > 1) {
      this.viewStack.pop(); // Remove current view from stack
      const previousView = this.viewStack[this.viewStack.length - 1];
      await this.switchToView(previousView);
    }
  }

  /**
   * Check if there's a previous view to go back to
   */
  canGoBack() {
    return this.viewStack.length > 1;
  }

  /**
   * Get view history
   */
  getViewHistory() {
    return [...this.viewStack];
  }
}

/**
 * State synchronization between views
 */
export class StateSyncManager {
  constructor(store) {
    this.store = store;
    this.viewStates = new Map();
  }

  /**
   * Save the state for a specific view
   * @param {string} viewName - Name of the view
   * @param {Object} state - State to save
   */
  saveViewState(viewName, state) {
    this.viewStates.set(viewName, { ...state, timestamp: Date.now() });
  }

  /**
   * Restore state for a specific view
   * @param {string} viewName - Name of the view
   * @returns {Object} Restored state or null if not found
   */
  restoreViewState(viewName) {
    return this.viewStates.get(viewName) || null;
  }

  /**
   * Clear state for a specific view
   * @param {string} viewName - Name of the view
   */
  clearViewState(viewName) {
    this.viewStates.delete(viewName);
  }

  /**
   * Synchronize store state to a view
   * @param {string} viewName - Name of the view
   * @param {Function} updater - Function to update the view with store state
   */
  syncStoreToView(viewName, updater) {
    const unsubscribe = this.store.subscribe((state) => {
      const viewState = this.restoreViewState(viewName);
      updater(state, viewState);
    });
    
    return unsubscribe;
  }
}

// Export singletons if needed
export const navigationManager = new NavigationManager();
export const viewManager = new ViewManager();