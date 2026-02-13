import { Component } from './Component.js';

export class ExampleBrowser extends Component {
    constructor(containerId, options = {}) {
        super(containerId);
        this.options = {
            onSelect: null,
            indexUrl: 'examples.json',
            ...options
        };
        this.treeData = null;
        this.initialized = false;

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
            // Fallback content
            if (this.container) {
                this.container.innerHTML = `<div class="error-message">Failed to load examples: ${error.message}</div>`;
            }
        }
    }

    render() {
        if (!this.container || !this.treeData) return;

        this.container.innerHTML = '';
        this.container.classList.add('example-browser');

        const rootList = document.createElement('ul');
        rootList.className = 'tree-root';

        this.renderNode(this.treeData, rootList);
        this.container.appendChild(rootList);
    }

    renderNode(node, parentElement) {
        const { type, id, name, path, children } = node;

        if (type === 'directory') {
            if (id === 'examples') {
                 children.forEach(child => this.renderNode(child, parentElement));
                 return;
            }

            const li = document.createElement('li');
            li.className = 'tree-directory';

            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.innerHTML = `<span class="icon">📁</span> <span class="label">${name}</span>`;

            const ul = document.createElement('ul');
            children.forEach(child => this.renderNode(child, ul));

            details.append(summary, ul);
            li.appendChild(details);
            parentElement.appendChild(li);

        } else if (type === 'file') {
            const li = document.createElement('li');
            li.className = 'tree-file';

            const button = document.createElement('button');
            button.className = 'tree-item-btn';
            button.innerHTML = `<span class="icon">📄</span> <span class="label">${name}</span>`;
            Object.assign(button.dataset, { path, id });
            button.title = path;

            button.addEventListener('click', () => this.handleSelect(node));

            li.appendChild(button);
            parentElement.appendChild(li);
        }
    }

    handleSelect(node) {
        const { id } = node;
        this.container.querySelector('.selected')?.classList.remove('selected');
        this.container.querySelector(`button[data-id="${id}"]`)?.classList.add('selected');
        this.options.onSelect?.(node);
    }
}
