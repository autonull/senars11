import { Component } from './Component.js';
import { NarseseHighlighter } from '../utils/NarseseHighlighter.js';

export class TaskCard extends Component {
    constructor(container, task) {
        super(container);
        this.task = task;
    }

    render() {
        if (!this.container) return;

        const div = document.createElement('div');
        div.className = 'task-card';
        div.style.cssText = `
            border-left: 3px solid var(--task-color);
            background: rgba(255, 255, 255, 0.03);
            padding: 8px;
            margin-bottom: 5px;
            border-radius: 0 4px 4px 0;
            font-family: var(--font-mono);
            font-size: 11px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            transition: background 0.2s;
        `;

        div.addEventListener('mouseenter', () => {
            div.style.background = 'rgba(255, 255, 255, 0.06)';
            this._dispatchHover(true);
        });
        div.addEventListener('mouseleave', () => {
            div.style.background = 'rgba(255, 255, 255, 0.03)';
            this._dispatchHover(false);
        });

        div.addEventListener('click', () => {
            this.task && document.dispatchEvent(new CustomEvent('senars:task:select', {
                 detail: { task: this.task }
            }));
        });

        const term = this.task.term ?? this.task.sentence?.term ?? 'unknown';
        const truth = this.task.truth ?? this.task.sentence?.truth;
        const punctuation = this.task.punctuation ?? '.';

        const truthStr = truth
            ? `{${(truth.frequency ?? 0).toFixed(2)} ${(truth.confidence ?? 0).toFixed(2)}}`
            : '';

        div.innerHTML = `
            <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${NarseseHighlighter.highlight(term)}<span class="nars-punctuation">${punctuation}</span>
            </div>
            <div style="margin-left: 10px; color: var(--text-muted); font-size: 10px;">
                ${truthStr}
            </div>
        `;

        this.container.appendChild(div);
        this.elements.card = div;
    }

    _dispatchHover(isHovering) {
        this.task && document.dispatchEvent(new CustomEvent('senars:task:hover', {
             detail: { task: this.task, hovering: isHovering }
         }));
    }
}
