import { Component } from '../components/Component.js';
import { NarseseHighlighter } from '../utils/NarseseHighlighter.js';

export class TaskBrowser extends Component {
    constructor(container) {
        super(container);
        this.concepts = new Map(); // Map<string, { term: string, tasks: Array }>
        this.filter = '';
        this.typeFilters = { belief: true, goal: true, question: true };
        this.expandedStates = new Set(); // Track expanded concepts
        this.onSelect = null;
        this.onTrace = null;
        this.renderPending = false;
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

        this.requestRender();
    }

    requestRender() {
        if (this.renderPending) return;
        this.renderPending = true;
        requestAnimationFrame(() => {
            this.renderList();
            this.renderPending = false;
        });
    }

    clear() {
        this.concepts.clear();
        this.expandedStates.clear();
        this.requestRender();
    }

    deleteTask(term, taskIndex) {
        const entry = this.concepts.get(term);
        if (entry) {
            entry.tasks.splice(taskIndex, 1);
            if (entry.tasks.length === 0) {
                this.concepts.delete(term);
            }
            this.requestRender();
        }
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="hud-panel task-browser">
                <div class="hud-header">
                    <h3>Tasks & Concepts</h3>
                    <div class="task-controls">
                        <div class="filter-toggles">
                            <button class="btn-toggle ${this.typeFilters.belief ? 'active' : ''}" data-type="belief" title="Toggle Beliefs">●</button>
                            <button class="btn-toggle ${this.typeFilters.goal ? 'active' : ''}" data-type="goal" title="Toggle Goals">♦</button>
                            <button class="btn-toggle ${this.typeFilters.question ? 'active' : ''}" data-type="question" title="Toggle Questions">¿</button>
                        </div>
                        <input type="text" id="task-search" placeholder="Filter..." class="control-input-small" style="width: 80px;">
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

        this.container.querySelectorAll('.btn-toggle').forEach(btn => {
            btn.onclick = (e) => {
                const type = e.target.dataset.type;
                this.typeFilters[type] = !this.typeFilters[type];
                e.target.classList.toggle('active', this.typeFilters[type]);
                this.renderList();
            };
        });

        const clearBtn = this.container.querySelector('#btn-clear-tasks');
        if (clearBtn) {
            clearBtn.onclick = () => this.clear();
        }
    }

    renderList() {
        const listContainer = this.container.querySelector('#task-list');
        if (!listContainer) return;

        // Helper to check if task type is visible
        const isTypeVisible = (t) => {
            const type = t.type.toLowerCase();
            if (type.includes('goal')) return this.typeFilters.goal;
            if (type.includes('question') || type.includes('quest')) return this.typeFilters.question;
            return this.typeFilters.belief;
        };

        // Filter concepts and their tasks
        const filteredConcepts = Array.from(this.concepts.values())
            .map(c => ({
                ...c,
                // We keep original indices by mapping first
                visibleItems: c.tasks.map((t, i) => ({ task: t, index: i })).filter(({ task }) => isTypeVisible(task))
            }))
            .filter(c => c.visibleItems.length > 0 && c.term.toLowerCase().includes(this.filter));

        if (filteredConcepts.length === 0) {
            listContainer.innerHTML = `<div class="empty-state">${this.concepts.size === 0 ? 'No tasks yet' : 'No matches'}</div>`;
            return;
        }

        // Sort concepts by max priority of their visible tasks
        filteredConcepts.sort((a, b) => {
            const maxA = Math.max(...a.visibleItems.map(item => item.task.priority));
            const maxB = Math.max(...b.visibleItems.map(item => item.task.priority));
            return maxB - maxA;
        });

        const html = filteredConcepts.map(concept => {
            const rawTerm = concept.term;
            const safeTerm = this._escapeHtml(rawTerm);
            const highlightedTerm = NarseseHighlighter.highlight(rawTerm);
            const taskCount = concept.visibleItems.length;
            const maxPrio = Math.max(...concept.visibleItems.map(item => item.task.priority));
            const prioClass = maxPrio > 0.8 ? 'high' : (maxPrio > 0.5 ? 'med' : 'low');

            // Tasks HTML
            const tasksHtml = concept.visibleItems.map(({ task, index }) => {
                const typeIcon = this._getTypeIcon(task.type);
                const truthStr = task.truth ? ` <span class="task-truth">(${task.truth.f.toFixed(2)}, ${task.truth.c.toFixed(2)})</span>` : '';
                const derivationStr = task.derivation ? `<div class="task-derivation">↳ ${task.derivation.rule}</div>` : '';

                // Add trace button if derived
                const traceBtn = task.derivation ?
                    `<button class="btn-icon trace-task-btn" title="Trace Derivation">🔗</button>` : '';

                return `
                    <div class="sub-task-item" data-term="${safeTerm}" data-index="${index}">
                        <div class="task-row">
                            <span class="task-type" title="${task.type}">${typeIcon}</span>
                            <span class="task-detail">
                                <span class="task-prio">[${task.priority.toFixed(2)}]</span>
                                ${truthStr}
                            </span>
                             ${traceBtn}
                             <button class="btn-icon delete-task-btn" title="Delete">×</button>
                        </div>
                        ${derivationStr}
                    </div>
                `;
            }).join('');

            const isExpanded = this.expandedStates.has(rawTerm) ? 'open' : '';

            // We store the term in a data attribute. Since safeTerm is escaped,
            // putting it in innerHTML attribute value is correct.
            // When reading dataset.term, browser decodes entities.
            return `
                <details class="concept-group ${prioClass}" ${isExpanded} data-term="${safeTerm}">
                    <summary class="concept-summary" title="${safeTerm}">
                        <span class="concept-term">${highlightedTerm}</span>
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
        listContainer.querySelectorAll('details').forEach(el => {
            el.ontoggle = (e) => {
                const term = el.dataset.term; // Browser decodes &lt; to <
                if (el.open) this.expandedStates.add(term);
                else this.expandedStates.delete(term);
            };
        });

        listContainer.querySelectorAll('.concept-summary').forEach(el => {
             el.onclick = (e) => {
                 // details.dataset.term is on the parent
                 const term = el.parentElement.dataset.term;
                 if (this.onSelect && term) this.onSelect(term);
             };
        });

        listContainer.querySelectorAll('.sub-task-item').forEach(el => {
            el.onclick = (e) => {
                e.stopPropagation(); // Don't collapse details
                const term = el.dataset.term;
                if (e.target.classList.contains('delete-task-btn')) {
                    const index = parseInt(el.dataset.index);
                    this.deleteTask(term, index);
                } else if (e.target.classList.contains('trace-task-btn')) {
                    if (this.onTrace) this.onTrace(term);
                } else {
                    // Also select on task click
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
