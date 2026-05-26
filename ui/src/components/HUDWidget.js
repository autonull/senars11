import { Component } from './Component.js';
import { div, button } from '../utils/FluentUI.js';

/**
 * Standardized HUD Widget Container
 * Wraps content with a draggable/collapsible header and consistent styling.
 */
export class HUDWidget extends Component {
    constructor(container, options = {}) {
        super(container);
        this.options = {
            title: 'Widget',
            icon: '📦',
            collapsible: true,
            closable: true,
            defaultCollapsed: false,
            dock: 'none', // 'left', 'right', 'bottom', 'none'
            width: '300px',
            height: 'auto',
            maxHeight: '80vh',
            ...options
        };

        this.isCollapsed = this.options.defaultCollapsed;
        this.contentContainer = null;
        this.header = null;
    }

    render() {
        if (!this.container) {return;}

        const widget = this.fluent()
            .class('hud-widget')
            .class(this.options.dock !== 'none' ? `dock-${this.options.dock}` : '')
            .style({
                width: this.options.width,
                maxHeight: this.options.maxHeight,
                height: this.isCollapsed ? 'auto' : this.options.height
            });

        // Header
        const header = div().class('hud-widget-header').mount(widget);
        this.header = header;

        // Icon + Title
        div().class('hud-widget-title')
            .html(`<span class="hud-icon">${this.options.icon}</span> ${this.options.title}`)
            .mount(header);

        // Controls
        const controls = div().class('hud-widget-controls').mount(header);

        if (this.options.collapsible) {
            const collapseBtn = button(this.isCollapsed ? '▼' : '▲')
                .class('hud-control-btn')
                .attr('title', this.isCollapsed ? 'Expand' : 'Collapse')
                .on('click', (e) => {
                    e.stopPropagation();
                    this.toggleCollapse(collapseBtn);
                })
                .mount(controls);
        }

        if (this.options.closable) {
            button('✕')
                .class('hud-control-btn', 'close-btn')
                .attr('title', 'Close')
                .on('click', (e) => {
                    e.stopPropagation();
                    this.hide();
                })
                .mount(controls);
        }

        // Content
        this.contentContainer = div()
            .class('hud-widget-content')
            .class(this.isCollapsed ? 'collapsed' : '')
            .mount(widget);
    }

    toggleCollapse(btn) {
        this.isCollapsed = !this.isCollapsed;

        if (this.isCollapsed) {
            this.contentContainer.addClass('collapsed');
            if (btn) {btn.text('▼').attr('title', 'Expand');}
            this.container.style.height = 'auto';
        } else {
            this.contentContainer.removeClass('collapsed');
            if (btn) {btn.text('▲').attr('title', 'Collapse');}
            this.container.style.height = this.options.height;
        }
    }

    setContent(elementOrHtml) {
        if (!this.contentContainer) {return;}
        this.contentContainer.clear();

        if (typeof elementOrHtml === 'string') {
            this.contentContainer.html(elementOrHtml);
        } else if (elementOrHtml instanceof HTMLElement) {
            this.contentContainer.mount(elementOrHtml);
        } else if (elementOrHtml && elementOrHtml.dom) {
            // FluentUI object
            this.contentContainer.mount(elementOrHtml.dom);
        }
    }

    hide() {
        this.container.classList.add('hidden');
    }

    show() {
        this.container.classList.remove('hidden');
    }
}
