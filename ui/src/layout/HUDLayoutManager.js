import { HUDWidget } from '../components/HUDWidget.js';

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
        // New system doesn't need initialization, widgets register themselves
    }

    /**
     * Create and register a standardized HUD widget
     * @param {string} id - Unique widget identifier
     * @param {Object} config - Configuration object
     * @param {string} config.title - Widget title
     * @param {string} config.icon - Widget icon
     * @param {Object} config.component - Component instance to mount
     * @param {string} config.dock - Docking position ('left', 'right', 'bottom', 'none')
     * @param {boolean} config.visible - Initial visibility (default: true)
     * @param {string} config.width - Width (e.g. '300px')
     * @param {string} config.height - Height (e.g. 'auto')
     * @param {boolean} config.collapsible - Whether widget is collapsible
     * @returns {HUDWidget} The created widget instance
     */
    createWidget(id, config = {}) {
        const { component, visible = true, dock = 'none', ...widgetOptions } = config;

        const container = document.createElement('div');

        // Pass dock to HUDWidget options so it applies the class
        const widgetWrapper = new HUDWidget(container, {
            dock,
            ...widgetOptions
        });
        widgetWrapper.render();

        // Mount component into widget content
        if (component) {
            // HUDWidget exposes contentContainer as a FluentUI wrapper
            if (widgetWrapper.contentContainer && widgetWrapper.contentContainer.dom) {
                component.container = widgetWrapper.contentContainer.dom;
                if (component.initialize) {component.initialize();}
                if (component.render) {component.render();}
            }
        }

        this.registerWidget(id, container, dock, visible);
        return widgetWrapper;
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
        console.warn('HUDLayoutManager.addComponent is deprecated, use registerWidget or createWidget');

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
