import { BagBuffer } from '../data/BagBuffer.js';

export class BagVisualizer {
    constructor(cy, createNodeConfig, calculateNodeWeight, updateWidget, scheduleLayout) {
        this._cy = cy;
        this._createNodeConfig = createNodeConfig;
        this._calculateNodeWeight = calculateNodeWeight;
        this._updateWidget = updateWidget;
        this._scheduleLayout = scheduleLayout;
        this.bag = null;
    }

    get cy() { return this._cy; }
    set cy(val) { this._cy = val; }

    initialize(capacity) {
        this.bag = new BagBuffer(capacity || 50);
    }

    processDecay(factor = 0.99, threshold = 0.05) {
        if (!this.bag) {return [];}
        const removed = this.bag.decay(factor, threshold);
        this._syncFromBag();
        return removed;
    }

    addNodeToBag(id, data) {
        if (!this.bag) {return false;}
        this.bag.add(id, data.budget?.priority || 0, data);
        this._syncFromBag();
        return true;
    }

    updateNodeInBag(id, data) {
        if (!this.bag) {return false;}
        if (this.bag.get(id)) {
            this.bag.add(id, data.budget?.priority || 0, data);
            this._syncFromBag();
            return true;
        }
        return false;
    }

    removeNodesFromBag(ids) {
        if (!this.bag || !Array.isArray(ids)) {return;}
        ids.forEach(id => this.bag.remove(id));
        this._syncFromBag();
    }

    clear() {
        this.bag?.clear();
    }

    _syncFromBag() {
        if (!this._cy || !this.bag) {return;}
        const visibleItems = this.bag.getAll();
        const visibleIds = new Set(visibleItems.map(i => i.id));
        const currentNodes = this._cy.nodes();

        this._cy.batch(() => {
            currentNodes.forEach(node => {
                if (!visibleIds.has(node.id())) {this._cy.remove(node);}
            });

            visibleItems.forEach(item => {
                const node = this._cy.getElementById(item.id);
                if (node.empty()) {
                    const config = this._createNodeConfig(item.data);
                    config.data.priority = item.priority;
                    this._cy.add(config);
                } else {
                    const {priority} = item;
                    const weight = this._calculateNodeWeight(priority, item.data.term);
                    if (node.data('weight') !== weight) {
                        node.data('weight', weight);
                        node.data('priority', priority);
                    }
                    node.data('fullData', item.data);
                }
                this._updateWidget(item.id, item.data);
            });
        });
        this._scheduleLayout();
    }
}
