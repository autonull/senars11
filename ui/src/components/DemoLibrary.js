import { Component } from './Component.js';

/**
 * DemoLibrary - Interactive browser for exploring and loading demo files
 */
export class DemoLibrary extends Component {
    constructor(container, onLoadDemo) {
        super(container);
        this.onLoadDemo = onLoadDemo;
        this.examplesTree = null;
        this.filteredTree = null;
        this.selectedFile = null;
        this.options = { clearFirst: false, autoRun: false };
        this.expandedNodes = new Set();
    }

    async initialize() {
        this.container.innerHTML = '';

        this.container.appendChild(this.createHeader());
        this.container.appendChild(this.createOptionsPanel());
        this.container.appendChild(this.createMainLayout());
        this.container.appendChild(this.createFooter());

        try {
            await this.loadExamplesTree();
            this.renderTree();
            this.showWelcomePreview();
        } catch (error) {
            this.showError(`Failed to load examples: ${error.message}`);
        }
    }

    createHeader() {
        const header = document.createElement('div');
        header.style.cssText = 'padding: 15px; background: #2d2d30; border-bottom: 1px solid #3c3c3c;';

        const title = document.createElement('h2');
        title.textContent = '📚 Demo Library';
        title.style.cssText = 'margin: 0 0 10px 0; color: #d4d4d4; font-size: 1.2em;';

        const searchBox = document.createElement('input');
        searchBox.type = 'text';
        searchBox.placeholder = '🔍 Search demos...';
        searchBox.style.cssText = 'width: 100%; padding: 8px; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3c3c3c; border-radius: 3px;';
        searchBox.oninput = (e) => this.filterDemos(e.target.value);

        header.append(title, searchBox);
        return header;
    }

    createOptionsPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = 'padding: 10px 15px; background: #252526; display: flex; gap: 20px;';

        const createCheckbox = (label, checked, onChange) => {
            const wrapper = document.createElement('label');
            wrapper.style.cssText = 'display: flex; align-items: center; gap: 6px; cursor: pointer; color: #d4d4d4; font-size: 0.9em;';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = checked;
            checkbox.onchange = onChange;
            wrapper.append(checkbox, document.createTextNode(label));
            return wrapper;
        };

        panel.append(
            createCheckbox('Clear notebook before loading', this.options.clearFirst, (e) => this.options.clearFirst = e.target.checked),
            createCheckbox('Auto-run after loading', this.options.autoRun, (e) => this.options.autoRun = e.target.checked)
        );

        return panel;
    }

    createMainLayout() {
        const layout = document.createElement('div');
        layout.style.cssText = 'flex: 1; display: flex; overflow: hidden; border-top: 1px solid #3c3c3c;';

        const treeContainer = document.createElement('div');
        treeContainer.id = 'demo-tree-container';
        treeContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 10px; background: #1e1e1e;';

        const previewContainer = document.createElement('div');
        previewContainer.id = 'demo-preview-container';
        previewContainer.style.cssText = 'width: 300px; border-left: 1px solid #3c3c3c; background: #252526; padding: 10px; overflow-y: auto;';

        layout.append(treeContainer, previewContainer);
        return layout;
    }

    createFooter() {
        const footer = document.createElement('div');
        footer.style.cssText = 'padding: 10px; background: #252526; border-top: 1px solid #3c3c3c; text-align: right;';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.cssText = 'padding: 6px 16px; background: #333; color: white; border: none; cursor: pointer; border-radius: 3px;';
        closeBtn.onclick = () => this.container.closest('.modal-backdrop')?.remove();

        footer.appendChild(closeBtn);
        return footer;
    }

    async loadExamplesTree() {
        const response = await fetch('/examples.json');
        if (!response.ok) throw new Error('Failed to load examples.json');
        this.examplesTree = await response.json();
        this.filteredTree = this.examplesTree;
    }

    filterDemos(searchText) {
        this.filteredTree = searchText.trim()
            ? this.filterNode(this.examplesTree, searchText.toLowerCase())
            : this.examplesTree;
        this.renderTree();
    }

    filterNode(node, searchText) {
        if (node.type === 'file') {
            return node.name.toLowerCase().includes(searchText) ? node : null;
        }

        if (node.type === 'directory') {
            const filteredChildren = (node.children || [])
                .map(child => this.filterNode(child, searchText))
                .filter(Boolean);
            return filteredChildren.length ? { ...node, children: filteredChildren } : null;
        }

        return node;
    }

    renderTree() {
        const container = document.getElementById('demo-tree-container');
        if (!container || !this.filteredTree) return;
        container.innerHTML = '';
        container.appendChild(this.renderNode(this.filteredTree, 0));
    }

    renderNode(node, depth) {
        const nodeEl = document.createElement('div');

        if (node.type === 'directory') {
            nodeEl.appendChild(this.createDirectoryHeader(node, depth));
            if (this.expandedNodes.has(node.id) && node.children) {
                const childrenContainer = document.createElement('div');
                node.children.forEach(child => childrenContainer.appendChild(this.renderNode(child, depth + 1)));
                nodeEl.appendChild(childrenContainer);
            }
        } else if (node.type === 'file') {
            nodeEl.appendChild(this.createFileRow(node, depth));
        }

        return nodeEl;
    }

    createDirectoryHeader(node, depth) {
        const isExpanded = this.expandedNodes.has(node.id);
        const header = document.createElement('div');
        header.style.cssText = `padding: 4px 8px; padding-left: ${depth * 16 + 8}px; cursor: pointer; display: flex; align-items: center; gap: 6px; color: #d4d4d4;`;
        header.onmouseenter = () => header.style.background = '#2a2d2e';
        header.onmouseleave = () => header.style.background = 'transparent';
        header.onclick = () => this.toggleNode(node.id);

        const icon = document.createElement('span');
        icon.textContent = isExpanded ? '📂' : '📁';

        const name = document.createElement('span');
        name.textContent = node.name;
        name.style.fontWeight = depth === 0 ? 'bold' : 'normal';

        header.append(icon, name);
        return header;
    }

    createFileRow(node, depth) {
        const row = document.createElement('div');
        row.style.cssText = `padding: 4px 8px; padding-left: ${depth * 16 + 8}px; cursor: pointer; display: flex; align-items: center; gap: 6px; justify-content: space-between; color: #d4d4d4;`;
        row.onmouseenter = () => row.style.background = '#2a2d2e';
        row.onmouseleave = () => row.style.background = 'transparent';
        row.onclick = () => this.selectFile(node);

        const nameSection = document.createElement('div');
        nameSection.style.cssText = 'display: flex; align-items: center; gap: 6px; flex: 1;';
        nameSection.append(
            Object.assign(document.createElement('span'), { textContent: '📄' }),
            Object.assign(document.createElement('span'), { textContent: node.name, style: 'font-size: 0.9em;' })
        );

        const loadBtn = document.createElement('button');
        loadBtn.textContent = 'Load';
        loadBtn.style.cssText = 'padding: 2px 8px; background: #0e639c; color: white; border: none; cursor: pointer; border-radius: 2px; font-size: 0.85em;';
        loadBtn.onclick = (e) => {
            e.stopPropagation();
            this.loadDemo(node);
        };

        row.append(nameSection, loadBtn);
        return row;
    }

    toggleNode(nodeId) {
        this.expandedNodes.has(nodeId) ? this.expandedNodes.delete(nodeId) : this.expandedNodes.add(nodeId);
        this.renderTree();
    }

    async selectFile(node) {
        this.selectedFile = node;
        await this.previewFile(node);
    }

    async previewFile(node) {
        const container = document.getElementById('demo-preview-container');
        if (!container) return;

        container.innerHTML = '<div style="color: #888;">Loading preview...</div>';

        try {
            const response = await fetch(`/${node.path}`);
            if (!response.ok) throw new Error('Failed to load file');
            const content = await response.text();
            const lines = content.split('\n');

            container.innerHTML = '';

            const header = document.createElement('div');
            header.style.cssText = 'margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #3c3c3c;';
            header.innerHTML = `
                <div style="font-weight: bold; color: #d4d4d4; margin-bottom: 4px;">${node.name}</div>
                <div style="font-size: 0.85em; color: #888;">${lines.length} lines</div>
            `;

            const contentEl = document.createElement('pre');
            contentEl.style.cssText = 'background: #1e1e1e; padding: 10px; border-radius: 3px; overflow-x: auto; font-size: 0.85em; color: #d4d4d4; font-family: monospace; margin: 0; white-space: pre-wrap;';
            contentEl.textContent = lines.slice(0, 20).join('\n') + (lines.length > 20 ? '\n\n...' : '');

            container.append(header, contentEl);
        } catch (error) {
            container.innerHTML = `<div style="color: #f48771;">Error: ${error.message}</div>`;
        }
    }

    showWelcomePreview() {
        const container = document.getElementById('demo-preview-container');
        if (!container) return;
        container.innerHTML = `
            <div style="color: #888; padding: 20px; text-align: center;">
                <div style="font-size: 3em; margin-bottom: 10px;">📚</div>
                <div style="margin-bottom: 10px;">Select a demo to preview</div>
                <div style="font-size: 0.85em;">Click "Load" to add to notebook</div>
            </div>
        `;
    }

    showError(message) {
        const container = document.getElementById('demo-tree-container');
        if (container) container.innerHTML = `<div style="color: #f48771; padding: 20px;">${message}</div>`;
    }

    loadDemo(node) {
        this.onLoadDemo?.(node.path, this.options);
    }
}
