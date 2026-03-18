import { FluentUI } from '../../utils/FluentUI.js';

export class ContextMenu {
    constructor(items = []) {
        this.items = items;
        this.element = null;
        this.backdrop = null;
    }

    show(x, y) {
        this.backdrop = FluentUI.create('div')
            .class('context-menu-backdrop')
            .style({
                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                zIndex: 9999
            })
            .on('click', () => this.close())
            .mount(document.body);

        this.element = FluentUI.create('div')
            .class('context-menu')
            .style({
                position: 'absolute', top: `${y}px`, left: `${x}px`,
                background: '#252526', border: '1px solid #454545',
                borderRadius: '4px', boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                minWidth: '150px', zIndex: 10000, padding: '4px 0'
            });

        this.items.forEach(item => {
            if (item.separator) {
                FluentUI.create('div').style({ height: '1px', background: '#333', margin: '4px 0' }).mount(this.element);
            } else {
                FluentUI.create('div')
                    .class('context-menu-item')
                    .style({
                        padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                        color: '#cccccc', fontSize: '13px'
                    })
                    .on('mouseenter', (e) => e.target.style.background = '#0e639c')
                    .on('mouseleave', (e) => e.target.style.background = 'transparent')
                    .on('click', () => {
                        item.onClick?.();
                        this.close();
                    })
                    .child(FluentUI.create('span').text(item.icon || ''))
                    .child(FluentUI.create('span').text(item.label))
                    .mount(this.element);
            }
        });

        this.element.mount(document.body);

        // Adjust position if off-screen
        const rect = this.element.dom.getBoundingClientRect();
        if (rect.bottom > window.innerHeight) {
            this.element.dom.style.top = `${y - rect.height}px`;
        }
        if (rect.right > window.innerWidth) {
            this.element.dom.style.left = `${x - rect.width}px`;
        }
    }

    close() {
        this.element?.dom?.remove();
        this.backdrop?.dom?.remove();
    }
}
