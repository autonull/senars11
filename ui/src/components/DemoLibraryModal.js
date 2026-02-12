import { ExampleBrowser } from './ExampleBrowser.js';
import { FluentUI } from '../utils/FluentUI.js';
import { DEMOS } from '../data/demos.js';

export class DemoLibraryModal {
    constructor(options = {}) {
        this.options = options;
        this.onSelect = options.onSelect;
        this.escHandler = null;
        this.activeTab = 'featured'; // 'featured' or 'browse'
    }

    show() {
        const backdrop = FluentUI.create('div')
            .class('modal-backdrop')
            .on('click', (e) => { if (e.target === backdrop.dom) this.close(backdrop); })
            .style({ zIndex: '99999' })
            .mount(document.body);

        const modalContainer = FluentUI.create('div')
            .class('modal-container')
            .id('demo-library-modal')
            .style({
                position: 'relative',
                zIndex: '100000',
                pointerEvents: 'auto',
                width: '800px',
                height: '600px',
                display: 'flex',
                flexDirection: 'column'
            })
            .mount(backdrop);

        // Header
        FluentUI.create('div')
            .class('modal-header')
            .html('<span class="modal-title">📚 Demo Library</span>')
            .child(
                FluentUI.create('button')
                    .text('✕')
                    .class('modal-close-btn')
                    .on('click', () => this.close(backdrop))
            )
            .mount(modalContainer);

        // Tab Bar
        const tabBar = FluentUI.create('div')
            .class('modal-tabs')
            .style({ display: 'flex', borderBottom: '1px solid var(--border-primary)' })
            .mount(modalContainer);

        const renderTab = (id, label) => {
            return FluentUI.create('button')
                .class('modal-tab-btn')
                .text(label)
                .style({
                    padding: '10px 20px',
                    background: this.activeTab === id ? 'var(--bg-panel-solid)' : 'transparent',
                    border: 'none',
                    borderBottom: this.activeTab === id ? '2px solid var(--accent-primary)' : 'none',
                    color: this.activeTab === id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer'
                })
                .on('click', () => {
                    this.activeTab = id;
                    this.renderContent(contentBody, backdrop);
                    // Re-render tabs to update styles (simplified)
                    tabBar.dom.innerHTML = '';
                    renderTab('featured', '⭐ Featured Demos').mount(tabBar);
                    renderTab('browse', '📂 System Examples').mount(tabBar);
                });
        };

        renderTab('featured', '⭐ Featured Demos').mount(tabBar);
        renderTab('browse', '📂 System Examples').mount(tabBar);

        // Content Body
        const contentBody = FluentUI.create('div')
            .class('modal-content')
            .style({ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' })
            .mount(modalContainer);

        this.renderContent(contentBody, backdrop);

        this.escHandler = (e) => {
            if (e.key === 'Escape') {
                this.close(backdrop);
            }
        };
        document.addEventListener('keydown', this.escHandler);
    }

    renderContent(container, backdrop) {
        container.dom.innerHTML = '';

        if (this.activeTab === 'featured') {
            const list = FluentUI.create('div')
                .class('demo-list')
                .style({ padding: '20px', overflowY: 'auto' })
                .mount(container);

            Object.keys(DEMOS).forEach(name => {
                const demo = DEMOS[name];
                FluentUI.create('div')
                    .class('demo-item')
                    .style({ cursor: 'pointer', zIndex: '100001', marginBottom: '10px', padding: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-secondary)' })
                    .html(`
                        <div class="demo-title" style="color: var(--accent-primary); font-weight: bold;">${name}</div>
                        <div class="demo-desc" style="font-size: 0.9em; color: var(--text-secondary); margin-top: 5px;">${demo.description || ''}</div>
                        <div class="demo-meta" style="font-size: 0.8em; color: var(--text-muted); margin-top: 5px;">${demo.concepts.length} concepts, ${demo.relationships.length} links</div>
                    `)
                    .on('click', (e) => {
                        e.stopPropagation();
                        if (this.onSelect) this.onSelect(name);
                        this.close(backdrop);
                    })
                    .mount(list);
            });
        } else {
            // Browse Tab
            const browserContainer = FluentUI.create('div')
                .id('example-browser-root')
                .style({ flex: 1, overflow: 'hidden', height: '100%' })
                .mount(container);

            const browser = new ExampleBrowser('example-browser-root', {
                indexUrl: '/examples.json',
                viewMode: 'tree',
                onSelect: (node) => {
                    if (this.onSelect) this.onSelect(node);
                    this.close(backdrop);
                }
            });
            browser.initialize();
        }
    }

    close(backdrop) {
        if (backdrop && backdrop.dom && backdrop.dom.parentNode) {
            backdrop.dom.parentNode.removeChild(backdrop.dom);
        } else if (backdrop && backdrop.parentNode) {
             backdrop.parentNode.removeChild(backdrop);
        }

        if (this.escHandler) {
            document.removeEventListener('keydown', this.escHandler);
            this.escHandler = null;
        }
    }
}
