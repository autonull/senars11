import { Component } from './Component.js';
import { NarseseHighlighter } from '../utils/NarseseHighlighter.js';

export class ConceptCard extends Component {
    constructor(container, concept) {
        super(container);
        this.concept = concept;
    }

    render() {
        if (!this.container) return;

        const div = document.createElement('div');
        div.className = 'concept-card';
        div.style.cssText = `
            border-left: 4px solid var(--concept-color);
            background: rgba(255, 255, 255, 0.05);
            padding: 10px;
            margin-bottom: 8px;
            border-radius: 0 4px 4px 0;
            cursor: pointer;
            transition: all 0.2s;
        `;

        div.addEventListener('mouseenter', () => {
            div.style.background = 'rgba(255, 255, 255, 0.08)';
            div.style.transform = 'translateX(2px)';
        });
        div.addEventListener('mouseleave', () => {
            div.style.background = 'rgba(255, 255, 255, 0.05)';
            div.style.transform = 'translateX(0)';
        });

        const id = this.concept.id ?? this.concept.term;
        const detail = { concept: this.concept, id };

        div.addEventListener('click', () => document.dispatchEvent(new CustomEvent('senars:concept:select', { detail })));
        div.addEventListener('dblclick', () => document.dispatchEvent(new CustomEvent('senars:concept:center', { detail })));

        const term = this.concept.term ?? 'unknown';
        const priority = this.concept.budget?.priority ?? 0;
        const durability = this.concept.budget?.durability ?? 0;
        const quality = this.concept.budget?.quality ?? 0;
        const taskCount = this.concept.tasks?.length ?? this.concept.taskCount ?? 0;

        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 5px;">
                <div style="font-weight: bold; font-family: var(--font-mono); font-size: 12px; word-break: break-all;">
                    ${NarseseHighlighter.highlight(term)}
                </div>
                <div style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 10px; font-size: 10px; color: var(--text-muted);">
                    ${taskCount} tasks
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; font-size: 9px; color: var(--text-muted);">
                ${this._renderBudgetBar('P', priority)}
                ${this._renderBudgetBar('D', durability)}
                ${this._renderBudgetBar('Q', quality)}
            </div>
        `;

        this.container.appendChild(div);
        this.elements.card = div;
    }

    _getPriorityColor(val) {
        return val > 0.8 ? 'var(--accent-primary)' : val > 0.5 ? 'var(--accent-warn)' : '#555';
    }

    _renderBudgetBar(label, value) {
        const percent = (value * 100).toFixed(0);
        return `
            <div style="display: flex; flex-direction: column; gap: 2px;">
                <div style="display: flex; justify-content: space-between;">
                    <span>${label}</span>
                    <span>${value.toFixed(2)}</span>
                </div>
                <div style="height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                    <div style="width: ${percent}%; height: 100%; background: ${this._getPriorityColor(value)};"></div>
                </div>
            </div>
        `;
    }
}
