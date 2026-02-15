/**
 * HUD Layout Manager - Docking System
 * Manages togglable widgets docked to screen borders
 */
export class HUDLayoutManager {
    constructor() {
        this.widgets = new Map();
        this.visibilityState = new Map();
    }

    /**
     * Initialize the layout manager (no-op for new system, kept for compatibility)
     */
    initialize() {
        // New system doesn't need  initialization, widgets register themselves
        console.log('HUDLayoutManager initialized (docking system)');
    }

    /**
     * Register a widget with the docking system
     * @param {string} id - Unique widget identifier
     * @param {HTMLElement} element - Widget DOM element
     * @param {string} dock - Docking position: 'left', 'right', 'bottom', 'none'
     * @param {boolean} defaultVisible - Initial visibility state
     */
    registerWidget(id, element, dock = 'none', defaultVisible = true) {
        element.id = `${id}-widget`;
        element.classList.add('hud-widget');

        if (dock !== 'none') {
            element.classList.add(`dock-${dock}`);
        }

        this.widgets.set(id, element);
        this.visibilityState.set(id, defaultVisible);

        if (!defaultVisible) {
            element.classList.add('hidden');
        }

        document.body.appendChild(element);
    }

    /**
     * Toggle widget visibility
     */
    toggle(id) {
        const widget = this.widgets.get(id);
        const isVisible = this.visibilityState.get(id);

        if (widget) {
            widget.classList.toggle('hidden');
            this.visibilityState.set(id, !isVisible);
            return !isVisible;
        }
        return false;
    }

    /**
     * Show a widget
     */
    show(id) {
        const widget = this.widgets.get(id);
        if (widget) {
            widget.classList.remove('hidden');
            this.visibilityState.set(id, true);
        }
    }

    /**
     * Hide a widget
     */
    hide(id) {
        const widget = this.widgets.get(id);
        if (widget) {
            widget.classList.add('hidden');
            this.visibilityState.set(id, false);
        }
    }

    /**
     * Check if widget is visible
     */
    isVisible(id) {
        return this.visibilityState.get(id) || false;
    }

    /**
     * Get widget element
     */
    getWidget(id) {
        return this.widgets.get(id);
    }

    /**
     * Legacy compatibility: addComponent
     */
    addComponent(component, region) {
        console.warn('HUDLayoutManager.addComponent is deprecated, use registerWidget');

        // Convert old region names to dock positions
        const dockMap = { left: 'left', right: 'right', bottom: 'bottom', top: 'none', center: 'none' };
        const dock = dockMap[region] || 'none';

        // Generate ID from component or use region
        const id = component.id || region;

        // Get or create element
        let element;
        if (component.container) {
            element = component.container;
        } else {
            element = document.createElement('div');
            if (component.render) {
                component.render();
                if (component.container) {
                    element = component.container;
                }
            }
        }

        this.registerWidget(id, element, dock, true);
    }

    /**
     * Clear all widgets
     */
    clear() {
        this.widgets.forEach(widget => widget.remove());
        this.widgets.clear();
        this.visibilityState.clear();
    }
}
