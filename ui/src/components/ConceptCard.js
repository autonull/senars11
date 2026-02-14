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
            border-left: 3px solid var(--concept-color);
            background: rgba(255, 255, 255, 0.04);
            padding: 4px 8px;
            margin-bottom: 4px;
            border-radius: 0 3px 3px 0;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 11px;
        `;

        div.addEventListener('mouseenter', () => {
            div.style.background = 'rgba(255, 255, 255, 0.07)';
        });
        div.addEventListener('mouseleave', () => {
            div.style.background = 'rgba(255, 255, 255, 0.04)';
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
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <div style="font-weight: 500; font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">
                    ${NarseseHighlighter.highlight(term)}
                </div>
                <div style="display: flex; gap: 6px; align-items: center; font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); opacity: 0.8;">
                    <span title="Tasks">📚${taskCount}</span>
                    <span title="Priority" style="color:${this._getPriorityColor(priority)}">P:${priority.toFixed(2)}</span>
                    <span title="Durability">D:${durability.toFixed(2)}</span>
                    <span title="Quality">Q:${quality.toFixed(2)}</span>
                </div>
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
