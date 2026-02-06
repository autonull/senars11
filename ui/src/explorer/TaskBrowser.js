import { Component } from '../components/Component.js';

export class TaskBrowser extends Component {
    constructor(container) {
        super(container);
        this.concepts = new Map(); // Map<string, { term: string, tasks: Array }>
        this.filter = '';
        this.onSelect = null;
    }

    addTask(task) {
        if (!task || !task.term) return;

        const term = task.term.toString();

        if (!this.concepts.has(term)) {
            this.concepts.set(term, {
                term: term,
                tasks: []
            });
        }

        const conceptEntry = this.concepts.get(term);
        const tasks = conceptEntry.tasks;

        // Deduplication or Update logic
        // We consider a task "same" if it has same type and same derivation rule (if any)
        // Or strictly by object equality if we can't determine ID.
        // For now, let's use a simple check based on type and content if available.
        // If it's an update to an existing task (e.g. budget change), we should update it.

        const existingIndex = tasks.findIndex(t =>
            t.type === (task.type || 'concept') &&
            t.punctuation === task.punctuation &&
            // If derived, check rule
            (t.derivation?.rule === task.derivation?.rule)
        );

        const taskEntry = {
            term: term,
            type: task.type || 'concept',
            punctuation: task.punctuation || '.', // Default to belief if unknown
            priority: task.budget ? task.budget.priority : 0.5,
            truth: task.truth, // {f, c}
            derivation: task.derivation, // { rule, sources }
            timestamp: Date.now(),
            raw: task
        };

        if (existingIndex >= 0) {
            // Update existing
            tasks[existingIndex] = { ...tasks[existingIndex], ...taskEntry };
        } else {
            tasks.push(taskEntry);
        }

        // Sort tasks by priority
        tasks.sort((a, b) => b.priority - a.priority);

        // Debounce render if high frequency? For now direct.
        this.renderList();
    }

    clear() {
        this.concepts.clear();
        this.renderList();
    }

    deleteTask(term, taskIndex) {
        const entry = this.concepts.get(term);
        if (entry) {
            entry.tasks.splice(taskIndex, 1);
            if (entry.tasks.length === 0) {
                this.concepts.delete(term);
            }
            this.renderList();
        }
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="hud-panel task-browser">
                <div class="hud-header">
                    <h3>Tasks & Concepts</h3>
                    <div class="task-controls">
                        <input type="text" id="task-search" placeholder="Filter..." class="control-input-small" style="width: 100px;">
                        <button id="btn-clear-tasks" class="btn small-btn" title="Clear List">🗑️</button>
                    </div>
                </div>
                <div id="task-list" class="task-list" style="overflow-y: auto; flex: 1;">
                    <div class="empty-state">No tasks yet</div>
                </div>
            </div>
        `;

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

        // Filter concepts
        const filteredConcepts = Array.from(this.concepts.values())
            .filter(c => c.term.toLowerCase().includes(this.filter));

        if (filteredConcepts.length === 0) {
            listContainer.innerHTML = `<div class="empty-state">${this.concepts.size === 0 ? 'No tasks yet' : 'No matches'}</div>`;
            return;
        }

        // Sort concepts by max priority of their tasks
        filteredConcepts.sort((a, b) => {
            const maxA = Math.max(...a.tasks.map(t => t.priority));
            const maxB = Math.max(...b.tasks.map(t => t.priority));
            return maxB - maxA;
        });

        const html = filteredConcepts.map(concept => {
            const safeTerm = this._escapeHtml(concept.term);
            const taskCount = concept.tasks.length;
            const maxPrio = Math.max(...concept.tasks.map(t => t.priority));
            const prioClass = maxPrio > 0.8 ? 'high' : (maxPrio > 0.5 ? 'med' : 'low');

            // Tasks HTML
            const tasksHtml = concept.tasks.map((task, index) => {
                const typeIcon = this._getTypeIcon(task.type);
                const truthStr = task.truth ? ` <span class="task-truth">(${task.truth.f.toFixed(2)}, ${task.truth.c.toFixed(2)})</span>` : '';
                const derivationStr = task.derivation ? `<div class="task-derivation">↳ ${task.derivation.rule}</div>` : '';

                return `
                    <div class="sub-task-item" data-term="${safeTerm}" data-index="${index}">
                        <div class="task-row">
                            <span class="task-type" title="${task.type}">${typeIcon}</span>
                            <span class="task-detail">
                                <span class="task-prio">[${task.priority.toFixed(2)}]</span>
                                ${truthStr}
                            </span>
                             <button class="btn-icon delete-task-btn" title="Delete">×</button>
                        </div>
                        ${derivationStr}
                    </div>
                `;
            }).join('');

            return `
                <details class="concept-group ${prioClass}">
                    <summary class="concept-summary" title="${safeTerm}">
                        <span class="concept-term">${this._truncate(safeTerm, 30)}</span>
                        <span class="concept-badge">${taskCount}</span>
                    </summary>
                    <div class="concept-tasks">
                        ${tasksHtml}
                    </div>
                </details>
            `;
        }).join('');

        listContainer.innerHTML = html;

        // Bind events
        listContainer.querySelectorAll('.concept-summary').forEach(el => {
             el.onclick = (e) => {
                 // Prevent toggling when clicking specific parts if needed?
                 // Default behavior is fine.
                 // Also select the concept node in graph
                 const term = el.title; // title holds full term
                 if (this.onSelect) this.onSelect(term);
             };
        });

        listContainer.querySelectorAll('.sub-task-item').forEach(el => {
            el.onclick = (e) => {
                e.stopPropagation(); // Don't collapse details
                if (e.target.classList.contains('delete-task-btn')) {
                    const term = el.dataset.term;
                    const index = parseInt(el.dataset.index);
                    this.deleteTask(term, index);
                } else {
                    // Also select on task click
                    const term = el.dataset.term;
                    if (this.onSelect) this.onSelect(term);
                }
            };
        });
    }

    _getTypeIcon(type) {
        if (!type) return '•';
        const t = type.toLowerCase();
        if (t.includes('belief') || t === 'judgment') return '●'; // Dot
        if (t.includes('goal')) return '♦'; // Diamond
        if (t.includes('question') || t.includes('quest')) return '¿';
        return '•';
    }

    _truncate(str, n = 25) {
        if (!str) return '';
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
