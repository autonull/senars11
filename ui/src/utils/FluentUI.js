/**
 * @file FluentUI.js
 * @description Enhanced fluent API for building DOM components programmatically
 * 
 * Provides a chainable API for creating and manipulating DOM elements.
 * Eliminates need for HTML template strings and provides type-safe component building.
 * 
 * @example
 * const button = FluentUI.create('button')
 *   .class('primary-btn')
 *   .text('Click Me')
 *   .on('click', () => console.log('Clicked!'))
 *   .dom;
 * 
 * // Or use the $ shorthand
 * const panel = $('div')
 *   .class('panel')
 *   .child(
 *     $('h2').text('Title'),
 *     $('p').text('Content')
 *   )
 *   .dom;
 */

export class FluentUI {
    constructor(tagOrElement = 'div', attributes = {}) {
        if (tagOrElement instanceof HTMLElement) {
            this.element = tagOrElement;
            this.attr(attributes);
        } else {
            this.element = document.createElement(tagOrElement);
            this.attr(attributes);
        }
        this._eventListeners = [];
    }

    static create(tag, attributes) {
        return new FluentUI(tag, attributes);
    }

    /**
     * Set element ID
     * @param {string} value - ID value
     * @returns {FluentUI}
     */
    id(value) {
        this.element.id = value;
        return this;
    }

    /**
     * Set CSS class (replaces existing)
     * @param {...string} classNames - Class names to set
     * @returns {FluentUI}
     */
    class(...classNames) {
        if (classNames.length > 0) {
            this.element.className = classNames.join(' ');
        }
        return this;
    }

    /**
     * Add CSS class
     * @param {...string} classNames - Class names to add
     * @returns {FluentUI}
     */
    addClass(...classNames) {
        classNames.forEach(className => {
            if (className) {
                this.element.classList.add(className);
            }
        });
        return this;
    }

    /**
     * Remove CSS class
     * @param {...string} classNames - Class names to remove
     * @returns {FluentUI}
     */
    removeClass(...classNames) {
        classNames.forEach(className => {
            if (className) {
                this.element.classList.remove(className);
            }
        });
        return this;
    }

    /**
     * Set inline styles
     * @param {Object} styles - Style object
     * @returns {FluentUI}
     */
    style(styles) {
        Object.assign(this.element.style, styles);
        return this;
    }

    /**
     * Set attribute(s)
     * @param {string|Object} nameOrAttributes - Attribute name or attributes object
     * @param {string} [value] - Attribute value (if nameOrAttributes is string)
     * @returns {FluentUI}
     */
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

    /**
     * Set data attribute
     * @param {string} name - Data attribute name (without 'data-')
     * @param {string} value - Attribute value
     * @returns {FluentUI}
     */
    data(name, value) {
        this.element.dataset[name] = value;
        return this;
    }

    /**
     * Set element properties
     * @param {Object} properties - Properties to set
     * @returns {FluentUI}
     */
    prop(properties) {
        Object.assign(this.element, properties);
        return this;
    }

    /**
     * Set text content
     * @param {string} content - Text content
     * @returns {FluentUI}
     */
    text(content) {
        this.element.textContent = content;
        return this;
    }

    /**
     * Set HTML content
     * @param {string} content - HTML content
     * @returns {FluentUI}
     */
    html(content) {
        this.element.innerHTML = content;
        return this;
    }

    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @param {Object} [options] - Event listener options
     * @returns {FluentUI}
     */
    on(event, handler, options) {
        this.element.addEventListener(event, handler, options);
        this._eventListeners.push({ event, handler, options });
        return this;
    }

    /**
     * Add child element(s)
     * @param {...(FluentUI|HTMLElement|string|Array)} children - Child elements
     * @returns {FluentUI}
     */
    child(...children) {
        children.forEach(child => {
            if (!child) return;

            if (child instanceof FluentUI) {
                this.element.appendChild(child.element);
            } else if (child instanceof Node) {
                this.element.appendChild(child);
            } else if (typeof child === 'string') {
                this.element.appendChild(document.createTextNode(child));
            } else if (Array.isArray(child)) {
                child.forEach(c => this.child(c));
            }
        });
        return this;
    }

    /**
     * Alias for child()
     * @param {Array} children - Child elements
     * @returns {FluentUI}
     */
    children(children) {
        return this.child(children);
    }

    /**
     * Conditionally add child
     * @param {boolean} condition - Condition
     * @param {FluentUI|HTMLElement|string} child - Child to add if condition is true
     * @returns {FluentUI}
     */
    childIf(condition, child) {
        if (condition && child) {
            this.child(child);
        }
        return this;
    }

    /**
     * Add children from array (useful for loops)
     * @param {Array} items - Array of items
     * @param {Function} mapper - Function(item, index) => FluentUI|HTMLElement|string
     * @returns {FluentUI}
     */
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

    /**
     * Apply a function to this builder
     * @param {Function} fn - Function(builder) => void
     * @returns {FluentUI}
     */
    apply(fn) {
        fn(this);
        return this;
    }

    /**
     * Mount to a parent element
     * @param {FluentUI|HTMLElement|string} parent - Parent element or selector
     * @returns {FluentUI}
     */
    mount(parent) {
        if (parent instanceof FluentUI) {
            parent.element.appendChild(this.element);
        } else if (parent instanceof Node) {
            parent.appendChild(this.element);
        } else if (typeof parent === 'string') {
            const el = document.querySelector(parent);
            if (el) {
                el.appendChild(this.element);
            } else {
                console.warn(`Parent '${parent}' not found`);
            }
        }
        return this;
    }

    /**
     * Clear all children
     * @returns {FluentUI}
     */
    clear() {
        this.element.innerHTML = '';
        return this;
    }

    /**
     * Remove this element from DOM
     * @returns {FluentUI}
     */
    remove() {
        if (this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        return this;
    }

    /**
     * Clean up event listeners
     */
    destroy() {
        this._eventListeners.forEach(({ event, handler, options }) => {
            this.element.removeEventListener(event, handler, options);
        });
        this._eventListeners = [];
        this.remove();
    }

    /**
     * Get the underlying DOM element
     * @returns {HTMLElement}
     */
    get dom() {
        return this.element;
    }

    /**
     * Alias for dom (for compatibility with ComponentBuilder pattern)
     * @returns {HTMLElement}
     */
    build() {
        return this.element;
    }
}

// Shorthand function
export function $(tagOrElement, attributes) {
    return new FluentUI(tagOrElement, attributes);
}

// Common element shortcuts
export const div = (attrs) => $('div', attrs);
export const span = (attrs) => $('span', attrs);
export const button = (text, attrs) => $('button', attrs).text(text || '');
export const input = (type = 'text', attrs) => $('input', { ...attrs, type });
export const label = (text, attrs) => $('label', attrs).text(text || '');
export const h1 = (text, attrs) => $('h1', attrs).text(text || '');
export const h2 = (text, attrs) => $('h2', attrs).text(text || '');
export const h3 = (text, attrs) => $('h3', attrs).text(text || '');
export const p = (text, attrs) => $('p', attrs).text(text || '');
export const a = (href, text, attrs) => $('a', { ...attrs, href: href || '#' }).text(text || '');
export const img = (src, alt, attrs) => $('img', { ...attrs, src: src || '', alt: alt || '' });

/**
 * Create a list
 * @param {Array} items - List items
 * @param {Function} mapper - Function(item, index) => FluentUI|HTMLElement|string
 * @returns {FluentUI}
 */
export function list(items, mapper) {
    return $('ul').each(items, (item, index) => {
        const content = mapper(item, index);
        return $('li').child(content);
    });
}

/**
 * Create a table
 * @param {Array} headers - Column headers
 * @param {Array} rows - Row data
 * @param {Function} [cellMapper] - Function(value, rowIndex, colIndex) => FluentUI|string
 * @returns {FluentUI}
 */
export function table(headers, rows, cellMapper = (val) => val) {
    return $('table')
        .child(
            $('thead').child(
                $('tr').each(headers, (header) => $('th').text(header))
            ),
            $('tbody').each(rows, (row, rowIndex) =>
                $('tr').each(row, (cell, colIndex) =>
                    $('td').child(cellMapper(cell, rowIndex, colIndex))
                )
            )
        );
}

/**
 * Create a form
 * @param {Object} config - Form configuration
 * @returns {FluentUI}
 */
export function form(config) {
    const formBuilder = $('form');

    if (config.id) formBuilder.id(config.id);
    if (config.class) formBuilder.class(...config.class.split(' '));
    if (config.onSubmit) formBuilder.on('submit', config.onSubmit);

    if (config.fields) {
        config.fields.forEach(field => {
            const fieldGroup = $('div').class('field-group');

            if (field.label) {
                fieldGroup.child($('label').text(field.label).attr('for', field.name));
            }

            const inputEl = $('input')
                .attr('type', field.type || 'text')
                .attr('name', field.name)
                .attr('id', field.name);

            if (field.placeholder) inputEl.attr('placeholder', field.placeholder);
            if (field.required) inputEl.attr('required', 'required');
            if (field.value) inputEl.attr('value', field.value);

            fieldGroup.child(inputEl);
            formBuilder.child(fieldGroup);
        });
    }

    if (config.submitButton) {
        formBuilder.child(
            $('button')
                .attr('type', 'submit')
                .text(config.submitButton)
        );
    }

    return formBuilder;
}

