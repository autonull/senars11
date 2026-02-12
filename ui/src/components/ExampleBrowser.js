import { Component } from './Component.js';
import { FluentUI } from '../utils/FluentUI.js';

export class ExampleBrowser extends Component {
    constructor(containerId, options = {}) {
        super(containerId);
        this.options = {
            onSelect: null,
            indexUrl: 'examples.json',
            viewMode: 'graph', // 'tree' or 'graph'
            ...options
        };
        this.treeData = null;
        this.initialized = false;
        this.cy = null;

        // Bind methods
        this.handleSelect = this.handleSelect.bind(this);
    }

    async initialize() {
        if (this.initialized) return;

        try {
            const response = await fetch(this.options.indexUrl);
            if (!response.ok) throw new Error(`Failed to load examples index: ${response.statusText}`);
            this.treeData = await response.json();
            this.render();
            this.initialized = true;
        } catch (error) {
            console.error('ExampleBrowser initialization failed:', error);
            if (this.container) {
                this.fluent().html(`<div class="eb-error">Failed to load examples: ${error.message}</div>`);
            }
        }
    }

    render() {
        if (!this.container || !this.treeData) return;

        this.fluent().clear().addClass('example-browser');

        // Toolbar
        FluentUI.create('div')
            .class('eb-toolbar')
            .child(
                FluentUI.create('select')
                    .class('eb-mode-select')
                    .children([
                        { v: 'graph', l: 'Graph View' },
                        { v: 'tree', l: 'Tree View' }
                    ].map(opt => FluentUI.create('option').attr({ value: opt.v }).text(opt.l).prop({ selected: this.options.viewMode === opt.v })))
                    .on('change', (e) => {
                        this.options.viewMode = e.target.value;
                        this.renderContent();
                    })
            )
            .mount(this.container);

        // Content Area
        this.contentArea = FluentUI.create('div')
            .class('eb-content')
            .mount(this.container)
            .dom;

        this.renderContent();
    }

    renderContent() {
        this.contentArea.innerHTML = '';
        if (this.options.viewMode === 'graph') {
            this.renderGraph();
        } else {
            this.renderTree();
        }
    }

    renderTree() {
        this.contentArea.style.overflowY = 'auto';

        const rootList = FluentUI.create('ul')
            .class('eb-tree-root')
            .mount(this.contentArea);

        this.renderNode(this.treeData, rootList);
    }

    renderNode(node, parentElement) {
        const { type, id, name, path, children } = node;

        if (type === 'directory') {
            if (id === 'examples') {
                 children.forEach(child => this.renderNode(child, parentElement));
                 return;
            }

            const li = FluentUI.create('li').class('eb-tree-dir').mount(parentElement);
            const details = FluentUI.create('details').prop({ open: true }).mount(li);

            FluentUI.create('summary')
                .class('eb-tree-summary')
                .html(`<span class="icon">📁</span> <span class="label">${name}</span>`)
                .mount(details);

            const ul = FluentUI.create('ul').mount(details);
            children.forEach(child => this.renderNode(child, ul));

        } else if (type === 'file') {
            const li = FluentUI.create('li').class('eb-tree-file').mount(parentElement);

            FluentUI.create('button')
                .class('eb-file-btn')
                .html(`<span class="icon">📄</span> <span class="label">${name}</span>`)
                .attr({ title: path, 'data-path': path, 'data-id': id })
                .on('click', () => this.handleSelect(node))
                .mount(li);
        }
    }

    renderGraph() {
        if (!window.cytoscape) {
            this.contentArea.innerHTML = '<div class="eb-error">Cytoscape library not loaded.</div>';
            return;
        }

        const cyContainer = FluentUI.create('div').class('eb-cy-container').mount(this.contentArea).dom;

        const elements = this.convertToGraphElements(this.treeData);

        this.cy = window.cytoscape({
            container: cyContainer,
            elements: elements,
            style: [
                {
                    selector: 'node',
                    style: {
                        'label': 'data(label)',
                        'color': '#fff',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'font-size': '12px',
                        'text-wrap': 'wrap'
                    }
                },
                {
                    selector: 'node[type="directory"]',
                    style: {
                        'background-color': '#444',
                        'shape': 'round-rectangle',
                        'width': 'label',
                        'height': 'label',
                        'padding': '10px'
                    }
                },
                {
                    selector: 'node[type="file"]',
                    style: {
                        'background-color': '#0e639c',
                        'shape': 'ellipse',
                        'width': '60px',
                        'height': '60px'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 2,
                        'line-color': '#555',
                        'target-arrow-color': '#555',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier'
                    }
                }
            ],
            layout: {
                name: 'fcose',
                animate: true,
                nodeDimensionsIncludeLabels: true
            }
        });

        // Ensure layout runs after init
        setTimeout(() => {
             this.cy.resize();
             this.cy.layout({ name: 'fcose', animate: true }).run();
        }, 100);

        this.cy.on('tap', 'node[type="file"]', (evt) => {
            const data = evt.target.data();
            this.handleSelect(data.nodeData);
        });
    }

    convertToGraphElements(root, parentId = null) {
        let elements = [];
        const { type, id, name, children } = root;

        const nodeId = id || `node_${Math.random().toString(36).substr(2, 9)}`;

        elements.push({
            group: 'nodes',
            data: {
                id: nodeId,
                label: name,
                type: type,
                nodeData: root
            }
        });

        if (parentId) {
            elements.push({
                group: 'edges',
                data: {
                    source: parentId,
                    target: nodeId
                }
            });
        }

        if (children && Array.isArray(children)) {
            children.forEach(child => {
                elements = elements.concat(this.convertToGraphElements(child, nodeId));
            });
        }

        return elements;
    }

    handleSelect(node) {
        this.options.onSelect?.(node);
    }
}
