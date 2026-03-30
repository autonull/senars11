import { Component } from '../components/Component.js';
import { TaskCard } from '../components/TaskCard.js';
import { FluentUI, $ } from '../utils/FluentUI.js';
import { eventBus } from '../core/EventBus.js';
import { EVENTS } from '../config/constants.js';
import { NarseseHighlighter } from '../utils/NarseseHighlighter.js';

export class TaskBrowser extends Component {
    constructor(container) {
        super(container);
        this.concepts = new Map(); // Map<string, { term: string, tasks: Array }>
        this.filter = '';
        this.typeFilters = { belief: true, goal: true, question: true };
        this.expandedStates = new Set(); // Track expanded concepts
        this.renderPending = false;

        // Sorting & Pagination State
        this.sortMethod = 'priority'; // priority, recency, term
        this.sortOrder = 'desc'; // asc, desc
        this.currentPage = 1;
        this.itemsPerPage = 20;

        // We no longer rely on onSelect callback, we use EventBus
        // But for backward compatibility we keep the property
        this.onSelect = null;
    }

    addTask(task) {
        if (!task?.term) return;

        const term = task.term.toString();
        if (!this.concepts.has(term)) {
            this.concepts.set(term, { term, tasks: [] });
        }

        const { tasks } = this.concepts.get(term);
        const type = task.type || 'concept';
        const punctuation = task.punctuation || '.';

        const existingIndex = tasks.findIndex(t =>
            t.type === type &&
            t.punctuation === punctuation &&
            t.derivation?.rule === task.derivation?.rule
        );

        const entry = {
            term,
            type,
            punctuation,
            priority: task.budget?.priority ?? 0.5,
            truth: task.truth,
            derivation: task.derivation,
            timestamp: Date.now(),
            raw: task
        };

        if (existingIndex >= 0) {
            tasks[existingIndex] = { ...tasks[existingIndex], ...entry };
        } else {
            tasks.push(entry);
        }

        // Sort tasks within concept by priority always? Or reuse sort logic?
        // Usually sub-tasks are sorted by priority.
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
        this.currentPage = 1;
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

        // Using FluentUI to rebuild the container structure
        const root = $(this.container).clear();

        const panel = $('div').class('hud-panel', 'task-browser').mount(root);

        // Header
        const header = $('div').class('hud-header').mount(panel);
        $('h3').text('Tasks & Concepts').mount(header);

        // Toolbar: Search & Filters
        const toolbar1 = $('div').class('task-controls').mount(header);

        // Filter Toggles
        const toggles = $('div').class('filter-toggles').mount(toolbar1);
        const createToggle = (type, symbol, title) => {
            return $('button')
                .class('btn-toggle')
                .class(this.typeFilters[type] ? 'active' : '')
                .attr('title', title)
                .text(symbol)
                .on('click', (e) => {
                    this.typeFilters[type] = !this.typeFilters[type];
                    if (this.typeFilters[type]) $(e.target).addClass('active');
                    else $(e.target).removeClass('active');
                    this.currentPage = 1; // Reset page on filter change
                    this.renderList();
                });
        };
        createToggle('belief', '●', 'Toggle Beliefs').mount(toggles);
        createToggle('goal', '♦', 'Toggle Goals').mount(toggles);
        createToggle('question', '¿', 'Toggle Questions').mount(toggles);

        // Search Input
        $('input')
            .id('task-search')
            .attr('type', 'text')
            .attr('placeholder', 'Filter...')
            .class('control-input-small')
            .style({ width: '80px' })
            .on('input', (e) => {
                this.filter = e.target.value.toLowerCase();
                this.currentPage = 1;
                this.renderList();
            })
            .mount(toolbar1);

        // Clear Button
        $('button')
            .id('btn-clear-tasks')
            .class('btn', 'small-btn')
            .attr('title', 'Clear List')
            .text('🗑️')
            .on('click', () => this.clear())
            .mount(toolbar1);

        // Toolbar 2: Sort & Pagination
        const toolbar2 = $('div').class('task-toolbar', 'secondary-toolbar').mount(header);

        // Sort Dropdown
        const sortSelect = $('select')
            .class('sort-select', 'control-select-small')
            .on('change', (e) => this.handleSortChange(e.target.value))
            .mount(toolbar2);

        const sortOptions = [
            { value: 'priority-desc', label: 'Priority ↓' },
            { value: 'priority-asc', label: 'Priority ↑' },
            { value: 'recency-desc', label: 'Newest' },
            { value: 'recency-asc', label: 'Oldest' },
            { value: 'term-asc', label: 'A-Z' },
            { value: 'term-desc', label: 'Z-A' }
        ];

        sortOptions.forEach(opt => {
            $('option').attr('value', opt.value).text(opt.label).mount(sortSelect);
        });

        // Pagination Controls
        this.paginationControls = $('div').class('pagination-controls').mount(toolbar2);
        this.renderPaginationControls();

        // Task List Container
        this.taskListContainer = $('div')
            .id('task-list')
            .class('task-list')
            .style({ overflowY: 'auto', flex: '1' })
            .mount(panel);

        this.renderList();
    }

    handleSortChange(value) {
        const parts = value.split('-');
        this.sortMethod = parts[0];
        this.sortOrder = parts[1] || 'desc';
        this.renderList();
    }

    handlePageChange(delta) {
        this.currentPage += delta;
        if (this.currentPage < 1) this.currentPage = 1;
        this.renderList();
    }

    renderPaginationControls(totalPages = 1) {
        if (!this.paginationControls) return;

        this.paginationControls.clear();

        $('button')
            .class('btn-icon', 'small-btn')
            .text('◄')
            .prop('disabled', this.currentPage <= 1)
            .on('click', () => this.handlePageChange(-1))
            .mount(this.paginationControls);

        $('span')
            .class('page-info')
            .text(`${this.currentPage} / ${Math.max(1, totalPages)}`)
            .mount(this.paginationControls);

        $('button')
            .class('btn-icon', 'small-btn')
            .text('►')
            .prop('disabled', this.currentPage >= totalPages)
            .on('click', () => this.handlePageChange(1))
            .mount(this.paginationControls);
    }

    _isTypeVisible(t) {
        const type = t.type.toLowerCase();
        if (type.includes('goal')) return this.typeFilters.goal;
        if (type.includes('question') || type.includes('quest')) return this.typeFilters.question;
        return this.typeFilters.belief;
    }

    renderList() {
        if (!this.taskListContainer) return;
        this.taskListContainer.clear();

        // 1. Filter
        let filtered = Array.from(this.concepts.values())
            .map(c => ({
                ...c,
                visibleItems: c.tasks.map((t, i) => ({ task: t, index: i })).filter(({ task }) => this._isTypeVisible(task))
            }))
            .filter(c => c.visibleItems.length > 0 && c.term.toLowerCase().includes(this.filter));

        // 2. Sort
        filtered.sort((a, b) => {
            let valA, valB;

            if (this.sortMethod === 'priority') {
                valA = Math.max(...a.visibleItems.map(item => item.task.priority));
                valB = Math.max(...b.visibleItems.map(item => item.task.priority));
            } else if (this.sortMethod === 'recency') {
                // Assuming newer tasks are pushed last
                valA = Math.max(...a.visibleItems.map(item => item.task.timestamp || 0));
                valB = Math.max(...b.visibleItems.map(item => item.task.timestamp || 0));
            } else if (this.sortMethod === 'term') {
                valA = a.term;
                valB = b.term;
            }

            if (valA < valB) return this.sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return this.sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        // 3. Pagination
        const totalPages = Math.ceil(filtered.length / this.itemsPerPage);
        if (this.currentPage > totalPages && totalPages > 0) this.currentPage = totalPages;

        const start = (this.currentPage - 1) * this.itemsPerPage;
        const end = start + this.itemsPerPage;
        const sliced = filtered.slice(start, end);

        // Update UI
        this.renderPaginationControls(totalPages);

        if (sliced.length === 0) {
            $('div').class('empty-state').text(this.concepts.size === 0 ? 'No tasks yet' : 'No matches').mount(this.taskListContainer);
            return;
        }

        sliced.forEach(concept => this._renderConceptGroup(concept));
    }

    _renderConceptGroup(concept) {
        const { term, visibleItems } = concept;
        const maxPrio = Math.max(...visibleItems.map(item => item.task.priority));
        const prioClass = maxPrio > 0.8 ? 'high' : (maxPrio > 0.5 ? 'med' : 'low');

        const details = $('details').class('concept-group', prioClass);
        if (this.expandedStates.has(term)) details.attr('open', 'open');

        details.on('toggle', (e) => {
            if (e.target.open) this.expandedStates.add(term);
            else this.expandedStates.delete(term);
        });

        const summary = $('summary').class('concept-summary').attr('title', term).mount(details);
        $('span').class('concept-term').html(NarseseHighlighter.highlight(term)).mount(summary);
        $('span').class('concept-badge').text(visibleItems.length).mount(summary);

        summary.on('click', (e) => {
            // Only trigger selection if not toggling details (prevent conflict?)
            // Usually summary click toggles details. We might want a separate button for selection or handle carefully.
            // But ExplorerApp handles CONCEPT_SELECT.
            eventBus.emit(EVENTS.CONCEPT_SELECT, { id: term, term });
        });

        const tasksContainer = $('div').class('concept-tasks').mount(details);
        visibleItems.forEach(item => this._renderTaskItem(item, tasksContainer, term));

        details.mount(this.taskListContainer);
    }

    _renderTaskItem({ task, index }, container, term) {
        const wrapper = $('div').class('sub-task-wrapper').style({ position: 'relative' }).mount(container);
        const taskObj = task.raw || {
            term: task.term,
            type: task.type,
            truth: task.truth,
            budget: { priority: task.priority },
            punctuation: task.punctuation
        };

        new TaskCard(wrapper.dom, taskObj, { compact: true }).render();

        $('button')
            .class('btn-icon', 'delete-task-btn')
            .text('×')
            .attr('title', 'Delete Task')
            .style({ position: 'absolute', right: '5px', top: '5px', opacity: '0.5' })
            .on('click', (e) => {
                e.stopPropagation();
                this.deleteTask(term, index);
            })
            .mount(wrapper);
    }
}
