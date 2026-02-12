import { Component } from './Component.js';
import { ConceptCard } from './ConceptCard.js';
import { TaskCard } from './TaskCard.js';
import { FluentUI } from '../utils/FluentUI.js';
import { FluentToolbar } from './ui/FluentToolbar.js';
import { EVENTS } from '../config/constants.js';

export class MemoryInspector extends Component {
    constructor(container) {
        super(container);
        this.data = [];
        this.sortField = 'priority';
        this.sortDirection = 'desc';
        this.filterText = '';
        this.filters = { hasGoals: false, hasQuestions: false };
        this.listMode = 'compact'; // 'compact' or 'full'
        this.viewMode = 'list';
        this.selectedConcept = null;

        document.addEventListener(EVENTS.CONCEPT_SELECT, (e) => {
            e.detail?.concept && this.selectConcept(e.detail.concept);
        });
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

        this.render();
    }

    getToolbarConfig() {
        return [
            {
                type: 'group',
                class: 'mi-filter-row',
                items: [
                    {
                        type: 'custom',
                        renderer: () => FluentUI.create('input')
                            .attr({ type: 'text', placeholder: 'Filter terms...', id: 'mi-filter-text' })
                            .class('mi-filter-input')
                            .on('input', (e) => {
                                this.filterText = e.target.value.toLowerCase();
                                this.render();
                            }).dom
                    },
                    {
                        type: 'button',
                        label: 'REFRESH',
                        class: 'mi-refresh-btn',
                        onClick: () => document.dispatchEvent(new CustomEvent('senars:memory:refresh'))
                    }
                ]
            },
            {
                type: 'group',
                class: 'mi-filter-row',
                items: [
                    {
                        type: 'toggle',
                        label: 'Has Goals',
                        class: 'mi-checkbox-label',
                        onChange: (checked) => {
                            this.filters.hasGoals = checked;
                            this.render();
                        }
                    },
                    {
                        type: 'toggle',
                        label: 'Has Questions',
                        class: 'mi-checkbox-label',
                        onChange: (checked) => {
                            this.filters.hasQuestions = checked;
                            this.render();
                        }
                    },
                    {
                        type: 'toggle',
                        label: 'Compact',
                        checked: true,
                        class: 'mi-checkbox-label',
                        style: { marginLeft: '8px' },
                        onChange: (checked) => {
                            this.listMode = checked ? 'compact' : 'full';
                            this.render();
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
                            this.sortField = val;
                            this.render();
                        }
                    }
                ]
            }
        ];
    }

    update(payload) {
        if (!payload?.concepts) return;
        this.data = payload.concepts;

        if (this.selectedConcept) {
             const updated = this.data.find(c => c.id === this.selectedConcept.id || c.term === this.selectedConcept.term);
             if (updated) this.selectedConcept = updated;
        }

        this.render();
    }

    selectConcept(concept) {
        this.selectedConcept = concept;
        this.viewMode = 'details';
        this.render();
    }

    render() {
        if (!this.contentContainer) return;
        this.contentContainer.innerHTML = '';
        this.toolbar.style.display = this.viewMode === 'list' ? 'flex' : 'none';

        if (this.viewMode === 'list') {
            this._renderListView();
        } else {
            this._renderDetailsView();
        }
    }

    _renderListView() {
        const listDiv = FluentUI.create('div').class('mi-list').mount(this.contentContainer);

        const filtered = this._filterAndSortData();

        if (filtered.length === 0) {
            listDiv.html('<div style="padding:10px; color:var(--text-muted); text-align:center;">No concepts found</div>');
        } else {
            const limit = 50;
            const isCompact = this.listMode === 'compact';

            for (const concept of filtered.slice(0, limit)) {
                new ConceptCard(listDiv.dom, concept, { compact: isCompact }).render();
            }

            if (filtered.length > limit) {
                listDiv.child(
                    FluentUI.create('div')
                        .text(`...and ${filtered.length - limit} more`)
                        .style({ padding: '10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '10px' })
                );
            }
        }
    }

    _renderDetailsView() {
        const container = FluentUI.create('div').class('mi-details').mount(this.contentContainer);

        this._createDetailsHeader().mount(container);

        const content = FluentUI.create('div').class('mi-details-content').mount(container);

        if (this.selectedConcept) {
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
                        this.viewMode = 'list';
                        this.selectedConcept = null;
                        this.render();
                    })
            )
            .child(
                FluentUI.create('div')
                    .class('mi-details-title')
                    .text(this.selectedConcept?.term ?? 'Concept Details')
            );
    }

    _renderConceptDetails(container) {
        const wrapper = FluentUI.create('div').style({ marginBottom: '20px' }).mount(container);
        new ConceptCard(wrapper.dom, this.selectedConcept).render();

        container.child(
            FluentUI.create('div')
                .text('TASKS')
                .class('mi-section-header')
        );

        if (this.selectedConcept.tasks?.length > 0) {
            this.selectedConcept.tasks.forEach(task => new TaskCard(container.dom, task).render());
        } else {
            container.child(
                FluentUI.create('div')
                    .text('No tasks in memory view.')
                    .style({ color: 'var(--text-muted)' })
            );
        }
    }

    _filterAndSortData() {
        return this.data.filter(c =>
            (!this.filterText || c.term.toLowerCase().includes(this.filterText)) &&
            (!this.filters.hasGoals || c.tasks?.some(t => t.punctuation === '!')) &&
            (!this.filters.hasQuestions || c.tasks?.some(t => t.punctuation === '?'))
        ).sort((a, b) => {
            const valA = this._getValue(a, this.sortField);
            const valB = this._getValue(b, this.sortField);
            return (valA < valB ? -1 : 1) * (this.sortDirection === 'asc' ? 1 : -1);
        });
    }

    _getValue(obj, field) {
        if (field === 'priority') return obj.budget?.priority ?? 0;
        if (field === 'taskCount') return obj.tasks?.length ?? obj.taskCount ?? 0;
        if (field === 'term') return obj.term ?? '';
        return obj[field];
    }
}
