export class ContextMenu {
    constructor(graphManager, commandProcessor) {
        this.graphManager = graphManager;
        this.commandProcessor = commandProcessor;
        this.menuElement = null;
        this.isVisible = false;
        this.targetElement = null;

        this._createMenuElement();
        this._setupGlobalListeners();
    }

    _createMenuElement() {
        const menu = document.createElement('div');
        menu.id = 'context-menu';
        menu.className = 'context-menu hidden';
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

        const items = type === 'node' ? this._getNodeMenuItems(element) : this._getEdgeMenuItems(element);

        this.menuElement.innerHTML = items.map(item => `
            <div class="context-menu-item" data-action="${item.action}">
                <span class="context-menu-icon">${item.icon}</span>
                <span class="context-menu-label">${item.label}</span>
            </div>
        `).join('');

        this._positionMenu(x, y);
        this.menuElement.classList.remove('hidden');

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

        this.menuElement.style.left = `${Math.min(x, vw - width - 10)}px`;
        this.menuElement.style.top = `${Math.min(y, vh - height - 10)}px`;
    }

    _getNodeMenuItems(element) {
        const isPinned = element.locked();
        const baseItems = [
            {action: 'focus', icon: '🎯', label: 'Focus'},
            {action: 'inspect', icon: '🔍', label: 'Inspect'},
            {action: 'expand', icon: '🔗', label: 'Expand Relations'},
            {action: 'pin', icon: isPinned ? '🔓' : '📍', label: isPinned ? 'Unpin' : 'Pin Position'},
            {action: 'copy', icon: '📋', label: 'Copy Term'},
            {action: 'hide', icon: '👁️‍🗨️', label: 'Hide Node'}
        ];

        return element.data().type === 'task'
            ? [...baseItems, {action: 'execute', icon: '▶️', label: 'Execute Task'}]
            : baseItems;
    }

    _getEdgeMenuItems() {
        return [
            {action: 'inspect', icon: '🔍', label: 'Inspect'},
            {action: 'remove', icon: '🗑️', label: 'Remove'},
        ];
    }

    _handleAction(action, element, type) {
        const actions = {
            focus: () => this._focusNode(element),
            inspect: () => this._inspectElement(element, type),
            expand: () => this._expandRelations(element),
            pin: () => this._togglePin(element),
            copy: () => this._copyTerm(element.data()),
            execute: () => this._executeTask(element.data()),
            hide: () => this._hideElement(element),
            remove: () => this._removeEdge(element)
        };

        actions[action]?.();
    }

    _focusNode(element) {
        this.graphManager.animateGlow(element.id(), 1.0);
        element.select();

        this.graphManager.cy.animate({
            center: {eles: element},
            zoom: 2,
            duration: 300
        });

        this.commandProcessor.logger.log(`Focused on: ${element.data('label')}`, 'info', '🎯');
    }

    _inspectElement(element, type) {
        const data = element.data();
        // Since we don't have updateGraphDetails fully implemented in GraphManager yet in this context,
        // we mainly rely on the select event to trigger MemoryInspector
        if (data.fullData) {
            document.dispatchEvent(new CustomEvent('senars:concept:select', {
                detail: { concept: data.fullData, id: data.id }
            }));
        }
        this.commandProcessor.logger.log(`Inspecting ${type}: ${data.label ?? data.id}`, 'info', '🔍');
    }

    _expandRelations(element) {
        element.connectedEdges().connectedNodes().forEach(node => {
            this.graphManager.animateFadeIn(node.id());
        });
        this.commandProcessor.logger.log(`Expanded relations for: ${element.data('label')}`, 'info', '🔗');
    }

    _togglePin(element) {
        if (element.locked()) {
            element.unlock();
            this.commandProcessor.logger.log('Node unlocked', 'info', '🔓');
        } else {
            element.lock();
            this.commandProcessor.logger.log('Node pinned', 'info', '📍');
        }
    }

    _hideElement(element) {
        element.style('display', 'none');
    }

    _copyTerm(data) {
        const term = data.label ?? data.term ?? data.id;
        navigator.clipboard.writeText(term).then(() => {
            this.commandProcessor.logger.log(`Copied: ${term}`, 'success', '📋');
        });
    }

    _executeTask(data) {
        this.commandProcessor.processCommand(`*execute ${data.id}`, false, 'narsese');
        this.commandProcessor.logger.log(`Executing task: ${data.label}`, 'info', '▶️');
    }

    _removeEdge(element) {
        element.remove();
        this.commandProcessor.logger.log('Edge removed', 'info', '🗑️');
    }

    destroy() {
        this.menuElement?.parentElement?.removeChild(this.menuElement);
    }
}
