import { createElement } from '../utils/dom.js';
import { FluentUI } from '../utils/FluentUI.js';

/**
 * Base Component class providing common functionality for UI components
 */
export class Component {
    constructor(container) {
        this.container = this._resolveContainer(container);
        this.elements = {};
    }

    _resolveContainer(container) {
        if (typeof container === 'string') {
            const el = document.getElementById(container);
            if (!el) {
                console.warn(`[${this.constructor.name}] Container ID "${container}" not found in DOM.`);
            }
            return el;
        }
        return container;
    }

    render() {
        throw new Error(`${this.constructor.name} must implement render()`);
    }

    mount(parent) {
        if (parent) {
            this.container = this._resolveContainer(parent);
        }
        if (this.container) {
            this.render();
        } else {
            console.error(`[${this.constructor.name}] Cannot mount: Invalid container.`);
        }
    }

    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
        this.elements = {};
    }

    /**
     * Helper to create DOM elements
     * @deprecated Use fluent() instead
     */
    createElement(tag, attributes, children) {
        return createElement(tag, attributes, children);
    }

    /**
     * Returns a FluentUI builder.
     * If tag is provided, creates a new element.
     * If no tag is provided, wraps the component's container.
     */
    fluent(tag, attributes) {
        if (tag) {
            return FluentUI.create(tag, attributes);
        }
        return new FluentUI(this.container);
    }
}
