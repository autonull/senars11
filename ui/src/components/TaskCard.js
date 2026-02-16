import { Component } from './Component.js';
import { NarseseHighlighter } from '../utils/NarseseHighlighter.js';
import { contextMenu } from './GlobalContextMenu.js';

export class TaskCard extends Component {
    constructor(container, task, options = {}) {
        super(container);
        this.task = task;
        this.compact = options.compact || false;
    }

    render() {
        if (!this.container) return;

        const div = document.createElement('div');
        div.className = 'task-card';

        let styles = `
            border-left: 3px solid var(--task-color);
            background: rgba(255, 255, 255, 0.03);
            border-radius: 0 3px 3px 0;
            font-family: var(--font-mono);
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            transition: background 0.2s;
        `;

        if (this.compact) {
            styles += `
                padding: 2px 6px;
                margin-bottom: 1px;
                font-size: 10px;
                line-height: 1.2;
                background: rgba(0, 0, 0, 0.2);
            `;
        } else {
            styles += `
                padding: 4px 8px;
                margin-bottom: 2px;
                font-size: 11px;
                line-height: 1.4;
            `;
        }

        div.style.cssText = styles;

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

        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this._showContextMenu(e);
        });

        const term = this.task.term ?? this.task.sentence?.term ?? 'unknown';
        const truth = this.task.truth ?? this.task.sentence?.truth;
        const punctuation = this.task.punctuation ?? '.';

        const truthStr = truth
            ? `{${(truth.frequency ?? 0).toFixed(2)} ${(truth.confidence ?? 0).toFixed(2)}}`
            : '';

        if (this.compact) {
            div.innerHTML = `
                <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 4px;">
                     <span style="opacity: 0.7;">📝</span>
                     ${NarseseHighlighter.highlight(term)}<span class="nars-punctuation">${punctuation}</span>
                </div>
                <div style="margin-left: 6px; color: var(--text-muted); opacity: 0.8; font-size: 9px;">
                    ${truthStr}
                </div>
            `;
        } else {
            div.innerHTML = `
                <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${NarseseHighlighter.highlight(term)}<span class="nars-punctuation">${punctuation}</span>
                </div>
                <div style="margin-left: 10px; color: var(--text-muted); font-size: 10px;">
                    ${truthStr}
                </div>
            `;
        }

        this.container.appendChild(div);
        this.elements.card = div;
    }

    _dispatchHover(isHovering) {
        this.task && document.dispatchEvent(new CustomEvent('senars:task:hover', {
             detail: { task: this.task, hovering: isHovering }
         }));
    }

    _showContextMenu(e) {
        const term = this.task.term || this.task.sentence?.term || 'unknown';
        const items = [
            {
                label: 'Copy Term',
                icon: '📋',
                action: () => {
                    navigator.clipboard.writeText(term);
                    console.log('Copied term:', term);
                }
            },
            {
                label: 'Log to Console',
                icon: '📝',
                action: () => console.log('Task:', this.task)
            },
            { separator: true },
            {
                label: 'Inspect in Graph',
                icon: '🔍',
                action: () => {
                     // Assuming REPL command available
                     document.dispatchEvent(new CustomEvent('senars:repl:execute', {
                         detail: { command: `/inspect ${term}` }
                     }));
                }
            }
        ];

        contextMenu.show(e.clientX, e.clientY, items);
    }
}
