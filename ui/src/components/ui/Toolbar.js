export class Toolbar {
    constructor(container, options = {}) {
        this.container = container;
        this.className = options.className || 'custom-toolbar';
        this.element = document.createElement('div');
        this.element.className = this.className;
        this.element.style.cssText = options.style || 'display: flex; gap: 4px; align-items: center; padding: 4px; background: #2d2d2d; border-radius: 4px;';

        if (this.container) this.container.appendChild(this.element);
    }

    addButton(config = {}) {
        const btn = document.createElement('button');
        btn.innerHTML = config.icon || config.label || '';
        btn.title = config.title || '';
        btn.className = config.className || '';

        // Apply generic button styles if not overridden by class
        if (!config.className) {
            btn.style.cssText = `
                padding: 4px 8px; background: ${config.primary ? '#0e639c' : '#333'};
                color: ${config.primary ? '#fff' : '#ccc'}; border: 1px solid #444;
                cursor: pointer; border-radius: 3px; font-size: 0.85em; display: flex; align-items: center; gap: 4px;
            `;
        }

        if (config.onClick) {
            btn.onclick = (e) => config.onClick(e, btn);
        }

        this.element.appendChild(btn);
        return btn;
    }

    addSeparator() {
        const sep = document.createElement('div');
        sep.style.cssText = 'width: 1px; height: 20px; background: #444; margin: 0 4px;';
        this.element.appendChild(sep);
        return sep;
    }

    addInput(config = {}) {
        const input = document.createElement('input');
        input.type = config.type || 'text';
        input.placeholder = config.placeholder || '';
        input.value = config.value || '';
        input.style.cssText = 'background: #1e1e1e; color: #d4d4d4; border: 1px solid #3c3c3c; padding: 4px 8px; border-radius: 3px; font-size: 0.9em;';

        if (config.onInput) input.oninput = (e) => config.onInput(e.target.value);
        if (config.onChange) input.onchange = (e) => config.onChange(e.target.value);

        this.element.appendChild(input);
        return input;
    }

    addCustom(element) {
        this.element.appendChild(element);
        return element;
    }
}
