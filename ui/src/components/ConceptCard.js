import { Component } from './Component.js';
import { NarseseHighlighter } from '../utils/NarseseHighlighter.js';
import { FluentUI } from '../utils/FluentUI.js';
import { EVENTS } from '../config/constants.js';
import { eventBus } from '../core/EventBus.js';

export class ConceptCard extends Component {
    constructor(container, concept, options = {}) {
        super(container);
        this.concept = concept;
        this.compact = options.compact ?? false;
    }

    render() {
        if (!this.container) return;

        // Data extraction
        const term = this.concept.term ?? 'unknown';
        const budget = this.concept.budget ?? {};
        const priority = budget.priority ?? 0;
        const taskCount = this.concept.tasks?.length ?? this.concept.taskCount ?? 0;
        const pColor = this._getPriorityColor(priority);
        const pPercent = Math.round(priority * 100);

        const card = FluentUI.create('div')
            .class(`concept-card ${this.compact ? 'compact' : 'full'}`)
            .mount(this.container);

        // Event handling
        const payload = { concept: this.concept, id: this.concept.id ?? this.concept.term };
        card.on('click', () => eventBus.emit(EVENTS.CONCEPT_SELECT, payload));
        card.on('dblclick', () => eventBus.emit(EVENTS.CONCEPT_CENTER, payload));

        if (this.compact) {
            card.child(
                FluentUI.create('div')
                    .class('concept-card-header')
                    .child(FluentUI.create('span').class('concept-icon').text('🧠'))
                    .child(FluentUI.create('span').class('concept-term').html(NarseseHighlighter.highlight(term)))
            ).child(
                FluentUI.create('div')
                    .class('concept-card-stats')
                    .child(FluentUI.create('span').class('badge').attr({ title: 'Task Count' }).text(`📚 ${taskCount}`))
                    .child(FluentUI.create('span').class('badge').attr({ title: `Priority: ${priority.toFixed(2)}` }).style({ color: pColor }).text(`P ${pPercent}%`))
            );
        } else {
            card.child(
                FluentUI.create('div')
                    .class('concept-card-main')
                    .child(FluentUI.create('div').class('concept-term-large').html(NarseseHighlighter.highlight(term)))
                    .child(
                        FluentUI.create('div')
                            .class('concept-meta-row')
                            .child(
                                FluentUI.create('div')
                                    .class('priority-meter-container')
                                    .attr({ title: `Priority: ${priority.toFixed(2)}` })
                                    .child(FluentUI.create('div').class('priority-meter-bar').style({ width: `${pPercent}%`, background: pColor }))
                            )
                            .child(
                                FluentUI.create('div')
                                    .class('concept-stats')
                                    .child(FluentUI.create('span').class('stat-item').attr({ title: 'Tasks' }).text(`📚 ${taskCount}`))
                                    .child(FluentUI.create('span').class('stat-item').attr({ title: 'Durability' }).text(`D: ${(budget.durability ?? 0).toFixed(2)}`))
                                    .child(FluentUI.create('span').class('stat-item').attr({ title: 'Quality' }).text(`Q: ${(budget.quality ?? 0).toFixed(2)}`))
                            )
                    )
            );
        }

        this.elements.card = card.dom;
    }

    _getPriorityColor(val) {
        if (val > 0.8) return 'var(--accent-primary, #00ff9d)';
        if (val > 0.5) return 'var(--accent-warn, #ffcc00)';
        return 'var(--text-muted, #666)';
    }
}
