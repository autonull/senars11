import { FluentUI } from '../utils/FluentUI.js';

export class ShortcutsModal {
    constructor() {
        this.escHandler = null;
    }

    show() {
        // Backdrop
        const backdrop = FluentUI.create('div')
            .class('modal-backdrop')
            .on('click', (e) => { if (e.target === backdrop.dom) {this.close(backdrop);} })
            .style({
                position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
                background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)',
                zIndex: '99999', display: 'flex', alignItems: 'center', justifyContent: 'center'
            })
            .mount(document.body);

        // Modal Container
        const modalContainer = FluentUI.create('div')
            .class('modal-container')
            .style({
                width: '500px', maxHeight: '80vh', background: '#111',
                border: '1px solid #00ff9d', boxShadow: '0 0 20px rgba(0, 255, 157, 0.2)',
                color: '#fff', padding: '20px', borderRadius: '4px', overflowY: 'auto'
            })
            .mount(backdrop);

        // Header
        FluentUI.create('div')
            .style({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' })
            .child(
                FluentUI.create('h2').text('Keyboard Shortcuts').style({ margin: 0, color: '#00ff9d', fontSize: '1.2rem' })
            )
            .child(
                FluentUI.create('button')
                    .text('✕')
                    .style({ background: 'none', border: 'none', color: '#666', fontSize: '1.2rem', cursor: 'pointer' })
                    .on('click', () => this.close(backdrop))
            )
            .mount(modalContainer);

        // Shortcuts Table
        const shortcuts = [
            { key: 'Space', desc: 'Start/Pause Reasoner' },
            { key: 'S', desc: 'Step Reasoner (1 cycle)' },
            { key: 'Shift + S', desc: 'Step 10 Cycles' },
            { key: 'Alt + S', desc: 'Step 50 Cycles' },
            { key: 'F', desc: 'Fit Graph to View' },
            { key: '+ / -', desc: 'Zoom In / Out' },
            { key: 'L', desc: 'Recalculate Layout' },
            { key: 'Del / Backspace', desc: 'Delete Selected Items' },
            { key: 'Ctrl + B', desc: 'Toggle Sidebars' },
            { key: 'Ctrl + L', desc: 'Clear Logs' },
            { key: 'Ctrl + G', desc: 'Focus Search Bar' },
            { key: 'Ctrl + S', desc: 'Save Graph JSON' },
            { key: 'Ctrl + O', desc: 'Load Graph JSON' },
            { key: 'F1', desc: 'Open Command Palette' },
            { key: '?', desc: 'Show this Shortcuts List' }
        ];

        const table = FluentUI.create('table')
            .style({ width: '100%', borderCollapse: 'collapse' })
            .mount(modalContainer);

        shortcuts.forEach(s => {
            const row = FluentUI.create('tr')
                .style({ borderBottom: '1px solid #222' })
                .mount(table);

            FluentUI.create('td')
                .text(s.key)
                .style({ padding: '8px 0', fontFamily: 'monospace', color: '#00d4ff', fontWeight: 'bold' })
                .mount(row);

            FluentUI.create('td')
                .text(s.desc)
                .style({ padding: '8px 0', color: '#ccc', textAlign: 'right' })
                .mount(row);
        });

        // Bind Escape key
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
            backdrop.parentNode.removeChild(backdrop);
        }

        if (this.escHandler) {
            document.removeEventListener('keydown', this.escHandler);
            this.escHandler = null;
        }
    }
}
