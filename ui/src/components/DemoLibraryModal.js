import { ExampleBrowser } from './ExampleBrowser.js';
import { FluentUI } from '../utils/FluentUI.js';

export class DemoLibraryModal {
    constructor(notebookManager) {
        this.notebookManager = notebookManager;
        this.escHandler = null;
    }

    show() {
        const backdrop = FluentUI.create('div')
            .class('modal-backdrop')
            .on('click', (e) => { if (e.target === backdrop.dom) this.close(backdrop); })
            .mount(document.body);

        const modalContainer = FluentUI.create('div')
            .class('modal-container')
            .id('demo-library-modal')
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

        const browser = new ExampleBrowser(content.dom, {
            viewMode: 'tree',
            onSelect: async (node) => {
                if (node.type === 'file') {
                    this.close(backdrop);
                    try {
                        await this.notebookManager?.loadDemoFile(node.path, { clearFirst: true, autoRun: true });
                    } catch (error) {
                        this.notebookManager?.createResultCell(`❌ Error loading demo: ${error.message}`, 'system');
                    }
                }
            }
        });

        // Initialize after appending to DOM
        browser.initialize();

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
