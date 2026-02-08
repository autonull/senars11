/**
 * ContextualWidget manages HTML overlays on graph nodes.
 */
export class ContextualWidget {
    constructor(graphSystem, container) {
        this.graph = graphSystem;
        this.container = container;
        this.activeWidgets = new Map(); // nodeId -> DOM element
        this.transformContainer = null;
        this.hoverFrame = null;
        this.hoveredNodeId = null;

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
            pointerEvents: 'none',
            transformOrigin: '0 0',
            zIndex: '5'
        });
        this.container.appendChild(this.transformContainer);

        this.hoverFrame = document.createElement('div');
        this.hoverFrame.className = 'zui-hover-frame';
        this.transformContainer.appendChild(this.hoverFrame);
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

        // Listen for node movement (dragging or layout) directly on cy instance
        const bindPositionListener = () => {
            if (this.graph.cy) {
                this.graph.cy.on('position', 'node', (e) => {
                    this.updateNodeWidget(e.target.id());
                });
            }
        };

        if (this.graph.cy) {
            bindPositionListener();
        } else {
            this.graph.on('ready', bindPositionListener);
        }
    }

    updateTransform(data) {
        if (!this.transformContainer || !this.graph.cy) return;
        const pan = this.graph.cy.pan();
        const zoom = this.graph.cy.zoom();
        this.transformContainer.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
        this.updateLOD(zoom);
    }

    updateLOD(zoom) {
        let lodClass = 'zui-lod-0';
        // LOD Thresholds:
        // < 0.4: Hidden (LOD 0)
        // 0.4 - 1.0: Header Only (LOD 1)
        // > 1.0: Full Content (LOD 2)
        // > 2.5: High Detail / Enhanced (LOD 3)
        if (zoom > 0.4) lodClass = 'zui-lod-1';
        if (zoom > 1.0) lodClass = 'zui-lod-2';
        if (zoom > 2.5) lodClass = 'zui-lod-3';

        if (this.currentLOD !== lodClass) {
            this.transformContainer.className = `zui-transform-layer ${lodClass}`;
            this.currentLOD = lodClass;
        }

        // Smooth opacity fade-in from 0.3 to 0.5
        let opacity = 1;
        if (zoom < 0.3) opacity = 0;
        else if (zoom < 0.5) opacity = (zoom - 0.3) / 0.2;

        this.transformContainer.style.opacity = opacity;
    }

    attach(nodeId, contentHtml) {
        if (this.activeWidgets.has(nodeId)) return;

        const div = document.createElement('div');
        div.className = 'zui-widget';
        Object.assign(div.style, {
            position: 'absolute',
            pointerEvents: 'auto', // Allow interaction
            transform: 'translate(-50%, calc(-100% - 20px))' // Center horizontally, place above node with gap
        });
        div.innerHTML = contentHtml;

        // Bind double-click to "Enter" node
        const header = div.querySelector('.zui-header');
        header?.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.graph.enterNode?.(nodeId);
        });

        this.transformContainer.appendChild(div);
        this.activeWidgets.set(nodeId, div);

        this.updateNodeWidget(nodeId);
    }

    attachTestWidget(nodeId) {
        const html = `
            <div class="zui-panel">
                <div class="zui-header">Editable Node</div>
                <div class="zui-content">
                    <input type="text" value="Fractal Widget" class="zui-input">
                    <div class="zui-controls">
                        <button class="zui-btn primary">Save</button>
                        <button class="zui-btn">Cancel</button>
                    </div>
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

        const div = this.activeWidgets.get(nodeId);
        if (!div) return;

        // Use Model Position (Fractal Space)
        const pos = node.position();
        div.style.left = `${pos.x}px`;
        div.style.top = `${pos.y}px`;

        // Calculate vertical offset to position above the node
        // node.outerHeight() returns the height in model coordinates (unscaled)
        const nodeHeight = node.outerHeight() || 30;
        const widgetHeight = div.offsetHeight || 0;
        const padding = 10;
        const offset = (nodeHeight / 2) + padding + widgetHeight;

        // Combine centering (-50% X) and lifting by total offset
        // We use pixel values instead of percentages to avoid issues with display:none layout
        div.style.transform = `translate(-50%, -${offset}px)`;
    }

    remove(nodeId) {
        const div = this.activeWidgets.get(nodeId);
        if (div) {
            div.remove();
            this.activeWidgets.delete(nodeId);
        }
    }

    showHoverFrame(node) {
        if (!this.hoverFrame) return;

        const pos = node.position();
        const width = node.width() || 30;
        const height = node.height() || 30;
        const padding = 20;

        // Position in model space
        Object.assign(this.hoverFrame.style, {
            display: 'block',
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            width: `${width + padding}px`,
            height: `${height + padding}px`,
            transform: 'translate(-50%, -50%)'
        });

        this.hoverFrame.classList.remove('active');
        // Force reflow
        void this.hoverFrame.offsetWidth;
        this.hoverFrame.classList.add('active');

        this.hoveredNodeId = node.id();
    }

    hideHoverFrame() {
        if (this.hoverFrame) {
            this.hoverFrame.style.display = 'none';
            this.hoverFrame.classList.remove('active');
        }
        this.hoveredNodeId = null;
    }

    clear() {
        this.activeWidgets.forEach(div => div.remove());
        this.activeWidgets.clear();
        if (this.hoverFrame) this.hoverFrame.style.display = 'none';
        // this.transformContainer.innerHTML = ''; // Also clears container
    }
}
