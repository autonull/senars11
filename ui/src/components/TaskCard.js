import { Component } from './Component.js';
import { NarseseHighlighter } from '../utils/NarseseHighlighter.js';
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

        // Data
        const term = this.task.term ?? this.task.sentence?.term ?? 'unknown';
        const truth = this.task.truth ?? this.task.sentence?.truth;
        const punctuation = this.task.punctuation ?? '.';

        const freq = truth?.frequency ?? 0;
        const conf = truth?.confidence ?? 0;
        const fPercent = Math.round(freq * 100);

        const card = FluentUI.create('div')
            .class(`task-card ${this.compact ? 'compact' : 'full'}`)
            .mount(this.container);

        // Event Listeners
        card.on('mouseenter', () => this._dispatchHover(true));
        card.on('mouseleave', () => this._dispatchHover(false));
        card.on('click', () => {
            if (this.task) {
                eventBus.emit(EVENTS.TASK_SELECT, { task: this.task });
            }
        });

        if (this.compact) {
            card.child(
                FluentUI.create('div')
                    .class('task-card-row')
                    .child(FluentUI.create('span').class('task-icon').text('📝'))
                    .child(
                        FluentUI.create('span')
                            .class('task-term')
                            .html(`${NarseseHighlighter.highlight(term)}<span class="nars-punctuation">${punctuation}</span>`)
                    )
            );

            if (truth) {
                card.child(
                    FluentUI.create('div')
                        .class('truth-mini-bar')
                        .attr({ title: `F:${freq.toFixed(2)} C:${conf.toFixed(2)}` })
                        .child(FluentUI.create('div').class('truth-fill').style({ width: `${fPercent}%`, opacity: 0.3 + conf * 0.7 }))
                );
            }
        } else {
            const main = FluentUI.create('div').class('task-card-main').mount(card);

            main.child(
                FluentUI.create('div')
                    .class('task-content')
                    .html(`${NarseseHighlighter.highlight(term)}<span class="nars-punctuation">${punctuation}</span>`)
            );

            if (truth) {
                main.child(
                    FluentUI.create('div')
                        .class('task-meta')
                        .child(
                            FluentUI.create('div')
                                .class('truth-viz-container')
                                .attr({ title: `Frequency: ${freq.toFixed(2)}, Confidence: ${conf.toFixed(2)}` })
                                .child(FluentUI.create('div').class('truth-label').text(`T: {${freq.toFixed(2)} ${conf.toFixed(2)}}`))
                                .child(
                                    FluentUI.create('div')
                                        .class('truth-bar-track')
                                        .child(FluentUI.create('div').class('truth-bar-fill').style({ width: `${fPercent}%`, opacity: 0.3 + conf * 0.7 }))
                                )
                        )
                );
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
}
