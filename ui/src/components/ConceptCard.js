import { Component } from './Component.js';
import { NarseseHighlighter } from '../utils/NarseseHighlighter.js';

export class ConceptCard extends Component {
    constructor(container, concept, options = {}) {
        super(container);
        this.concept = concept;
        this.compact = options.compact ?? false;
    }

    render() {
        if (!this.container) return;

        const div = document.createElement('div');
        div.className = 'concept-card';

        const baseStyles = `
            border-left: 3px solid var(--concept-color);
            border-radius: 0 3px 3px 0;
            cursor: pointer;
            transition: all 0.2s;
        `;

        const compactStyles = `
            background: rgba(255, 255, 255, 0.02);
            padding: 2px 6px;
            margin-bottom: 1px;
            font-size: 10px;
        `;

        const fullStyles = `
            background: rgba(255, 255, 255, 0.04);
            padding: 4px 8px;
            margin-bottom: 4px;
            font-size: 11px;
        `;

        div.style.cssText = baseStyles + (this.compact ? compactStyles : fullStyles);

        div.addEventListener('mouseenter', () => { div.style.background = 'rgba(255, 255, 255, 0.07)'; });
        div.addEventListener('mouseleave', () => { div.style.background = this.compact ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.04)'; });

        const id = this.concept.id ?? this.concept.term;
        const detail = { concept: this.concept, id };

        div.addEventListener('click', () => document.dispatchEvent(new CustomEvent('senars:concept:select', { detail })));
        div.addEventListener('dblclick', () => document.dispatchEvent(new CustomEvent('senars:concept:center', { detail })));

        const term = this.concept.term ?? 'unknown';
        const budget = this.concept.budget ?? {};
        const priority = budget.priority ?? 0;
        const taskCount = this.concept.tasks?.length ?? this.concept.taskCount ?? 0;

        const info = this.compact
            ? `<span title="Tasks">📚${taskCount}</span> <span title="Priority" style="color:${this._getPriorityColor(priority)}">P:${priority.toFixed(2)}</span>`
            : `<span title="Tasks">📚${taskCount}</span> <span title="Priority" style="color:${this._getPriorityColor(priority)}">P:${priority.toFixed(2)}</span> <span title="Durability">D:${(budget.durability ?? 0).toFixed(2)}</span> <span title="Quality">Q:${(budget.quality ?? 0).toFixed(2)}</span>`;

        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <div style="font-weight: 500; font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">
                    ${this.compact ? '<span style="opacity: 0.7;">🧠</span> ' : ''}${NarseseHighlighter.highlight(term)}
                </div>
                <div style="display: flex; gap: ${this.compact ? '4px' : '6px'}; align-items: center; font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); opacity: 0.8;">
                    ${info}
                </div>
            </div>
        `;

        this.container.appendChild(div);
        this.elements.card = div;
    }

    _getPriorityColor(val) {
        return val > 0.8 ? 'var(--accent-primary)' : val > 0.5 ? 'var(--accent-warn)' : '#555';
    }
}
