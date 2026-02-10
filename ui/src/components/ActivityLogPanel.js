import {Component} from './Component.js';
// Import directly to avoid dragging in Node.js dependencies from agent index
import {ActionRegistry} from '@senars/agent/src/app/model/ActionRegistry.js';
import {ActivityViewModel} from '@senars/agent/src/app/model/ActivityViewModel.js';

export class ActivityLogPanel extends Component {
    constructor(containerId) {
        super(containerId);
        this.activities = [];
        this.maxActivities = 50;
        this.filterTerm = '';
        this.contentContainer = null;
    }

    addActivity(activity) {
        if (!activity) return;

        // Use shared ViewModel logic
        const formatted = ActivityViewModel.format(activity);

        // Check duplication
        if (this.activities.length > 0 && this.activities[0].id === formatted.id) {
            return;
        }

        this.activities.unshift(formatted);

        if (this.activities.length > this.maxActivities) {
            this.activities.pop();
        }

        this.renderList();
    }

    clear() {
        this.activities = [];
        this.renderList();
    }

    render() {
        if (!this.container) return;

        // One-time setup of structure
        if (!this.contentContainer) {
            this.container.innerHTML = '';
            this.container.style.display = 'flex';
            this.container.style.flexDirection = 'column';

            // Filter Header
            const header = document.createElement('div');
            header.style.padding = '8px';
            header.style.borderBottom = '1px solid #333';
            header.style.backgroundColor = '#252526';

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Filter activities...';
            input.style.width = '100%';
            input.style.padding = '6px';
            input.style.backgroundColor = '#1e1e1e';
            input.style.border = '1px solid #3c3c3c';
            input.style.color = '#dcdcdc';
            input.style.borderRadius = '4px';
            input.style.fontFamily = 'monospace';

            input.addEventListener('input', (e) => {
                this.filterTerm = e.target.value.toLowerCase();
                this.renderList();
            });

            header.appendChild(input);
            this.container.appendChild(header);

            // List Container
            this.contentContainer = document.createElement('div');
            this.contentContainer.className = 'trace-list';
            this.contentContainer.style.flex = '1';
            this.contentContainer.style.overflowY = 'auto';
            this.contentContainer.style.fontFamily = 'monospace';
            this.container.appendChild(this.contentContainer);
        }

        this.renderList();
    }

    renderList() {
        if (!this.contentContainer) return;

        const filtered = this.activities.filter(act => {
            if (!this.filterTerm) return true;
            return (act.title && act.title.toLowerCase().includes(this.filterTerm)) ||
                (act.subtitle && act.subtitle.toLowerCase().includes(this.filterTerm));
        });

        if (filtered.length === 0) {
            this.contentContainer.innerHTML = '<div class="empty-state">No activities</div>';
            return;
        }

        this.contentContainer.innerHTML = '';

        filtered.forEach(act => {
            const el = this.createActivityElement(act);
            this.contentContainer.appendChild(el);
        });
    }

    createActivityElement(act) {
        const item = document.createElement('div');
        item.className = 'trace-item';
        item.style.padding = '8px';
        item.style.borderBottom = '1px solid #333';
        item.style.borderLeft = `3px solid ${act.color || 'gray'}`;

        const time = new Date(act.timestamp).toLocaleTimeString();

        // Header
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.marginBottom = '4px';
        header.style.fontSize = '0.85em';
        header.style.color = '#888';
        header.innerHTML = `<span>${act.icon || ''} ${act.title}</span> <span>${time}</span>`;
        item.appendChild(header);

        // Content
        const content = document.createElement('div');
        content.style.fontSize = '0.95em';
        content.textContent = act.subtitle;
        item.appendChild(content);

        // Details (Progressive Disclosure)
        if (act.details) {
            const details = document.createElement('details');
            details.style.fontSize = '0.8em';
            details.style.color = '#666';
            details.style.marginTop = '2px';

            const summary = document.createElement('summary');
            summary.textContent = 'Details';
            summary.style.cursor = 'pointer';
            summary.style.userSelect = 'none';

            const p = document.createElement('pre');
            p.style.margin = '4px 0 0 10px';
            p.style.whiteSpace = 'pre-wrap';
            p.style.fontFamily = 'monospace';
            p.textContent = act.details;

            details.appendChild(summary);
            details.appendChild(p);
            item.appendChild(details);
        }

        // Actions
        const actions = ActionRegistry.getActionsForActivity(act.raw);
        if (actions.length > 0) {
            const actionbar = document.createElement('div');
            actionbar.style.marginTop = '6px';
            actionbar.style.display = 'flex';
            actionbar.style.gap = '8px';

            actions.forEach(actionDef => {
                const btn = document.createElement('button');
                btn.textContent = `${actionDef.icon || ''} ${actionDef.label}`;
                btn.style.padding = '2px 6px';
                btn.style.fontSize = '0.8em';
                btn.style.cursor = 'pointer';
                btn.style.backgroundColor = '#333';
                btn.style.border = '1px solid #444';
                btn.style.color = '#ccc';
                btn.style.borderRadius = '3px';

                btn.onclick = (e) => {
                    e.stopPropagation();
                    this.dispatchAction(actionDef, act);
                };

                actionbar.appendChild(btn);
            });
            item.appendChild(actionbar);
        }

        return item;
    }

    dispatchAction(actionDef, activityViewModel) {
        console.log('Dispatching action:', actionDef.id);
        const event = new CustomEvent('senars:action', {
            detail: {
                type: actionDef.type,
                payload: actionDef.payload,
                context: {
                    activityId: activityViewModel.id,
                    rawActivity: activityViewModel.raw
                }
            }
        });
        document.dispatchEvent(event);
    }
}
