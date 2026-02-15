export class Toast {
    static container = null;

    static init() {
        if (this.container) return;
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        this.container.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 10000;
            display: flex; flex-direction: column; gap: 10px; pointer-events: none;
        `;
        document.body.appendChild(this.container);
    }

    static show(message, type = 'info', duration = 3000) {
        this.init();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const colors = {
            info: '#00bcd4',
            success: '#00ff9d',
            warning: '#ffcc00',
            error: '#ff4444'
        };
        const color = colors[type] || colors.info;

        toast.style.cssText = `
            background: #252526; border-left: 4px solid ${color}; color: #fff;
            padding: 10px 15px; border-radius: 3px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            font-family: var(--font-ui, sans-serif); font-size: 13px;
            transform: translateX(100%); opacity: 0; transition: all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
            pointer-events: auto; display: flex; align-items: center; justify-content: space-between;
            min-width: 250px;
        `;

        toast.innerHTML = `<span>${message}</span>`;

        const closeBtn = document.createElement('span');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = 'margin-left: 10px; cursor: pointer; font-size: 16px; opacity: 0.7;';
        closeBtn.onclick = () => this.dismiss(toast);
        toast.appendChild(closeBtn);

        this.container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';
        });

        if (duration > 0) {
            setTimeout(() => this.dismiss(toast), duration);
        }

        return toast;
    }

    static dismiss(toast) {
        toast.style.transform = 'translateX(100%)';
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }

    static info(msg) { return this.show(msg, 'info'); }
    static success(msg) { return this.show(msg, 'success'); }
    static warning(msg) { return this.show(msg, 'warning'); }
    static error(msg) { return this.show(msg, 'error'); }
}
