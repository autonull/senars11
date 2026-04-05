import { FluentUI } from '../../utils/FluentUI.js';

export class Toolbar {
    constructor(container, options = {}) {
        this.container = container;
        this.className = options.className || 'custom-toolbar';

        const builder = FluentUI.create('div')
            .class(this.className)
            .style(options.style || 'display: flex; gap: 4px; align-items: center; padding: 4px; background: #2d2d2d; border-radius: 4px;');

        this.element = builder.dom;
        if (this.container) {this.container.appendChild(this.element);}
    }

    addButton(config = {}) {
        const btn = FluentUI.create('button')
            .html(config.icon || config.label || '')
            .attr({ title: config.title || '' });

        if (config.className) {
            btn.class(config.className);
        } else {
            btn.style({
                padding: '4px 8px',
                background: config.primary ? '#0e639c' : '#333',
                color: config.primary ? '#fff' : '#ccc',
                border: '1px solid #444',
                cursor: 'pointer',
                borderRadius: '3px',
                fontSize: '0.85em',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
            });
        }

        if (config.onClick) {
            btn.on('click', (e) => config.onClick(e, btn.dom));
        }

        this.element.appendChild(btn.dom);
        return btn.dom;
    }

    addSeparator() {
        const sep = FluentUI.create('div')
            .style({ width: '1px', height: '20px', background: '#444', margin: '0 4px' })
            .dom;
        this.element.appendChild(sep);
        return sep;
    }

    addInput(config = {}) {
        const input = FluentUI.create('input')
            .attr({
                type: config.type || 'text',
                placeholder: config.placeholder || '',
                value: config.value || ''
            })
            .style({
                background: '#1e1e1e',
                color: '#d4d4d4',
                border: '1px solid #3c3c3c',
                padding: '4px 8px',
                borderRadius: '3px',
                fontSize: '0.9em'
            });

        if (config.onInput) {input.on('input', (e) => config.onInput(e.target.value));}
        if (config.onChange) {input.on('change', (e) => config.onChange(e.target.value));}

        this.element.appendChild(input.dom);
        return input.dom;
    }

    addCustom(element) {
        this.element.appendChild(element);
        return element;
    }
}
