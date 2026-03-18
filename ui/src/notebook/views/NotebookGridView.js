import { FluentUI } from '../../utils/FluentUI.js';

export class NotebookGridView {
    constructor(container, cells, onSwitchView) {
        this.container = container;
        this.cells = cells;
        this.onSwitchView = onSwitchView;
    }

    render(isIconMode = false) {
        const size = isIconMode ? '100px' : '200px';

        FluentUI.create(this.container)
            .style({
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: `repeat(auto-fill, minmax(${size}, 1fr))`,
                gap: '10px',
                padding: '10px'
            })
            .clear()
            .each(this.cells, (cell) => this._createCellWrapper(cell, isIconMode));
    }

    _createCellWrapper(cell, isIconMode) {
        const iconMap = {
            code: '💻', result: '✨', markdown: '📝', widget: '🧩', prompt: '🤖'
        };
        const iconChar = iconMap[cell.type] ?? '📄';

        let text = typeof cell.content === 'string' ? cell.content : JSON.stringify(cell.content);
        if (text.length > 200) text = text.substring(0, 200) + '...';

        const wrapper = FluentUI.create('div')
            .class('grid-cell-wrapper')
            .style({
                background: '#252526', border: '1px solid #3c3c3c', borderRadius: '4px',
                padding: '8px', height: isIconMode ? '100px' : '150px', overflow: 'hidden', position: 'relative',
                cursor: 'pointer', transition: 'transform 0.2s', display: 'flex', flexDirection: 'column'
            })
            .on('mouseenter', (e) => e.target.style.transform = 'scale(1.02)')
            .on('mouseleave', (e) => e.target.style.transform = 'scale(1)')
            .on('click', () => this.onSwitchView('list', cell.id))
            .child(
                FluentUI.create('div')
                    .style({ fontSize: isIconMode ? '24px' : '16px', textAlign: 'center', marginBottom: '4px' })
                    .text(iconChar)
            );

        if (!isIconMode) {
            wrapper.child(
                FluentUI.create('div')
                    .style({ fontSize: '10px', color: '#888', textTransform: 'uppercase', textAlign: 'center', marginBottom: '4px' })
                    .text(cell.type)
            );
        }

        wrapper.child(
            FluentUI.create('div')
                .style({ fontSize: '10px', color: '#ccc', wordBreak: 'break-all', flex: '1', overflow: 'hidden', opacity: '0.8' })
                .text(text)
        );

        return wrapper;
    }
}
