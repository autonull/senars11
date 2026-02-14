import { Component } from './Component.js';
import { NarseseHighlighter } from '../utils/NarseseHighlighter.js';

export class TaskCard extends Component {
    constructor(container, task, options = {}) {
        super(container);
        this.task = task;
        this.compact = options.compact ?? false;
    }

    render() {
        if (!this.container) return;

        const card = document.createElement('div');
        card.className = `task-card ${this.compact ? 'compact' : 'full'}`;

        // Event Listeners
        card.addEventListener('mouseenter', () => this._dispatchHover(true));
        card.addEventListener('mouseleave', () => this._dispatchHover(false));
        card.addEventListener('click', () => {
            if (this.task) {
                document.dispatchEvent(new CustomEvent('senars:task:select', { detail: { task: this.task } }));
            }
        });

        // Data
        const term = this.task.term ?? this.task.sentence?.term ?? 'unknown';
        const truth = this.task.truth ?? this.task.sentence?.truth;
        const punctuation = this.task.punctuation ?? '.';

        const freq = truth?.frequency ?? 0;
        const conf = truth?.confidence ?? 0;
        const fPercent = Math.round(freq * 100);
        const cPercent = Math.round(conf * 100);

        if (this.compact) {
            card.innerHTML = `
                <div class="task-card-row">
                    <span class="task-icon">📝</span>
                    <span class="task-term">${NarseseHighlighter.highlight(term)}<span class="nars-punctuation">${punctuation}</span></span>
                </div>
                ${truth ? `
                <div class="truth-mini-bar" title="F:${freq.toFixed(2)} C:${conf.toFixed(2)}">
                    <div class="truth-fill" style="width: ${fPercent}%; opacity: ${0.3 + conf * 0.7};"></div>
                </div>` : ''}
            `;
        } else {
            card.innerHTML = `
                <div class="task-card-main">
                    <div class="task-content">
                        ${NarseseHighlighter.highlight(term)}<span class="nars-punctuation">${punctuation}</span>
                    </div>
                    ${truth ? `
                    <div class="task-meta">
                        <div class="truth-viz-container" title="Frequency: ${freq.toFixed(2)}, Confidence: ${conf.toFixed(2)}">
                            <div class="truth-label">T: {${freq.toFixed(2)} ${conf.toFixed(2)}}</div>
                            <div class="truth-bar-track">
                                <div class="truth-bar-fill" style="width: ${fPercent}%; opacity: ${0.3 + conf * 0.7};"></div>
                            </div>
                        </div>
                    </div>` : ''}
                </div>
            `;
        }

        this.container.appendChild(card);
        this.elements.card = card;
    }

    _dispatchHover(isHovering) {
        if (this.task) {
            document.dispatchEvent(new CustomEvent('senars:task:hover', {
                detail: { task: this.task, hovering: isHovering }
            }));
        }
    }
}
