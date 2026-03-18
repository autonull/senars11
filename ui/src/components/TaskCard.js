import { Component } from './Component.js';
import { SyntaxHighlighter } from '../utils/SyntaxHighlighter.js';
import { FluentUI } from '../utils/FluentUI.js';
import { EVENTS } from '../config/constants.js';
import { eventBus } from '../core/EventBus.js';

export class TaskCard extends Component {
    constructor(container, task, options = {}) {
        super(container);
        this.task = task;
        this.compact = options.compact ?? false;
    }

    render() {
        if (!this.container) return;

        // Data normalization
        const term = this.task.term?.toString() ?? 'unknown';
        const truth = this.task.truth;
        const punctuation = this.task.punctuation || '.';
        const type = this.task.type || 'BELIEF'; // Fallback for display

        const freq = truth?.frequency ?? 0;
        const conf = truth?.confidence ?? 0;
        const fPercent = Math.round(freq * 100);

        const card = FluentUI.create('div')
            .class(`task-card ${this.compact ? 'compact' : 'full'}`)
            .mount(this.container);

        // Interaction
        card.on('mouseenter', () => this._dispatchHover(true));
        card.on('mouseleave', () => this._dispatchHover(false));
        card.on('click', (e) => {
            e.stopPropagation();
            if (this.task) {
                eventBus.emit(EVENTS.TASK_SELECT, { task: this.task });
            }
        });

        // Determine icon based on punctuation/type
        let icon = '📝';
        if (punctuation === '!') icon = '🎯'; // Goal
        if (punctuation === '?') icon = '❓'; // Question

        if (this.compact) {
            // Compact Layout
            const row = FluentUI.create('div').class('task-card-row').mount(card);

            row.child(FluentUI.create('span').class('task-icon').text(icon));

            const content = FluentUI.create('span').class('task-term')
                .html(`${SyntaxHighlighter.highlight(term)}<span class="nars-punctuation">${punctuation}</span>`);
            row.child(content);

            if (truth) {
                // Mini Truth Bar
                FluentUI.create('div')
                    .class('truth-mini-bar')
                    .attr({ title: `F:${freq.toFixed(2)} C:${conf.toFixed(2)}` })
                    .child(
                        FluentUI.create('div')
                            .class('truth-fill')
                            .style({
                                width: `${fPercent}%`,
                                opacity: 0.3 + conf * 0.7,
                                backgroundColor: this._getTruthColor(freq)
                            })
                    )
                    .mount(card);
            }
        } else {
            // Full Layout
            const main = FluentUI.create('div').class('task-card-main').mount(card);

            // Term + Punctuation
            main.child(
                FluentUI.create('div')
                    .class('task-content')
                    .html(`${SyntaxHighlighter.highlight(term)}<span class="nars-punctuation">${punctuation}</span>`)
            );

            // Metadata Row
            const meta = FluentUI.create('div').class('task-meta').mount(main);

            // Priority Badge if available
            if (this.task.budget) {
                const prio = this.task.budget.priority || 0;
                meta.child(
                    FluentUI.create('span')
                        .class('meta-badge')
                        .text(`P:${prio.toFixed(2)}`)
                        .style({ color: this._getPriorityColor(prio) })
                );
            }

            // Truth Viz
            if (truth) {
                const viz = FluentUI.create('div')
                    .class('truth-viz-container')
                    .attr({ title: `Frequency: ${freq.toFixed(2)}, Confidence: ${conf.toFixed(2)}` })
                    .mount(meta);

                viz.child(FluentUI.create('div').class('truth-label').text(`{${freq.toFixed(2)} ${conf.toFixed(2)}}`));

                const track = FluentUI.create('div').class('truth-bar-track').mount(viz);
                FluentUI.create('div')
                    .class('truth-bar-fill')
                    .style({
                        width: `${fPercent}%`,
                        opacity: 0.3 + conf * 0.7,
                        backgroundColor: this._getTruthColor(freq)
                    })
                    .mount(track);
            }
        }

        this.elements.card = card.dom;
    }

    _dispatchHover(isHovering) {
        if (this.task) {
            eventBus.emit(EVENTS.TASK_HOVER, {
                task: this.task,
                hovering: isHovering
            });
        }
    }

    _getTruthColor(frequency) {
        // Simple heatmap: Red (0) -> Yellow (0.5) -> Green (1.0) could be used
        // Or strictly strictly binary blue/orange?
        // Using standard SeNARS colors if defined variables, else fallback.
        // Assuming CSS vars are available.
        return 'var(--accent-primary)';
    }

    _getPriorityColor(val) {
        if (val > 0.8) return 'var(--accent-primary, #00ff9d)';
        if (val > 0.5) return 'var(--accent-warn, #ffcc00)';
        return 'var(--text-muted, #666)';
    }
}
