/**
 * Helper to create DOM elements with attributes and children.
 * @param {string} tag - The tag name (e.g., 'div', 'span').
 * @param {Object} [attributes={}] - Key-value pairs for attributes/properties (e.g., className, onclick).
 * @param {(string|HTMLElement|Array)} [children=[]] - Child elements or text content.
 * @returns {HTMLElement} The created element.
 */
export function createElement(tag, attributes = {}, children = []) {
    const element = document.createElement(tag);

    Object.entries(attributes).forEach(([key, value]) => {
        if (key.startsWith('on') && typeof value === 'function') {
            element.addEventListener(key.substring(2).toLowerCase(), value);
        } else if (key === 'className') {
            element.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(element.style, value);
        } else if (key === 'value') {
            element.value = value;
        } else {
            element.setAttribute(key, value);
        }
    });

    if (!Array.isArray(children)) {
        children = [children];
    }

    children.forEach(child => {
        if (child === null || child === undefined) return;
        if (typeof child === 'string' || typeof child === 'number') {
            element.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            element.appendChild(child);
        }
    });

    return element;
}
