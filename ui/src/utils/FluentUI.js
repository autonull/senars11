import { createElement } from './dom.js';

export class FluentUI {
    constructor(tagOrElement = 'div', attributes = {}) {
        if (tagOrElement instanceof HTMLElement) {
            this.element = tagOrElement;
            // Apply any initial attributes if provided
            this.attr(attributes);
        } else {
            this.element = createElement(tagOrElement, attributes);
        }
    }

    static create(tag, attributes) {
        return new FluentUI(tag, attributes);
    }

    id(value) {
        this.element.id = value;
        return this;
    }

    class(className) {
        if (className) {
            this.element.className = className;
        }
        return this;
    }

    addClass(className) {
        if (className) {
            this.element.classList.add(className);
        }
        return this;
    }

    removeClass(className) {
        if (className) {
            this.element.classList.remove(className);
        }
        return this;
    }

    style(styles) {
        Object.assign(this.element.style, styles);
        return this;
    }

    attr(attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className' || key === 'class') {
                this.class(value);
            } else if (key === 'style') {
                this.style(value);
            } else if (key.startsWith('on') && typeof value === 'function') {
                this.on(key.substring(2).toLowerCase(), value);
            } else {
                this.element.setAttribute(key, value);
            }
        });
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

    html(content) {
        this.element.innerHTML = content;
        return this;
    }

    on(event, handler) {
        this.element.addEventListener(event, handler);
        return this;
    }

    child(child) {
        if (!child) return this;

        if (child instanceof FluentUI) {
            this.element.appendChild(child.element);
        } else if (child instanceof Node) {
            this.element.appendChild(child);
        } else if (typeof child === 'string') {
            this.element.appendChild(document.createTextNode(child));
        } else if (Array.isArray(child)) {
            child.forEach(c => this.child(c));
        }
        return this;
    }

    children(children) {
        return this.child(children);
    }

    mount(parent) {
        if (parent instanceof FluentUI) {
            parent.element.appendChild(this.element);
        } else if (parent instanceof Node) {
            parent.appendChild(this.element);
        } else if (typeof parent === 'string') {
            const el = document.getElementById(parent);
            if (el) el.appendChild(this.element);
            else console.warn(`Parent with id '${parent}' not found`);
        }
        return this;
    }

    clear() {
        this.element.innerHTML = '';
        return this;
    }

    // Accessor
    get dom() {
        return this.element;
    }
}
