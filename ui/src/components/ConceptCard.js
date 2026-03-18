import { Component } from './Component.js';
import { SyntaxHighlighter } from '../utils/SyntaxHighlighter.js';
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
        // Handle various concept formats (raw object vs class instance)
        const term = this.concept.term?.toString() ?? this.concept.id ?? 'unknown';
        const budget = this.concept.budget ?? {};
        const priority = budget.priority ?? this.concept.activation ?? 0;
        const taskCount = this.concept.tasks?.length ?? this.concept.totalTasks ?? 0;

        const pColor = this._getPriorityColor(priority);
        const pPercent = Math.round(priority * 100);

        const card = FluentUI.create('div')
            .class(`concept-card ${this.compact ? 'compact' : 'full'}`)
            .mount(this.container);

        // Event handling
        const payload = {
            concept: this.concept,
            id: this.concept.id ?? (typeof this.concept.term === 'string' ? this.concept.term : this.concept.term?.toString())
        };

        card.on('click', (e) => {
            e.stopPropagation();
            eventBus.emit(EVENTS.CONCEPT_SELECT, payload);
        });

        card.on('dblclick', (e) => {
            e.stopPropagation();
            eventBus.emit(EVENTS.CONCEPT_CENTER, payload);
        });

        if (this.compact) {
            // Compact Header
            const header = FluentUI.create('div').class('concept-card-header').mount(card);
            header.child(FluentUI.create('span').class('concept-icon').text('🧠'));
            header.child(FluentUI.create('span').class('concept-term').html(SyntaxHighlighter.highlight(term)));

            // Stats Row
            const stats = FluentUI.create('div').class('concept-card-stats').mount(card);

            // Task Count Badge
            stats.child(
                FluentUI.create('span')
                    .class('badge')
                    .attr({ title: 'Task Count' })
                    .text(`📚 ${taskCount}`)
            );

            // Priority Badge
            stats.child(
                FluentUI.create('span')
                    .class('badge')
                    .attr({ title: `Priority: ${priority.toFixed(2)}` })
                    .style({ color: pColor })
                    .text(`P ${pPercent}%`)
            );
        } else {
            // Full Layout
            const main = FluentUI.create('div').class('concept-card-main').mount(card);

            // Large Term Display
            main.child(
                FluentUI.create('div')
                    .class('concept-term-large')
                    .html(SyntaxHighlighter.highlight(term))
            );

            // Meta Row
            const meta = FluentUI.create('div').class('concept-meta-row').mount(main);

            // Priority Bar
            const meter = FluentUI.create('div')
                .class('priority-meter-container')
                .attr({ title: `Priority: ${priority.toFixed(2)}` })
                .mount(meta);

            FluentUI.create('div')
                .class('priority-meter-bar')
                .style({ width: `${pPercent}%`, background: pColor })
                .mount(meter);

            // Detailed Stats
            const details = FluentUI.create('div').class('concept-stats').mount(meta);

            details.child(
                FluentUI.create('span')
                    .class('stat-item')
                    .attr({ title: 'Tasks' })
                    .text(`📚 ${taskCount}`)
            );

            if (budget.durability !== undefined) {
                details.child(
                    FluentUI.create('span')
                        .class('stat-item')
                        .attr({ title: 'Durability' })
                        .text(`D: ${budget.durability.toFixed(2)}`)
                );
            }

            if (budget.quality !== undefined) {
                details.child(
                    FluentUI.create('span')
                        .class('stat-item')
                        .attr({ title: 'Quality' })
                        .text(`Q: ${budget.quality.toFixed(2)}`)
                );
            }
        }

        this.elements.card = card.dom;
    }

    _getPriorityColor(val) {
        if (val > 0.8) return 'var(--accent-primary, #00ff9d)';
        if (val > 0.5) return 'var(--accent-warn, #ffcc00)';
        return 'var(--text-muted, #666)';
    }
}
