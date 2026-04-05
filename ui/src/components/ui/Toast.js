import { FluentUI } from '../../utils/FluentUI.js';

export class Toast {
    static container = null;

    static init() {
        if (this.container) {return;}
        this.container = FluentUI.create('div')
            .class('toast-container')
            .style({
                position: 'fixed', bottom: '20px', right: '20px', zIndex: 10000,
                display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'none'
            })
            .mount(document.body);
    }

    static show(message, type = 'info', duration = 3000) {
        this.init();

        const colors = {
            info: '#00bcd4',
            success: '#00ff9d',
            warning: '#ffcc00',
            error: '#ff4444'
        };
        const color = colors[type] || colors.info;

        const toast = FluentUI.create('div')
            .class(`toast toast-${type}`)
            .style({
                background: '#252526', borderLeft: `4px solid ${color}`, color: '#fff',
                padding: '10px 15px', borderRadius: '3px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                fontFamily: 'var(--font-ui, sans-serif)', fontSize: '13px',
                transform: 'translateX(100%)', opacity: '0', transition: 'all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)',
                pointerEvents: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                minWidth: '250px'
            })
            .html(`<span>${message}</span>`)
            .mount(this.container);

        FluentUI.create('span')
            .html('×')
            .style({ marginLeft: '10px', cursor: 'pointer', fontSize: '16px', opacity: '0.7' })
            .on('click', () => this.dismiss(toast))
            .mount(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.style({ transform: 'translateX(0)', opacity: '1' });
        });

        if (duration > 0) {
            setTimeout(() => this.dismiss(toast), duration);
        }

        return toast.dom;
    }

    static dismiss(toast) {
        if (!toast) {return;}
        const el = toast instanceof FluentUI ? toast : new FluentUI(toast);

        el.style({ transform: 'translateX(100%)', opacity: '0' });
        setTimeout(() => {
            el.remove();
        }, 300);
    }

    static info(msg) { return this.show(msg, 'info'); }
    static success(msg) { return this.show(msg, 'success'); }
    static warning(msg) { return this.show(msg, 'warning'); }
    static error(msg) { return this.show(msg, 'error'); }
}
