import { Component } from '../components/Component.js';
import { button, div } from '../utils/FluentUI.js';

export class ExplorerToolbar extends Component {
    constructor(app) {
        super();
        this.app = app;
        this.container = document.createElement('div');
        this.container.classList.add('control-toolbar');
    }

    render() {
        this.fluent().class('control-toolbar').clear();

        const btn = (icon, title, action, className = '') => {
            button(icon)
                .class('btn')
                .addClass(className)
                .attr('title', title)
                .on('click', (e) => {
                    e.stopPropagation(); // Prevent canvas clicks
                    action(e);
                })
                .mount(this.container);
        };

        const divider = () => div().class('divider').mount(this.container);

        // Navigation
        btn('⤢', 'Fit View (F)', () => this.app.graph.fit());
        btn('+', 'Zoom In (+)', () => this.app.graph.zoomIn());
        btn('-', 'Zoom Out (-)', () => this.app.graph.zoomOut());
        btn('🕸️', 'Recalculate Layout (L)', () => this.app.graph.scheduleLayout());

        divider();

        // Editing
        btn('➕ Node', 'Add Concept (A)', () => this.app.handleAddConcept());
        btn('🔗 Link', 'Link Selected Nodes', () => this.app.handleAddLink());
        btn('🗑️', 'Delete Selected (Del)', () => this.app.handleDelete(), 'warning-btn');

        divider();

        // Reasoner Controls
        const playBtn = button('▶').class('btn').attr('title', 'Run/Pause Reasoner (Space)')
            .on('click', (e) => {
                e.stopPropagation();
                const isRunning = !this.app.isReasonerRunning;
                this.app.toggleReasoner(isRunning);
                // Visual update happens via event
            }).mount(this.container);

        // Bind to event for state updates
        this.app.eventBus?.on('reasoner.state', (running) => {
             playBtn.text(running ? '⏸' : '▶');
             playBtn.dom.classList.toggle('active', running);
        });

        // Initial state
        if (this.app.isReasonerRunning) {
            playBtn.text('⏸');
            playBtn.addClass('active');
        }

        btn('⏭', 'Step Reasoner (S)', () => this.app.stepReasoner());

        divider();

        // Shortcuts
        btn('?', 'Keyboard Shortcuts', () => {
             import('../components/ShortcutsModal.js').then(({ ShortcutsModal }) => {
                 new ShortcutsModal().show();
             });
        });
    }
}
