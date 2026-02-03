import { ExampleBrowser } from './ExampleBrowser.js';
import { FluentUI } from '../utils/FluentUI.js';
import { DEMOS } from '../data/demos.js';

export class DemoLibraryModal {
    constructor(options = {}) {
        this.options = options;
        this.onSelect = options.onSelect;
        this.escHandler = null;
    }

    show() {
        const backdrop = FluentUI.create('div')
            .class('modal-backdrop')
            .on('click', (e) => { if (e.target === backdrop.dom) this.close(backdrop); })
            .style({ zIndex: '99999' }) // Ensure it's on top of EVERYTHING
            .mount(document.body);

        const modalContainer = FluentUI.create('div')
            .class('modal-container')
            .id('demo-library-modal')
            .style({ position: 'relative', zIndex: '100000', pointerEvents: 'auto' }) // Explicitly enable pointer events
            .mount(backdrop);

        // Title Bar
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

        // Content
        const content = FluentUI.create('div')
            .id('demo-browser-content')
            .class('modal-content')
            .mount(modalContainer);

        // Render Local Demos
        const list = FluentUI.create('div').class('demo-list').mount(content);

        Object.keys(DEMOS).forEach(name => {
             const demo = DEMOS[name];
             FluentUI.create('div')
                .class('demo-item')
                .style({ cursor: 'pointer', zIndex: '100001' }) // Ensure clickable
                .html(`
                    <div class="demo-title">${name}</div>
                    <div class="demo-desc">${demo.concepts.length} concepts, ${demo.relationships.length} links</div>
                `)
                .on('click', (e) => {
                    e.stopPropagation(); // Prevent propagation
                    if (this.onSelect) this.onSelect(name);
                    this.close(backdrop);
                })
                .mount(list);
        });

        this.escHandler = (e) => {
            if (e.key === 'Escape') {
                this.close(backdrop);
            }
        };
        document.addEventListener('keydown', this.escHandler);
    }

    close(backdrop) {
        if (backdrop && backdrop.dom && backdrop.dom.parentNode) {
            backdrop.dom.parentNode.removeChild(backdrop.dom);
        } else if (backdrop && backdrop.parentNode) {
             // Fallback if passed raw element
             backdrop.parentNode.removeChild(backdrop);
        }

        if (this.escHandler) {
            document.removeEventListener('keydown', this.escHandler);
            this.escHandler = null;
        }
    }
}
