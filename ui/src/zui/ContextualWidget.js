/**
 * ContextualWidget manages HTML overlays on graph nodes.
 */
export class ContextualWidget {
    constructor(graphSystem, container) {
        this.graph = graphSystem;
        this.container = container;
        this.activeWidgets = new Map(); // nodeId -> DOM element
        this.transformContainer = null;

        this._initContainer();
        this._setupListeners();
    }

    _initContainer() {
        this.transformContainer = document.createElement('div');
        this.transformContainer.className = 'zui-transform-layer';
        Object.assign(this.transformContainer.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none', // Allow clicks to pass through to graph
            transformOrigin: '0 0',
            zIndex: '5' // Low Z-Index to be above canvas but below HUD
        });
        this.container.appendChild(this.transformContainer);
    }

    _setupListeners() {
        this.graph.on('zoomLevelChange', (data) => {
            if (data.level === 'detail') {
                this.showWidgets();
            } else {
                this.hideWidgets();
            }
        });

        this.graph.on('viewport', (data) => {
             this.updateTransform(data);
        });

        // Listen for node movement (dragging or layout) directly on cy instance if available
        if (this.graph.cy) {
             this.graph.cy.on('position', 'node', (e) => {
                 this.updateNodeWidget(e.target.id());
             });
        }
    }

    updateTransform(data) {
        if (!this.transformContainer || !this.graph.cy) return;
        const pan = this.graph.cy.pan();
        const zoom = this.graph.cy.zoom();
        this.transformContainer.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
    }

    attach(nodeId, contentHtml) {
        if (this.activeWidgets.has(nodeId)) return;

        const div = document.createElement('div');
        div.className = 'zui-widget';
        Object.assign(div.style, {
            position: 'absolute',
            // display: 'none', // Managed by zoom level now?
            pointerEvents: 'auto', // Allow interaction with widget
            background: 'rgba(0,0,0,0.8)',
            color: '#fff',
            padding: '5px',
            borderRadius: '4px',
            fontSize: '10px',
            transform: 'translate(-50%, -150%)' // Center horizontally, place above node
        });
        div.innerHTML = contentHtml;

        this.transformContainer.appendChild(div);
        this.activeWidgets.set(nodeId, div);

        this.updateNodeWidget(nodeId);
    }

    attachTestWidget(nodeId) {
        const html = `
            <div style="background: #222; border: 1px solid #444; padding: 8px; border-radius: 4px; min-width: 150px;">
                <div style="margin-bottom: 5px; font-weight: bold; color: #00ff9d;">Editable Node</div>
                <input type="text" value="Fractal Widget" style="width: 100%; background: #111; border: 1px solid #555; color: #fff; padding: 4px;">
                <div style="display: flex; gap: 5px; margin-top: 5px;">
                    <button style="flex: 1; cursor: pointer;">Save</button>
                    <button style="flex: 1; cursor: pointer;">Cancel</button>
                </div>
            </div>
        `;
        this.attach(nodeId, html);
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
        // With CSS transforms, we only need to update if node *model* position changes,
        // not on every viewport pan/zoom.
        this.activeWidgets.forEach((div, nodeId) => {
            this.updateNodeWidget(nodeId);
        });
    }

    updateNodeWidget(nodeId) {
        const node = this.graph.cy?.getElementById(nodeId);
        if (!node?.length) return;

        // Use Model Position (Fractal Space)
        const pos = node.position();
        const div = this.activeWidgets.get(nodeId);

        div.style.left = `${pos.x}px`;
        div.style.top = `${pos.y}px`;
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
        // this.transformContainer.innerHTML = ''; // Also clears container
    }
}
