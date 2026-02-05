/**
 * ContextualWidget manages HTML overlays on graph nodes.
 */
export class ContextualWidget {
    constructor(graphSystem, container) {
        this.graph = graphSystem;
        this.container = container;
        this.activeWidgets = new Map(); // nodeId -> DOM element

        this._setupListeners();
    }

    _setupListeners() {
        this.graph.on('zoomLevelChange', (data) => {
            if (data.level === 'detail') {
                this.showWidgets();
            } else {
                this.hideWidgets();
            }
        });

        this.graph.on('viewport', () => {
             this.updatePositions();
        });

        // Clean up widgets when nodes are removed
        // We might need to listen to a node removal event if graph supports it
    }

    attach(nodeId, contentHtml) {
        if (this.activeWidgets.has(nodeId)) return;

        const div = document.createElement('div');
        div.className = 'zui-widget';
        Object.assign(div.style, {
            position: 'absolute',
            display: 'none',
            pointerEvents: 'none',
            background: 'rgba(0,0,0,0.8)',
            color: '#fff',
            padding: '5px',
            borderRadius: '4px',
            fontSize: '10px',
            zIndex: '1000'
        });
        div.innerHTML = contentHtml;

        this.container.appendChild(div);
        this.activeWidgets.set(nodeId, div);

        this.updateNodeWidget(nodeId);
    }

    showWidgets() {
        this.activeWidgets.forEach((div, nodeId) => {
             div.style.display = 'block';
             this.updateNodeWidget(nodeId);
        });
    }

    hideWidgets() {
        this.activeWidgets.forEach(div => div.style.display = 'none');
    }

    updatePositions() {
        if (!this.graph.cy) return;

        this.activeWidgets.forEach((div, nodeId) => {
            if (div.style.display !== 'none') {
                this.updateNodeWidget(nodeId);
            }
        });
    }

    updateNodeWidget(nodeId) {
        const node = this.graph.cy?.getElementById(nodeId);
        if (!node?.length) return;

        const pos = node.renderedPosition();
        const div = this.activeWidgets.get(nodeId);

        div.style.left = `${pos.x + 10}px`;
        div.style.top = `${pos.y - 20}px`;
    }

    remove(nodeId) {
        const div = this.activeWidgets.get(nodeId);
        if (div) {
            div.remove();
            this.activeWidgets.delete(nodeId);
        }
    }

    clear() {
        this.activeWidgets.forEach(div => div.remove());
        this.activeWidgets.clear();
    }
}
