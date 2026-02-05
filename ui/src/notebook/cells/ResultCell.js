import { Cell } from './Cell.js';
import { VIEW_MODES, MESSAGE_CATEGORIES } from '../MessageFilter.js';
import { ConceptCard } from '../../components/ConceptCard.js';
import { TaskCard } from '../../components/TaskCard.js';
import { NarseseHighlighter } from '../../utils/NarseseHighlighter.js';
import { Modal } from '../../components/ui/Modal.js';
import { WidgetFactory } from '../../components/widgets/WidgetFactory.js';

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
        this.element = document.createElement('div');
        this.element.className = 'repl-cell result-cell';
        this.element.dataset.cellId = this.id;
        this.element.dataset.category = this.category;
        this.element.draggable = true;

        this.updateViewMode(this.viewMode);
        return this.element;
    }

    updateViewMode(mode) {
        this.viewMode = mode;
        if (!this.element) return;

        const catInfo = MESSAGE_CATEGORIES[this.category] || MESSAGE_CATEGORIES.unknown;
        const color = catInfo.color || '#00ff88';

        this.element.style.display = mode === VIEW_MODES.HIDDEN ? 'none' : 'block';

        // Don't clear innerHTML if not necessary or if we want to preserve state?
        // Actually, switching modes usually requires re-render.
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

        if (this.category === 'concept' && typeof this.content === 'object') {
            this.element.style.cssText = 'margin-bottom: 1px;';
            new ConceptCard(this.element, this.content, { compact: true }).render();
            return;
        }
        if (this.category === 'task' && typeof this.content === 'object') {
            this.element.style.cssText = 'margin-bottom: 1px;';
            new TaskCard(this.element, this.content, { compact: true }).render();
            return;
        }

        this.element.style.cssText = `
            margin-bottom: 2px; padding: 2px 6px; border-left: 3px solid ${color};
            background: rgba(0,0,0,0.2); border-radius: 2px; display: flex;
            align-items: center; gap: 8px; cursor: pointer; font-size: 0.85em;
        `;

        const badge = document.createElement('span');
        badge.style.color = color;
        badge.innerHTML = `${catInfo.icon || '✨'}`;

        const preview = document.createElement('span');
        preview.style.cssText = 'color: #aaa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; opacity: 0.8;';

        let previewText = '';
        if (typeof this.content === 'string') {
            previewText = this.content;
        } else {
            previewText = JSON.stringify(this.content);
        }

        if (previewText.length > 120) previewText = previewText.substring(0, 120) + '...';

        if (this.category === 'reasoning') {
             preview.innerHTML = previewText.replace(/(\w+)(\:)/, '<span style="color:#00d4ff">$1</span>$2');
        } else {
             preview.textContent = previewText;
        }

        this.element.append(badge, preview);
    }

    _renderFull(catInfo, color) {
        this.element.onclick = null;
        this.element.innerHTML = '';

        const actions = this._createActionsToolbar(catInfo);
        this.element.appendChild(actions);

        if ((this.category === 'concept' || this.category === 'task') && typeof this.content === 'object') {
            this.element.style.cssText = 'margin-bottom: 8px; position: relative;';
            const cardWrapper = document.createElement('div');
            if (this.category === 'concept') new ConceptCard(cardWrapper, this.content).render();
            else new TaskCard(cardWrapper, this.content).render();
            this.element.appendChild(cardWrapper);
            return;
        }

        this.element.style.cssText = `
            margin-bottom: 8px; padding: 8px; border-left: 3px solid ${color};
            background: rgba(255, 255, 255, 0.03); border-radius: 4px; position: relative;
        `;

        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = 'white-space: pre-wrap; font-family: monospace; color: #d4d4d4; overflow-x: auto; font-size: 0.95em;';

        if (typeof this.content === 'string') {
            contentDiv.innerHTML = NarseseHighlighter.highlight(this.content);
        } else if (this.category === 'derivation') {
             // Embed Derivation Widget
             contentDiv.style.height = '300px';
             contentDiv.style.position = 'relative';
             const widget = WidgetFactory.createWidget('derivation', contentDiv, this.content);
             requestAnimationFrame(() => widget?.render());
        } else {
            contentDiv.textContent = JSON.stringify(this.content, null, 2);
        }

        this.element.appendChild(contentDiv);
    }

    _createActionsToolbar(catInfo) {
        const actions = document.createElement('div');
        actions.className = 'cell-actions';
        actions.style.cssText = `
            position: absolute; top: 4px; right: 4px; opacity: 0; transition: opacity 0.2s;
            display: flex; gap: 6px; background: rgba(0,0,0,0.5); padding: 2px 4px; border-radius: 3px; z-index: 10;
        `;

        this.element.onmouseenter = () => actions.style.opacity = '1';
        this.element.onmouseleave = () => actions.style.opacity = '0';

        const collapseBtn = this._createActionBtn('🔽', 'Collapse', () => this.updateViewMode(VIEW_MODES.COMPACT));

        const copyBtn = this._createActionBtn('📋', 'Copy', (e) => {
            const text = typeof this.content === 'object' ? JSON.stringify(this.content, null, 2) : this.content;
            navigator.clipboard.writeText(text);
            copyBtn.innerHTML = '✅';
            setTimeout(() => copyBtn.innerHTML = '📋', 1500);
        });

        const infoBtn = this._createActionBtn('ℹ️', 'Details', () => {
            Modal.alert(`Type: ${catInfo.label}<br>Time: ${new Date(this.timestamp).toLocaleString()}<br>Category: ${this.category}`, 'Cell Info');
        });

        actions.append(copyBtn, infoBtn, collapseBtn);
        return actions;
    }

    _createActionBtn(icon, title, onClick) {
        const btn = document.createElement('button');
        btn.innerHTML = icon;
        btn.title = title;
        btn.onclick = onClick;
        btn.style.cssText = 'background: transparent; border: none; cursor: pointer; color: #ccc; padding: 2px; font-size: 14px;';
        btn.onmouseenter = () => btn.style.color = '#fff';
        btn.onmouseleave = () => btn.style.color = '#ccc';
        return btn;
    }
}
