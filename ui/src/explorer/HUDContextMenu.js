export class HUDContextMenu {
    constructor(graph, app) {
        this.graph = graph;
        this.app = app;
        this.menuElement = null;
        this.isVisible = false;
        this.targetElement = null;

        this._createMenuElement();
        this._setupGlobalListeners();
    }

    _createMenuElement() {
        const menu = document.createElement('div');
        menu.id = 'hud-context-menu';
        menu.className = 'context-menu hud-panel hidden';
        document.body.appendChild(menu);
        this.menuElement = menu;
    }

    _setupGlobalListeners() {
        document.addEventListener('click', (e) => {
            if (!this.menuElement.contains(e.target)) this.hide();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) this.hide();
        });
    }

    show(x, y, element, type = 'node') {
        this.targetElement = element;
        this.isVisible = true;

        const items = type === 'node' ? this._getNodeMenuItems(element) :
                      type === 'edge' ? this._getEdgeMenuItems(element) :
                      this._getBackgroundMenuItems();

        this.menuElement.innerHTML = items.map(item => `
            <div class="context-menu-item" data-action="${item.action}">
                <span class="context-menu-icon">${item.icon}</span>
                <span class="context-menu-label">${item.label}</span>
            </div>
        `).join('');

        this._positionMenu(x, y);
        this.menuElement.classList.remove('hidden');

        // Animation
        this.menuElement.animate([
            { opacity: 0, transform: 'scaleY(0.5)' },
            { opacity: 1, transform: 'scaleY(1)' }
        ], { duration: 100, easing: 'ease-out' });

        this.menuElement.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                this._handleAction(item.dataset.action, element, type);
                this.hide();
            });
        });
    }

    hide() {
        this.isVisible = false;
        this.menuElement.classList.add('hidden');
        this.targetElement = null;
    }

    _positionMenu(x, y) {
        const {width, height} = this.menuElement.getBoundingClientRect();
        const {innerWidth: vw, innerHeight: vh} = window;

        // Ensure menu stays within viewport
        let left = x;
        let top = y;

        if (left + width > vw) left = vw - width - 10;
        if (top + height > vh) top = vh - height - 10;

        this.menuElement.style.left = `${left}px`;
        this.menuElement.style.top = `${top}px`;
    }

    _getNodeMenuItems(element) {
        const isPinned = element.locked();
        const baseItems = [
            {action: 'focus', icon: '🎯', label: 'Focus'},
            {action: 'inspect', icon: '🔍', label: 'Inspect'},
            {action: 'pin', icon: isPinned ? '🔓' : '📍', label: isPinned ? 'Unpin' : 'Pin Position'},
            {action: 'copy', icon: '📋', label: 'Copy Term'},
            {action: 'hide', icon: '👁️‍🗨️', label: 'Hide Node'}
        ];

        return element.data().type === 'task'
            ? [...baseItems, {action: 'query', icon: '❓', label: 'Query Truth'}]
            : baseItems;
    }

    _getEdgeMenuItems(element) {
        return [
            {action: 'inspect', icon: '🔍', label: 'Inspect'},
            {action: 'remove', icon: '🗑️', label: 'Remove'},
        ];
    }

    _getBackgroundMenuItems() {
        return [
            {action: 'add-concept', icon: '➕', label: 'Add Concept'},
            {action: 'layout', icon: '🕸️', label: 'Re-Layout'},
            {action: 'clear', icon: '🧹', label: 'Clear Graph'}
        ];
    }

    _handleAction(action, element, type) {
        const handler = this._getActionHandler(action, element, type);
        if (handler) {
            handler();
        } else {
            console.warn(`Unknown action: ${action}`);
        }
    }

    _getActionHandler(action, element, type) {
        switch (action) {
            case 'focus': return () => this._focusNode(element);
            case 'inspect': return () => this._inspectElement(element, type);
            case 'pin': return () => this._togglePin(element);
            case 'copy': return () => this._copyTerm(element.data());
            case 'query': return () => this._queryTerm(element.data());
            case 'hide': return () => this._hideElement(element);
            case 'remove': return () => this._removeElement(element);
            case 'add-concept': return () => this.app.handleAddConcept();
            case 'layout': return () => this.app.graph.scheduleLayout();
            case 'clear': return () => this.app.graph.clear();
            default: return null;
        }
    }

    _focusNode(element) {
        if (this.graph.highlightNode) {
            this.graph.highlightNode(element.id());
        }
        element.select();

        this.graph.cy.animate({
            center: {eles: element},
            zoom: 1.5,
            duration: 300
        });

        this.app.log(`Focused on: ${element.data('label')}`, 'system');
    }

    _inspectElement(element, type) {
        this.app.showInspector({
            id: element.id(),
            ...element.data()
        });
        this.app.log(`Inspecting ${type}: ${element.id()}`, 'system');
    }

    _togglePin(element) {
        if (element.locked()) {
            element.unlock();
            this.app.log('Node unlocked', 'system');
        } else {
            element.lock();
            this.app.log('Node pinned', 'system');
        }
    }

    _hideElement(element) {
        if (this.graph.removeNode) {
            this.graph.removeNode(element.id());
        } else {
            element.style('display', 'none');
        }
        this.app.log(`Hidden: ${element.id()}`, 'system');
    }

    _copyTerm(data) {
        const term = data.label ?? data.term ?? data.id;
        navigator.clipboard.writeText(term).then(() => {
            this.app.log(`Copied: ${term}`, 'system');
        });
    }

    _queryTerm(data) {
        const term = data.term || data.id;
        // Construct basic Narsese query: <term ?>?
        // Note: term should be wrapped if it's compound, but let's assume valid term string
        const query = `<${term} ?>?`;
        this.app.handleReplCommand(query);
        this.app.log(`Querying: ${query}`, 'system');
    }

    _removeElement(element) {
        if (element.isNode()) {
            if (this.graph.removeNode) {
                this.graph.removeNode(element.id());
            } else {
                element.remove();
            }
        } else {
            element.remove();
        }
        this.app.log('Element removed', 'system');
    }
}
