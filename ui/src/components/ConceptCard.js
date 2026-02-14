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

        const card = document.createElement('div');
        card.className = `concept-card ${this.compact ? 'compact' : 'full'}`;

        // Event handling
        const detail = { concept: this.concept, id: this.concept.id ?? this.concept.term };
        card.addEventListener('click', () => document.dispatchEvent(new CustomEvent('senars:concept:select', { detail })));
        card.addEventListener('dblclick', () => document.dispatchEvent(new CustomEvent('senars:concept:center', { detail })));

        // Data extraction
        const term = this.concept.term ?? 'unknown';
        const budget = this.concept.budget ?? {};
        const priority = budget.priority ?? 0;
        const taskCount = this.concept.tasks?.length ?? this.concept.taskCount ?? 0;

        // Visuals
        const pColor = this._getPriorityColor(priority);
        const pPercent = Math.round(priority * 100);

        if (this.compact) {
            card.innerHTML = `
                <div class="concept-card-header">
                    <span class="concept-icon">🧠</span>
                    <span class="concept-term">${NarseseHighlighter.highlight(term)}</span>
                </div>
                <div class="concept-card-stats">
                    <span class="badge" title="Task Count">📚 ${taskCount}</span>
                    <span class="badge" title="Priority: ${priority.toFixed(2)}" style="color: ${pColor}">P ${pPercent}%</span>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="concept-card-main">
                    <div class="concept-term-large">${NarseseHighlighter.highlight(term)}</div>
                    <div class="concept-meta-row">
                        <div class="priority-meter-container" title="Priority: ${priority.toFixed(2)}">
                            <div class="priority-meter-bar" style="width: ${pPercent}%; background: ${pColor};"></div>
                        </div>
                        <div class="concept-stats">
                            <span class="stat-item" title="Tasks">📚 ${taskCount}</span>
                            <span class="stat-item" title="Durability">D: ${(budget.durability ?? 0).toFixed(2)}</span>
                            <span class="stat-item" title="Quality">Q: ${(budget.quality ?? 0).toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        this.container.appendChild(card);
        this.elements.card = card;
    }

    _getPriorityColor(val) {
        if (val > 0.8) return 'var(--accent-primary, #00ff9d)';
        if (val > 0.5) return 'var(--accent-warn, #ffcc00)';
        return 'var(--text-muted, #666)';
    }
}
