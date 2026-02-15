import { Component } from './Component.js';
import { ConceptCard } from './ConceptCard.js';
import { TaskCard } from './TaskCard.js';
import { FluentUI } from '../utils/FluentUI.js';
import { FluentToolbar } from './ui/FluentToolbar.js';
import { EVENTS } from '../config/constants.js';
import { ReactiveState } from '../core/ReactiveState.js';
import { eventBus } from '../core/EventBus.js';

export class MemoryInspector extends Component {
    constructor(container) {
        super(container);

        this.state = new ReactiveState({
            data: [],
            sortField: 'priority',
            sortDirection: 'desc',
            filterText: '',
            filters: { hasGoals: false, hasQuestions: false },
            listMode: 'compact',
            viewMode: 'list',
            selectedConcept: null,
            limit: 50
        });

        // Computed filtered and sorted data
        this.state.computed('filteredData', function() {
            const { data, filterText, filters, sortField, sortDirection } = this;

            const filtered = data.filter(c =>
                (!filterText || c.term.toLowerCase().includes(filterText)) &&
                (!filters.hasGoals || c.tasks?.some(t => t.punctuation === '!')) &&
                (!filters.hasQuestions || c.tasks?.some(t => t.punctuation === '?'))
            );

            return filtered.sort((a, b) => {
                const valA = MemoryInspector.getValue(a, sortField);
                const valB = MemoryInspector.getValue(b, sortField);
                return (valA < valB ? -1 : 1) * (sortDirection === 'asc' ? 1 : -1);
            });
        });

        // Watchers
        this.state.watch('filteredData', () => this.viewMode === 'list' && this._renderListView());
        this.state.watch('viewMode', (mode) => this.render());
        this.state.watch('selectedConcept', (concept) => {
            if (concept) {
                this.state.viewMode = 'details';
            }
        });
        this.state.watch('listMode', () => this.viewMode === 'list' && this._renderListView());

        // Events
        eventBus.on(EVENTS.CONCEPT_SELECT, (payload) => {
            if (payload?.concept) this.selectConcept(payload.concept);
        });
    }

    // Getters for compatibility if needed, though mostly used internally
    get viewMode() { return this.state.viewMode; }
    set viewMode(v) { this.state.viewMode = v; }

    static getValue(obj, field) {
        if (field === 'priority') return obj.budget?.priority ?? 0;
        if (field === 'taskCount') return obj.tasks?.length ?? obj.taskCount ?? 0;
        if (field === 'term') return obj.term ?? '';
        return obj[field];
    }

    initialize() {
        if (!this.container) return;

        this.fluent().clear().class('mi-container');

        // Render Toolbar
        const toolbarContainer = FluentUI.create('div').class('mi-toolbar');
        this.container.appendChild(toolbarContainer.dom);

        new FluentToolbar(toolbarContainer.dom, this.getToolbarConfig()).render();
        this.toolbar = toolbarContainer.dom;

        // Render Content Container
        this.contentContainer = FluentUI.create('div')
            .id('mi-content')
            .class('mi-content-container')
            .mount(this.container)
            .dom;

        // Initial render
        this.render();
    }

    getToolbarConfig() {
        return [
            this._getFilterControls(),
            this._getSortControls()
        ];
    }

    _getFilterControls() {
        return {
            type: 'group',
            class: 'mi-filter-row',
            items: [
                {
                    type: 'custom',
                    renderer: () => FluentUI.create('input')
                        .attr({ type: 'text', placeholder: 'Filter terms...', id: 'mi-filter-text' })
                        .class('mi-filter-input')
                        .on('input', (e) => {
                            this.state.filterText = e.target.value.toLowerCase();
                        }).dom
                },
                {
                    type: 'button',
                    label: 'REFRESH',
                    class: 'mi-refresh-btn',
                    onClick: () => eventBus.emit(EVENTS.MEMORY_REFRESH)
                }
            ]
        };
    }

    _getSortControls() {
        return {
            type: 'group',
            class: 'mi-filter-row',
            items: [
                {
                    type: 'toggle',
                    label: 'Has Goals',
                    class: 'mi-checkbox-label',
                    onChange: (checked) => {
                        this.state.filters = { ...this.state.filters, hasGoals: checked };
                    }
                },
                {
                    type: 'toggle',
                    label: 'Has Questions',
                    class: 'mi-checkbox-label',
                    onChange: (checked) => {
                        this.state.filters = { ...this.state.filters, hasQuestions: checked };
                    }
                },
                {
                    type: 'toggle',
                    label: 'Compact',
                    checked: true,
                    class: 'mi-checkbox-label',
                    style: { marginLeft: '8px' },
                    onChange: (checked) => {
                        this.state.listMode = checked ? 'compact' : 'full';
                    }
                },
                {
                    type: 'select',
                    style: { marginLeft: 'auto', fontSize: '10px', padding: '2px' },
                    options: [
                        { value: 'priority', label: 'Priority' },
                        { value: 'term', label: 'Term' },
                        { value: 'taskCount', label: 'Task Count' }
                    ],
                    onChange: (val) => {
                        this.state.sortField = val;
                    }
                }
            ]
        };
    }

    update(payload) {
        if (!payload?.concepts) return;
        this.state.data = payload.concepts;

        if (this.state.selectedConcept) {
             const updated = this.state.data.find(c => c.id === this.state.selectedConcept.id || c.term === this.state.selectedConcept.term);
             if (updated) this.state.selectedConcept = updated;
        }
    }

    selectConcept(concept) {
        this.state.selectedConcept = concept;
    }

    focusFilter() {
        // Bring container to front if possible (GoldenLayout dependent)
        if (this.glContainer && this.glContainer.parent && this.glContainer.parent.parent) {
             try {
                 // The parent is usually a Stack
                 this.glContainer.parent.parent.setActiveContentItem(this.glContainer.parent);
             } catch(e) { console.warn('Failed to focus tab', e); }
        }

        const input = this.toolbar?.querySelector('input');
        if (input) {
            input.focus();
            input.select();
        }
    }

    render() {
        if (!this.contentContainer) return;
        this.contentContainer.innerHTML = '';
        this.toolbar.style.display = this.state.viewMode === 'list' ? 'flex' : 'none';

        if (this.state.viewMode === 'list') {
            this._renderListView();
        } else {
            this._renderDetailsView();
        }
    }

    _renderListView() {
        if (!this.contentContainer) return;
        this.contentContainer.innerHTML = '';

        const listDiv = FluentUI.create('div').class('mi-list').mount(this.contentContainer);
        const filtered = this.state.filteredData;

        if (filtered.length === 0) {
            listDiv.html('<div style="padding:10px; color:var(--text-muted); text-align:center;">No concepts found</div>');
            return;
        }

        this._renderListItems(listDiv, filtered);
    }

    _renderListItems(container, data) {
        const limit = this.state.limit;
        const isCompact = this.state.listMode === 'compact';

        for (const concept of data.slice(0, limit)) {
            new ConceptCard(container.dom, concept, { compact: isCompact }).render();
        }

        if (data.length > limit) {
            container.child(this._createLoadMoreButton(data.length - limit));
        }
    }

    _createLoadMoreButton(remaining) {
        return FluentUI.create('button')
            .text(`Load More (${remaining} remaining)`)
            .class('mi-load-more-btn')
            .style({
                display: 'block', margin: '10px auto', padding: '5px 10px',
                background: '#333', border: '1px solid #444', color: '#ccc', cursor: 'pointer'
            })
            .on('click', () => {
                this.state.limit += 50;
                this._renderListView();
            });
    }

    _renderDetailsView() {
        const container = FluentUI.create('div').class('mi-details').mount(this.contentContainer);

        this._createDetailsHeader().mount(container);

        const content = FluentUI.create('div').class('mi-details-content').mount(container);

        if (this.state.selectedConcept) {
             this._renderConceptDetails(content);
        }
    }

    _createDetailsHeader() {
        return FluentUI.create('div')
            .class('mi-details-header')
            .child(
                FluentUI.create('button')
                    .html('← Back')
                    .class('mi-back-btn')
                    .on('click', () => {
                        this.state.viewMode = 'list';
                        this.state.selectedConcept = null;
                    })
            )
            .child(
                FluentUI.create('div')
                    .class('mi-details-title')
                    .text(this.state.selectedConcept?.term ?? 'Concept Details')
            );
    }

    _renderConceptDetails(container) {
        const wrapper = FluentUI.create('div').style({ marginBottom: '20px' }).mount(container);
        new ConceptCard(wrapper.dom, this.state.selectedConcept).render();

        container.child(
            FluentUI.create('div')
                .text('TASKS')
                .class('mi-section-header')
        );

        if (this.state.selectedConcept.tasks?.length > 0) {
            this.state.selectedConcept.tasks.forEach(task => new TaskCard(container.dom, task).render());
        } else {
            container.child(
                FluentUI.create('div')
                    .text('No tasks in memory view.')
                    .style({ color: 'var(--text-muted)' })
            );
        }
    }
}
