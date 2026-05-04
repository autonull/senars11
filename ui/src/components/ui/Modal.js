import { FluentUI } from '../../utils/FluentUI.js';

export class Modal {
    constructor(options = {}) {
        this.title = options.title || '';
        this.content = options.content || ''; // Can be HTML string or DOM element
        this.width = options.width || '500px';
        this.height = options.height || 'auto';
        this.onClose = options.onClose || (() => {});
        this.element = null;
        this.backdrop = null;
    }

    show() {
        this.backdrop = FluentUI.create('div')
            .class('modal-backdrop')
            .style({
                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                background: 'rgba(0,0,0,0.6)', zIndex: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: 0, transition: 'opacity 0.2s'
            })
            .on('click', (e) => {
                if (e.target === this.backdrop.dom) {this.close();}
            })
            .mount(document.body);

        this.element = FluentUI.create('div')
            .class('modal-window')
            .style({
                width: this.width, height: this.height, maxWidth: '90vw', maxHeight: '90vh',
                background: '#252526', border: '1px solid #444', borderRadius: '4px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
                transform: 'translateY(20px)', transition: 'transform 0.2s'
            })
            .mount(this.backdrop);

        // Header
        const header = FluentUI.create('div')
            .style({
                padding: '10px 15px', borderBottom: '1px solid #333',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: '#2d2d2d'
            })
            .mount(this.element);

        FluentUI.create('span')
            .style({ fontWeight: 'bold', color: '#e0e0e0' })
            .text(this.title)
            .mount(header);

        FluentUI.create('button')
            .html('×')
            .style({
                background: 'transparent', border: 'none', color: '#aaa',
                fontSize: '20px', cursor: 'pointer', padding: 0
            })
            .on('click', () => this.close())
            .mount(header);

        // Content
        const contentDiv = FluentUI.create('div')
            .style({ padding: '15px', overflowY: 'auto', flex: 1 })
            .mount(this.element);

        if (typeof this.content === 'string') {
            contentDiv.html(this.content);
        } else if (this.content instanceof HTMLElement) {
            contentDiv.child(this.content);
        }

        // Animate in
        requestAnimationFrame(() => {
            this.backdrop.style({ opacity: '1' });
            this.element.style({ transform: 'translateY(0)' });
        });

        // Close on Escape
        this._escHandler = (e) => {
            if (e.key === 'Escape') {this.close();}
        };
        document.addEventListener('keydown', this._escHandler);

        return this;
    }

    close() {
        if (!this.backdrop) {return;}

        this.backdrop.style({ opacity: '0' });
        this.element.style({ transform: 'translateY(20px)' });

        setTimeout(() => {
            this.backdrop.remove();
            document.removeEventListener('keydown', this._escHandler);
            this.onClose();
        }, 200);
    }

    // Static Helpers
    static alert(message, title = 'Alert') {
        return new Promise(resolve => {
            const modal = new Modal({
                title,
                width: '400px',
                content: `<div style="margin-bottom: 20px;">${message}</div><div style="text-align: right;"><button class="btn-primary">OK</button></div>`,
                onClose: resolve
            });
            modal.show();
            // Bind button after render
            const btn = modal.element.dom.querySelector('button');
            btn.onclick = () => modal.close();
            btn.style.cssText = 'padding: 6px 16px; background: #0e639c; color: white; border: none; border-radius: 3px; cursor: pointer;';
            btn.focus();
        });
    }

    static confirm(message, title = 'Confirm') {
        return new Promise(resolve => {
            const content = FluentUI.create('div');
            content.html(`<div style="margin-bottom: 20px;">${message}</div>`);

            const btnRow = FluentUI.create('div')
                .style({ display: 'flex', justifyContent: 'flex-end', gap: '10px' })
                .mount(content);

            const cancelBtn = FluentUI.create('button')
                .text('Cancel')
                .style({ padding: '6px 12px', background: '#333', color: 'white', border: '1px solid #555', borderRadius: '3px', cursor: 'pointer' })
                .mount(btnRow);

            const okBtn = FluentUI.create('button')
                .text('OK')
                .style({ padding: '6px 16px', background: '#0e639c', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' })
                .mount(btnRow);

            const modal = new Modal({
                title,
                width: '400px',
                content: content.dom,
                onClose: () => resolve(false) // Default to false if closed via X/Backdrop
            });

            // Override click handlers to resolve correctly
            cancelBtn.on('click', () => { resolve(false); modal.close(); });
            okBtn.on('click', () => { resolve(true); modal.close(); });

            modal.show();
            okBtn.dom.focus();
        });
    }
}
