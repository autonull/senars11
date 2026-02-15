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
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'modal-backdrop';
        this.backdrop.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); z-index: 9999;
            display: flex; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.2s;
        `;

        this.element = document.createElement('div');
        this.element.className = 'modal-window';
        this.element.style.cssText = `
            width: ${this.width}; height: ${this.height}; max-width: 90vw; max-height: 90vh;
            background: #252526; border: 1px solid #444; border-radius: 4px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); display: flex; flex-direction: column;
            transform: translateY(20px); transition: transform 0.2s;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'padding: 10px 15px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; background: #2d2d2d;';

        const titleSpan = document.createElement('span');
        titleSpan.style.fontWeight = 'bold';
        titleSpan.style.color = '#e0e0e0';
        titleSpan.textContent = this.title;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = 'background: transparent; border: none; color: #aaa; font-size: 20px; cursor: pointer; padding: 0;';
        closeBtn.onclick = () => this.close();

        header.append(titleSpan, closeBtn);

        // Content
        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = 'padding: 15px; overflow-y: auto; flex: 1;';

        if (typeof this.content === 'string') {
            contentDiv.innerHTML = this.content;
        } else if (this.content instanceof HTMLElement) {
            contentDiv.appendChild(this.content);
        }

        this.element.append(header, contentDiv);
        this.backdrop.appendChild(this.element);
        document.body.appendChild(this.backdrop);

        // Animate in
        requestAnimationFrame(() => {
            this.backdrop.style.opacity = '1';
            this.element.style.transform = 'translateY(0)';
        });

        // Close on backdrop click
        this.backdrop.onclick = (e) => {
            if (e.target === this.backdrop) this.close();
        };

        // Close on Escape
        this._escHandler = (e) => {
            if (e.key === 'Escape') this.close();
        };
        document.addEventListener('keydown', this._escHandler);

        return this;
    }

    close() {
        if (!this.backdrop) return;

        this.backdrop.style.opacity = '0';
        this.element.style.transform = 'translateY(20px)';

        setTimeout(() => {
            if (this.backdrop && this.backdrop.parentNode) {
                this.backdrop.parentNode.removeChild(this.backdrop);
            }
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
            const btn = modal.element.querySelector('button');
            btn.onclick = () => modal.close();
            btn.style.cssText = 'padding: 6px 16px; background: #0e639c; color: white; border: none; border-radius: 3px; cursor: pointer;';
            btn.focus();
        });
    }

    static confirm(message, title = 'Confirm') {
        return new Promise(resolve => {
            const content = document.createElement('div');
            content.innerHTML = `<div style="margin-bottom: 20px;">${message}</div>`;

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display: flex; justify-content: flex-end; gap: 10px;';

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = 'padding: 6px 12px; background: #333; color: white; border: 1px solid #555; border-radius: 3px; cursor: pointer;';

            const okBtn = document.createElement('button');
            okBtn.textContent = 'OK';
            okBtn.style.cssText = 'padding: 6px 16px; background: #0e639c; color: white; border: none; border-radius: 3px; cursor: pointer;';

            let result = false;

            cancelBtn.onclick = () => { result = false; modal.close(); };
            okBtn.onclick = () => { result = true; modal.close(); };

            btnRow.append(cancelBtn, okBtn);
            content.appendChild(btnRow);

            const modal = new Modal({
                title,
                width: '400px',
                content: content,
                onClose: () => resolve(result)
            });
            modal.show();
            okBtn.focus();
        });
    }
}
