/**
 * @file FluentUI.js
 * @description Enhanced fluent API for building DOM components programmatically.
 * Provides a chainable API for creating and manipulating DOM elements.
 */

export class FluentUI {
    /**
     * @param {string|HTMLElement} tagOrElement - Tag name or existing HTMLElement
     * @param {Object} [attributes] - Initial attributes
     */
    constructor(tagOrElement = 'div', attributes = {}) {
        if (typeof window === 'undefined') {
            // Mock environment for Node.js testing if JSDOM is not fully shimmed
            this.element = {
                style: {},
                dataset: {},
                classList: { add: () => {}, remove: () => {} },
                setAttribute: () => {},
                appendChild: () => {},
                addEventListener: () => {},
                removeEventListener: () => {}
            };
        } else if (tagOrElement instanceof HTMLElement) {
            this.element = tagOrElement;
        } else {
            this.element = document.createElement(tagOrElement);
        }

        if (attributes && Object.keys(attributes).length > 0) {
            this.attr(attributes);
        }

        this._eventListeners = [];
    }

    static create(tag, attributes) {
        return new FluentUI(tag, attributes);
    }

    id(value) {
        this.element.id = value;
        return this;
    }

    class(...classNames) {
        if (classNames.length > 0) {
            this.element.className = classNames.filter(Boolean).join(' ');
        }
        return this;
    }

    addClass(...classNames) {
        classNames.forEach(className => {
            if (className) this.element.classList.add(className);
        });
        return this;
    }

    removeClass(...classNames) {
        classNames.forEach(className => {
            if (className) this.element.classList.remove(className);
        });
        return this;
    }

    style(styles) {
        if (!styles) return this;
        Object.entries(styles).forEach(([key, value]) => {
            // Check if key is a valid style property name (string, not index)
            if (isNaN(Number(key))) {
                try {
                    this.element.style[key] = value;
                } catch (e) {
                    console.warn(`FluentUI: Failed to set style ${key}`, e);
                }
            }
        });
        return this;
    }

    attr(nameOrAttributes, value) {
        if (typeof nameOrAttributes === 'string') {
            this.element.setAttribute(nameOrAttributes, value);
        } else {
            Object.entries(nameOrAttributes).forEach(([key, val]) => {
                if (key === 'className' || key === 'class') {
                    this.class(val);
                } else if (key === 'style') {
                    this.style(val);
                } else if (key.startsWith('on') && typeof val === 'function') {
                    this.on(key.substring(2).toLowerCase(), val);
                } else {
                    this.element.setAttribute(key, val);
                }
            });
        }
        return this;
    }

    data(name, value) {
        if (this.element.dataset) {
            this.element.dataset[name] = value;
        }
        return this;
    }

    prop(properties) {
        Object.assign(this.element, properties);
        return this;
    }

    text(content) {
        this.element.textContent = content;
        return this;
    }

    val(value) {
        this.element.value = value;
        return this;
    }

    html(content) {
        this.element.innerHTML = content;
        return this;
    }

    on(event, handler, options) {
        this.element.addEventListener(event, handler, options);
        this._eventListeners.push({ event, handler, options });
        return this;
    }

    child(...children) {
        children.forEach(child => {
            if (child === null || child === undefined) return;

            if (child instanceof FluentUI) {
                this.element.appendChild(child.element);
            } else if (typeof Node !== 'undefined' && child instanceof Node) {
                this.element.appendChild(child);
            } else if (typeof child === 'string') {
                if (typeof document !== 'undefined') {
                    this.element.appendChild(document.createTextNode(child));
                }
            } else if (Array.isArray(child)) {
                child.forEach(c => this.child(c));
            }
        });
        return this;
    }

    children(children) {
        return this.child(children);
    }

    childIf(condition, child) {
        if (condition && child) {
            this.child(child);
        }
        return this;
    }

    each(items, mapper) {
        if (Array.isArray(items)) {
            items.forEach((item, index) => {
                const child = mapper(item, index);
                if (child) {
                    this.child(child);
                }
            });
        }
        return this;
    }

    apply(fn) {
        fn(this);
        return this;
    }

    mount(parent) {
        if (parent instanceof FluentUI) {
            parent.element.appendChild(this.element);
        } else if (typeof Node !== 'undefined' && parent instanceof Node) {
            parent.appendChild(this.element);
        } else if (typeof parent === 'string' && typeof document !== 'undefined') {
            const el = document.querySelector(parent);
            if (el) {
                el.appendChild(this.element);
            } else {
                console.warn(`Parent '${parent}' not found`);
            }
        }
        return this;
    }

    clear() {
        this.element.innerHTML = '';
        return this;
    }

    remove() {
        if (this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        return this;
    }

    destroy() {
        this._eventListeners.forEach(({ event, handler, options }) => {
            this.element.removeEventListener(event, handler, options);
        });
        this._eventListeners = [];
        this.remove();
    }

    get dom() {
        return this.element;
    }

    build() {
        return this.element;
    }
}

export function $(tagOrElement, attributes) {
    return new FluentUI(tagOrElement, attributes);
}

// Helpers
export const div = (attrs) => $('div', attrs);
export const span = (attrs) => $('span', attrs);
export const button = (text, attrs) => $('button', attrs).text(text || '');
export const input = (type = 'text', attrs) => $('input', { ...attrs, type });
