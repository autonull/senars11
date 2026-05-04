import { Config } from '../config/Config.js';

export class GraphRenderer {
    constructor(cy, autoLearner) {
        this._cy = cy;
        this._autoLearner = autoLearner;
        this._layoutTimeout = null;
        this.currentLayout = 'fcose';
    }

    get cy() { return this._cy; }
    set cy(val) { this._cy = val; }

    setLayout(name) {
        if (!this._cy) {return;}
        this.currentLayout = name;
        return Config.getGraphLayout(name);
    }

    applyScatterLayout(xAxis = 'priority', yAxis = 'confidence') {
        if (!this._cy) {return;}
        this.currentLayout = 'scatter';
        const nodes = this._cy.nodes();
        const width = this._cy.width() * 0.8;
        const height = this._cy.height() * 0.8;

        const getVal = (node, axis) => {
            const data = node.data('fullData') || {};
            const truth = data.truth || {};
            const budget = data.budget || {};
            return {
                'priority': budget.priority || 0,
                'durability': budget.durability || 0,
                'quality': budget.quality || 0,
                'frequency': truth.frequency || 0,
                'confidence': truth.confidence || 0,
                'taskCount': Math.min((data.tasks?.length || 0) / 20, 1)
            }[axis] ?? 0;
        };

        nodes.forEach(node => {
            node.position({
                x: (getVal(node, xAxis) - 0.5) * width,
                y: -(getVal(node, yAxis) - 0.5) * height
            });
        });
    }

    applySortedGridLayout(sortField = 'priority') {
        if (!this._cy) {return;}
        this.currentLayout = 'sorted-grid';
        const nodes = this._cy.nodes().sort((a, b) => {
            const d = n => n.data('fullData') || {};
            const val = n => sortField === 'priority' ? d(n).budget?.priority || 0 : sortField === 'term' ? n.id() : 0;
            return val(b) - val(a);
        });
        nodes.layout({ name: 'grid', avoidOverlap: true, padding: 30 }).run();
    }

    scheduleLayout(runLayoutFn) {
        if (this._layoutTimeout) {clearTimeout(this._layoutTimeout);}
        this._layoutTimeout = setTimeout(() => {
            if (this._cy && this.currentLayout !== 'scatter' && this.currentLayout !== 'sorted-grid') {
                const baseOpts = Config.getGraphLayout(this.currentLayout || 'fcose');
                runLayoutFn({
                    ...baseOpts,
                    randomize: false,
                    animate: true,
                    fit: false,
                    animationDuration: 800,
                    animationEasing: 'ease-out-cubic'
                });
            }
        }, 500);
    }

    updateStyle() {
        this._cy?.style(Config.getGraphStyle());
    }

    animateUpdate(nodeId) {
        const node = this._cy?.getElementById(nodeId);
        if (!node?.length) {return;}
        node.animation({
            style: { 'border-width': 6, 'border-color': '#00ff9d' },
            duration: 100
        }).play().promise().then(() => {
            node.animation({ style: { 'border-width': 2 }, duration: 300 }).play();
        });
    }

    animateReasoning(sourceId, targetId, derivedId, ruleType = 'Inference', visSettings) {
        if (!this._cy || !visSettings.showDerivations) {return;}
        const duration = 1000 / (visSettings.edgeSpeed || 1);
        const color = visSettings.colorCodeRules
            ? (visSettings.inferenceTypeColors[ruleType] || visSettings.inferenceTypeColors['Inference'])
            : '#FFaa00';

        const nodes = [sourceId, targetId].filter(id => id).map(id => this._cy.getElementById(id));
        const foundNodes = nodes.filter(n => n.nonempty());

        foundNodes.forEach(node => {
            if (visSettings.colorCodeRules) {
                node.animate({
                    style: { 'border-color': color, 'border-width': 6 },
                    duration: duration * 0.2
                }).promise().then(() => {
                    node.animate({
                        style: { 'border-color': '#ffffff', 'border-width': 1 },
                        duration: duration * 0.5
                    });
                });
            } else {
                node.flashClass('reasoning-active', duration);
            }
        });

        if (visSettings.attentionSpotlight && foundNodes.length > 0) {
            const others = this._cy.elements().not(foundNodes[0]).not(foundNodes[1] || foundNodes[0]);
            others.animate({ style: { 'opacity': 0.1 }, duration: 200 });
            setTimeout(() => {
                others.animate({ style: { 'opacity': 1 }, duration: 500 });
            }, duration);
        }

        if (derivedId) {
            setTimeout(() => {
                const node = this._cy.getElementById(derivedId);
                if (node.nonempty()) {
                    if (visSettings.colorCodeRules) {
                        node.animate({
                            style: { 'background-color': color, 'width': 60, 'height': 60 },
                            duration: duration * 0.3
                        }).promise().then(() => {
                            setTimeout(() => node.removeStyle(), visSettings.traceDecay || 2000);
                        });
                    } else {
                        node.flashClass('reasoning-active', visSettings.traceDecay || 1500);
                    }
                }
            }, duration * 0.5);
        }
    }

    animateAttention(nodeId) {
        if (!this._cy) {return;}
        const node = this._cy.getElementById(nodeId);
        if (node.nonempty()) {node.flashClass('attention-active', 500);}
    }

    animateFadeIn(nodeId) {
        const node = this._cy?.getElementById(nodeId);
        if (!node?.length) {return;}
        node.style('opacity', 0);
        node.animation({ style: { 'opacity': 1 }, duration: 500 });
    }

    calculateNodeLabel(data) {
        const { label, term, id, truth } = data;
        let displayLabel = label;
        if (!displayLabel && term) {
            displayLabel = typeof term === 'string' ? term
                : typeof term === 'object' ? term.name || term.term || (term.toString && term.toString()) || JSON.stringify(term)
                : null;
        }
        displayLabel = displayLabel || id || 'Unknown';
        if (truth) {
            displayLabel += `\n[F:${(truth.frequency ?? 0).toFixed(2)} C:${(truth.confidence ?? 0).toFixed(2)}]`;
        }
        return displayLabel;
    }

    calculateNodeWeight(priority, term) {
        let weight = (priority * 50) + 20;
        if (term) {weight += this._autoLearner.getConceptModifier(term);}
        return Math.min(Math.max(weight, 10), 100);
    }
}
