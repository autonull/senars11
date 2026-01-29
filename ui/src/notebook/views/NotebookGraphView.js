import { FluentUI } from '../../utils/FluentUI.js';

export class NotebookGraphView {
    constructor(container, cells, onSwitchView) {
        this.container = container;
        this.cells = cells;
        this.onSwitchView = onSwitchView;
        this.cy = null;
    }

    render() {
        if (!window.cytoscape) {
            FluentUI.create(this.container).html('Cytoscape library not loaded.');
            return;
        }

        const cyContainer = FluentUI.create('div')
            .style({ width: '100%', height: '100%', background: '#1e1e1e' })
            .mount(this.container)
            .dom;

        const elements = this._buildElements();

        this.cy = window.cytoscape({
            container: cyContainer,
            elements: elements,
            style: this._getStyles(),
            layout: {
                name: 'fcose',
                animate: true
            }
        });

        try {
            this.cy.layout({ name: 'fcose', animate: true }).run();
        } catch (e) {
            this.cy.layout({ name: 'grid' }).run();
        }

        this._setupEvents();
    }

    _buildElements() {
        const cellNodes = this.cells.map((cell, index) => ({
            group: 'nodes',
            data: {
                id: cell.id,
                label: `[${index}] ${cell.type}`,
                type: cell.type,
                content: cell.content,
                isCell: true
            }
        }));

        const termNodes = new Map();
        const termEdges = [];

        this.cells.forEach(cell => {
            const text = typeof cell.content === 'string' ? cell.content : JSON.stringify(cell.content);
            if (!text) return;

            const narsTerms = text.match(/<([^>]+)>/g) || [];
            narsTerms.forEach(t => {
                const term = t.replace(/[<>]/g, '');
                if (!termNodes.has(term)) {
                    termNodes.set(term, { group: 'nodes', data: { id: `term_${term}`, label: term, type: 'term', isCell: false } });
                }
                termEdges.push({ group: 'edges', data: { source: cell.id, target: `term_${term}`, label: 'refs', type: 'ref' } });
            });

            const mettaSymbols = text.match(/\(([^)\s]+)/g) || [];
            mettaSymbols.forEach(s => {
                const sym = s.substring(1);
                if (sym.length > 2 && !['match', 'let', 'type', 'print'].includes(sym)) {
                    if (!termNodes.has(sym)) {
                        termNodes.set(sym, { group: 'nodes', data: { id: `term_${sym}`, label: sym, type: 'term', isCell: false } });
                    }
                    termEdges.push({ group: 'edges', data: { source: cell.id, target: `term_${sym}`, label: 'refs', type: 'ref' } });
                }
            });
        });

        const edges = [];
        for (let i = 0; i < this.cells.length - 1; i++) {
            edges.push({
                group: 'edges',
                data: {
                    source: this.cells[i].id,
                    target: this.cells[i+1].id,
                    label: 'next',
                    type: 'flow'
                }
            });
        }

        return [...cellNodes, ...Array.from(termNodes.values()), ...edges, ...termEdges];
    }

    _getStyles() {
        return [
            {
                selector: 'node',
                style: {
                    'background-color': '#444',
                    'label': 'data(label)',
                    'color': '#fff',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': '10px',
                    'width': '40px',
                    'height': '40px'
                }
            },
            {
                selector: 'node[type="term"]',
                style: { 'background-color': '#5c2d91', 'shape': 'ellipse', 'width': '30px', 'height': '30px', 'font-size': '8px' }
            },
            {
                selector: 'node[type="code"]',
                style: { 'background-color': '#0e639c', 'shape': 'rectangle', 'width': '60px' }
            },
            {
                selector: 'node[type="result"]',
                style: { 'background-color': '#00ff9d', 'color': '#000', 'shape': 'round-rectangle', 'width': '60px' }
            },
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': '#555',
                    'target-arrow-color': '#555',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'opacity': 0.5
                }
            },
            {
                selector: 'edge[type="ref"]',
                style: { 'line-color': '#5c2d91', 'width': 1, 'line-style': 'dashed', 'target-arrow-shape': 'none' }
            },
            {
                selector: 'edge[type="flow"]',
                style: { 'line-color': '#888', 'width': 2, 'target-arrow-color': '#888' }
            }
        ];
    }

    _setupEvents() {
        this.cy.on('tap', 'node', (evt) => {
            const data = evt.target.data();
            if (data.isCell) {
                this.onSwitchView('list', data.id);
            } else {
                const connected = evt.target.neighborhood();
                this.cy.elements().removeClass('highlight');
                connected.addClass('highlight');
                evt.target.addClass('highlight');
            }
        });

        this.cy.on('mouseover', 'node', (evt) => {
            const container = this.container;
            const data = evt.target.data();

            let content = data.label;
            if (data.isCell) {
                 const text = typeof data.content === 'string' ? data.content : JSON.stringify(data.content);
                 content = `${data.type.toUpperCase()}:\n${text.substring(0, 100)}${text.length>100?'...':''}`;
            }

            const tip = FluentUI.create('div')
                .class('graph-tooltip')
                .style({
                    position: 'absolute', background: '#252526', color: 'white', padding: '5px',
                    border: '1px solid #444', borderRadius: '3px', fontSize: '11px', zIndex: '100',
                    pointerEvents: 'none', maxWidth: '200px', wordBreak: 'break-all'
                })
                .text(content)
                .mount(container)
                .dom;

            const moveHandler = (e) => {
                 const rect = container.getBoundingClientRect();
                 tip.style.left = (e.clientX - rect.left + 10) + 'px';
                 tip.style.top = (e.clientY - rect.top + 10) + 'px';
            };

            container.addEventListener('mousemove', moveHandler);

            evt.target.once('mouseout', () => {
                tip.remove();
                container.removeEventListener('mousemove', moveHandler);
            });
        });
    }
}
