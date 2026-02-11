import { Component } from '../Component.js';
import { FluentUI } from '../../utils/FluentUI.js';

export class FluentToolbar extends Component {
    constructor(container, config = []) {
        super(container);
        this.config = config;
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = '';
        this.container.className = 'fluent-toolbar';

        const root = FluentUI.create(this.container);

        this.config.forEach(item => {
            this._renderItem(root, item);
        });
    }

    _renderItem(parent, item) {
        switch (item.type) {
            case 'group':
                const group = FluentUI.create('div').class('toolbar-group');
                if (item.class) group.addClass(item.class);
                item.items.forEach(subItem => this._renderItem(group, subItem));
                parent.child(group);
                break;

            case 'button':
                const btn = FluentUI.create('button')
                    .class('toolbar-btn')
                    .attr({ title: item.title || '' })
                    .on('click', item.onClick);

                if (item.id) btn.id(item.id);

                if (item.icon) {
                    btn.text(item.icon); // Assuming text icon for now, could be SVG
                } else if (item.label) {
                    btn.text(item.label);
                }

                if (item.class) btn.addClass(item.class);
                parent.child(btn);
                break;

            case 'select':
                const select = FluentUI.create('select')
                    .class('toolbar-select')
                    .on('change', (e) => item.onChange?.(e.target.value, e));

                if (item.class) select.addClass(item.class);
                if (item.style) select.style(item.style);

                (item.options || []).forEach(opt => {
                    const option = FluentUI.create('option')
                        .attr({ value: opt.value })
                        .text(opt.label);
                    if (opt.selected) option.prop({ selected: true });
                    select.child(option);
                });

                parent.child(select);
                break;

            case 'toggle':
                const label = FluentUI.create('label')
                    .class('toolbar-toggle')
                    .style(item.style || {});

                const checkbox = FluentUI.create('input')
                    .attr({ type: 'checkbox' })
                    .on('change', (e) => item.onChange?.(e.target.checked, e));

                if (item.checked) checkbox.prop({ checked: true });
                if (item.inputStyle) checkbox.style(item.inputStyle);

                label.child(checkbox);
                if (item.label) label.child(document.createTextNode(' ' + item.label));

                parent.child(label);
                break;

            case 'slider':
                const container = FluentUI.create('div').class('toolbar-slider-container');
                if (item.class) container.addClass(item.class);

                const display = FluentUI.create('span').text(item.value || item.min || '0');

                if (item.label) {
                    container.child(FluentUI.create('span').text(item.label));
                }

                container.child(display);

                const slider = FluentUI.create('input')
                    .attr({
                        type: 'range',
                        min: item.min || 0,
                        max: item.max || 100,
                        step: item.step || 1,
                        value: item.value || item.min || 0
                    })
                    .class('toolbar-slider-input')
                    .on('input', (e) => {
                        display.text(parseFloat(e.target.value).toFixed(2));
                        item.onChange?.(parseFloat(e.target.value), e);
                    });

                container.child(slider);
                parent.child(container);
                break;

            case 'custom':
                if (item.element) {
                    parent.child(item.element);
                } else if (item.renderer) {
                    const el = item.renderer();
                    if (el) parent.child(el);
                }
                break;

            case 'text':
                parent.child(FluentUI.create('span').text(item.text).style(item.style || {}));
                break;
        }
    }
}
