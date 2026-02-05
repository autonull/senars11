import { Component } from '../components/Component.js';

export class TaskBrowser extends Component {
    constructor(container) {
        super(container);
        this.tasks = []; // Array of { term, type, priority, ... }
        this.filter = '';
        this.onSelect = null;
    }

    addTask(task) {
        if (!task || !task.term) return;

        // Avoid duplicates (simplified check)
        const term = task.term.toString();
        const existing = this.tasks.find(t => t.term === term);

        if (existing) {
            // Update stats
            existing.priority = task.budget ? task.budget.priority : existing.priority;
            existing.count = (existing.count || 1) + 1;
        } else {
            this.tasks.push({
                term: term,
                type: task.type || 'concept',
                priority: task.budget ? task.budget.priority : 0.5,
                count: 1,
                raw: task
            });
        }

        // Debounce render if high frequency? For now direct.
        this.renderList();
    }

    clear() {
        this.tasks = [];
        this.renderList();
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="hud-panel task-browser">
                <div class="hud-header">
                    <h3>Tasks</h3>
                    <div class="task-controls">
                        <input type="text" id="task-search" placeholder="Filter..." class="control-input-small" style="width: 100px;">
                        <button id="btn-clear-tasks" class="btn small-btn" title="Clear List">🗑️</button>
                    </div>
                </div>
                <div id="task-list" class="task-list">
                    <div class="empty-state">No tasks yet</div>
                </div>
            </div>
        `;

        // Styles specific to this component (if not in global CSS)
        // We assume hud-panel styles cover most things

        const searchInput = this.container.querySelector('#task-search');
        if (searchInput) {
            searchInput.oninput = (e) => {
                this.filter = e.target.value.toLowerCase();
                this.renderList();
            };
        }

        const clearBtn = this.container.querySelector('#btn-clear-tasks');
        if (clearBtn) {
            clearBtn.onclick = () => this.clear();
        }
    }

    renderList() {
        const listContainer = this.container.querySelector('#task-list');
        if (!listContainer) return;

        const filtered = this.tasks
            .filter(t => t.term.toLowerCase().includes(this.filter))
            .sort((a, b) => b.priority - a.priority);

        if (filtered.length === 0) {
            listContainer.innerHTML = `<div class="empty-state">${this.tasks.length === 0 ? 'No tasks yet' : 'No matches'}</div>`;
            return;
        }

        // Group by type? Or just flat list for now.
        // Let's do flat list with nice styling

        listContainer.innerHTML = filtered.map(t => {
            const prioClass = t.priority > 0.8 ? 'high' : (t.priority > 0.5 ? 'med' : 'low');
            const safeTerm = this._escapeHtml(this._truncate(t.term));
            const safeTitle = this._escapeHtml(t.term);
            return `
                <div class="task-item ${prioClass}" data-term="${safeTitle}">
                    <div class="task-row">
                        <span class="task-term" title="${safeTitle}">${safeTerm}</span>
                        <span class="task-prio">${t.priority.toFixed(2)}</span>
                    </div>
                </div>
            `;
        }).join('');

        // Bind clicks
        listContainer.querySelectorAll('.task-item').forEach(el => {
            el.onclick = () => {
                if (this.onSelect) this.onSelect(el.dataset.term);
            };
        });
    }

    _truncate(str, n = 25) {
        return (str.length > n) ? str.substr(0, n - 1) + '...' : str;
    }

    _escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}
