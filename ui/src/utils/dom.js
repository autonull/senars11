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
            return;
        }

        switch (key) {
            case 'className':
                element.className = value;
                break;
            case 'style':
                typeof value === 'object' ? Object.assign(element.style, value) : element.setAttribute(key, value);
                break;
            case 'value':
                element.value = value;
                break;
            default:
                element.setAttribute(key, value);
        }
    });

    (Array.isArray(children) ? children : [children]).forEach(child => {
        if (child == null) return;
        if (child instanceof Node) {
            element.appendChild(child);
        } else if (['string', 'number'].includes(typeof child)) {
            element.appendChild(document.createTextNode(child));
        }
    });

    return element;
}
