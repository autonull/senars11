import { Cell } from './Cell.js';
import { VIEW_MODES, MESSAGE_CATEGORIES } from '../MessageFilter.js';
import { ConceptCard } from '../../components/ConceptCard.js';
import { TaskCard } from '../../components/TaskCard.js';
import { NarseseHighlighter } from '../../utils/NarseseHighlighter.js';
import { Modal } from '../../components/ui/Modal.js';
import { WidgetFactory } from '../../components/widgets/WidgetFactory.js';
import { FluentUI } from '../../utils/FluentUI.js';

/**
 * Result cell for output display
 */
export class ResultCell extends Cell {
    constructor(content, category = 'result', viewMode = VIEW_MODES.FULL) {
        super('result', content);
        this.category = category;
        this.viewMode = viewMode;
    }

    render() {
        const wrapper = FluentUI.create('div')
            .class('repl-cell result-cell')
            .data('cellId', this.id)
            .data('category', this.category)
            .attr({ draggable: 'true' });

        this.element = wrapper.dom;
        this.updateViewMode(this.viewMode);
        return this.element;
    }

    updateViewMode(mode) {
        this.viewMode = mode;
        if (!this.element) return;

        const catInfo = MESSAGE_CATEGORIES[this.category] || MESSAGE_CATEGORIES.unknown;
        const color = catInfo.color || '#00ff88';

        this.element.style.display = mode === VIEW_MODES.HIDDEN ? 'none' : 'block';

        if (mode !== VIEW_MODES.HIDDEN) {
            this.element.innerHTML = '';
            if (mode === VIEW_MODES.COMPACT) {
                this._renderCompact(catInfo, color);
            } else {
                this._renderFull(catInfo, color);
            }
        }
    }

    _renderCompact(catInfo, color) {
        this.element.innerHTML = '';
        this.element.onclick = () => this.updateViewMode(VIEW_MODES.FULL);
        this.element.title = "Click to expand";

        const wrapper = new FluentUI(this.element);

        if (this.category === 'concept' && typeof this.content === 'object') {
            wrapper.style({ marginBottom: '1px' });
            new ConceptCard(this.element, this.content, { compact: true }).render();
            return;
        }
        if (this.category === 'task' && typeof this.content === 'object') {
            wrapper.style({ marginBottom: '1px' });
            new TaskCard(this.element, this.content, { compact: true }).render();
            return;
        }

        wrapper.style({
            marginBottom: '2px', padding: '2px 6px', borderLeft: `3px solid ${color}`,
            background: 'rgba(0,0,0,0.2)', borderRadius: '2px', display: 'flex',
            alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85em'
        });

        wrapper.child(
            FluentUI.create('span')
                .style({ color })
                .html(`${catInfo.icon || '✨'}`)
        );

        let previewText = '';
        if (typeof this.content === 'string') {
            previewText = this.content;
        } else {
            previewText = JSON.stringify(this.content);
        }

        if (previewText.length > 120) previewText = previewText.substring(0, 120) + '...';

        const previewSpan = FluentUI.create('span')
            .style({ color: '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1', opacity: '0.8' });

        if (this.category === 'reasoning') {
             previewSpan.html(previewText.replace(/(\w+)(\:)/, '<span style="color:#00d4ff">$1</span>$2'));
        } else {
             previewSpan.text(previewText);
        }

        wrapper.child(previewSpan);
    }

    _renderFull(catInfo, color) {
        this.element.onclick = null;
        this.element.innerHTML = '';
        const wrapper = new FluentUI(this.element);

        wrapper.child(this._createActionsToolbar(catInfo));

        if ((this.category === 'concept' || this.category === 'task') && typeof this.content === 'object') {
            wrapper.style({ marginBottom: '8px', position: 'relative' });
            const cardWrapper = FluentUI.create('div').mount(wrapper).dom;
            if (this.category === 'concept') new ConceptCard(cardWrapper, this.content).render();
            else new TaskCard(cardWrapper, this.content).render();
            return;
        }

        wrapper.style({
            marginBottom: '8px', padding: '8px', borderLeft: `3px solid ${color}`,
            background: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px', position: 'relative'
        });

        const contentDiv = FluentUI.create('div')
            .style({ whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: '#d4d4d4', overflowX: 'auto', fontSize: '0.95em' });

        if (typeof this.content === 'string') {
            contentDiv.html(NarseseHighlighter.highlight(this.content));
        } else if (this.category === 'derivation') {
             // Embed Derivation Widget
             contentDiv.style({ height: '300px', position: 'relative' });
             const widget = WidgetFactory.createWidget('derivation', contentDiv.dom, this.content);
             requestAnimationFrame(() => widget?.render());
        } else {
            contentDiv.text(JSON.stringify(this.content, null, 2));
        }

        wrapper.child(contentDiv);
    }

    _createActionsToolbar(catInfo) {
        const actions = FluentUI.create('div')
            .class('cell-actions')
            .style({
                position: 'absolute', top: '4px', right: '4px', opacity: '0', transition: 'opacity 0.2s',
                display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.5)', padding: '2px 4px', borderRadius: '3px', zIndex: '10'
            });

        this.element.onmouseenter = () => actions.style({ opacity: '1' });
        this.element.onmouseleave = () => actions.style({ opacity: '0' });

        actions.child(this._createActionBtn('🔽', 'Collapse', () => this.updateViewMode(VIEW_MODES.COMPACT)));

        const copyBtn = this._createActionBtn('📋', 'Copy', (e) => {
            const text = typeof this.content === 'object' ? JSON.stringify(this.content, null, 2) : this.content;
            navigator.clipboard.writeText(text);
            e.target.innerHTML = '✅';
            setTimeout(() => e.target.innerHTML = '📋', 1500);
        });
        actions.child(copyBtn);

        actions.child(this._createActionBtn('ℹ️', 'Details', () => {
            Modal.alert(`Type: ${catInfo.label}<br>Time: ${new Date(this.timestamp).toLocaleString()}<br>Category: ${this.category}`, 'Cell Info');
        }));

        return actions.dom;
    }

    _createActionBtn(icon, title, onClick) {
        return FluentUI.create('button')
            .html(icon)
            .attr({ title })
            .on('click', onClick)
            .style({ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ccc', padding: '2px', fontSize: '14px' })
            .on('mouseenter', (e) => e.target.style.color = '#fff')
            .on('mouseleave', (e) => e.target.style.color = '#ccc')
            .dom;
    }
}
