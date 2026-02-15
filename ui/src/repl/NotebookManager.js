/**
 * Base class for REPL cells
 */
export class REPLCell {
    constructor(type, content = '') {
        this.id = `cell-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.type = type; // 'code', 'result', 'markdown'
        this.content = content;
        this.timestamp = Date.now();
        this.element = null;
    }

    render() {
        throw new Error('REPLCell.render() must be implemented by subclass');
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}

/**
 * Code cell for user input
 */
export class CodeCell extends REPLCell {
    constructor(content = '', onExecute = null) {
        super('code', content);
        this.onExecute = onExecute;
    }

    render() {
        const cell = document.createElement('div');
        cell.className = 'repl-cell code-cell';
        cell.dataset.cellId = this.id;
        cell.style.cssText = `
            margin-bottom: 12px;
            border: 1px solid #3c3c3c;
            border-radius: 4px;
            background: #1e1e1e;
            overflow: hidden;
        `;

        // Cell toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'cell-toolbar';
        toolbar.style.cssText = `
            padding: 4px 8px;
            background: #252526;
            border-bottom: 1px solid #3c3c3c;
            display: flex;
            gap: 8px;
            align-items: center;
            font-size: 0.85em;
        `;

        const label = document.createElement('span');
        label.textContent = '💻 Code';
        label.style.color = '#888';

        const runBtn = document.createElement('button');
        runBtn.innerHTML = '▶️';
        runBtn.title = 'Run cell';
        runBtn.style.cssText = 'padding: 2px 8px; background: #0e639c; color: white; border: none; cursor: pointer; border-radius: 2px;';
        runBtn.onclick = () => this.execute();

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.title = 'Delete cell';
        deleteBtn.style.cssText = 'padding: 2px 8px; background: #b30000; color: white; border: none; cursor: pointer; border-radius: 2px; margin-left: auto;';
        deleteBtn.onclick = () => this.delete();

        toolbar.appendChild(label);
        toolbar.appendChild(runBtn);
        toolbar.appendChild(deleteBtn);

        // Code editor
        const editor = document.createElement('textarea');
        editor.className = 'cell-editor';
        editor.value = this.content;
        editor.placeholder = 'Enter Narsese or MeTTa...';
        editor.rows = 3;
        editor.style.cssText = `
            width: 100%;
            background: #1e1e1e;
            color: #d4d4d4;
            border: none;
            padding: 10px;
            font-family: monospace;
            font-size: 0.95em;
            resize: vertical;
            outline: none;
        `;

        editor.addEventListener('input', (e) => {
            this.content = e.target.value;
        });

        editor.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.execute();
            }
        });

        cell.appendChild(toolbar);
        cell.appendChild(editor);

        this.element = cell;
        this.editor = editor;

        return cell;
    }

    execute() {
        if (this.onExecute && this.content.trim()) {
            this.onExecute(this.content, this);
        }
    }

    delete() {
        if (confirm('Delete this cell?')) {
            this.destroy();
            // Trigger deletion event
            if (this.onDelete) {
                this.onDelete(this);
            }
        }
    }

    focus() {
        if (this.editor) {
            this.editor.focus();
        }
    }
}

/**
 * Result cell for output display
 */
export class ResultCell extends REPLCell {
    constructor(content, category = 'result') {
        super('result', content);
        this.category = category;
    }

    render() {
        const cell = document.createElement('div');
        cell.className = 'repl-cell result-cell';
        cell.dataset.cellId = this.id;
        cell.dataset.category = this.category;
        cell.style.cssText = `
            margin-bottom: 12px;
            padding: 10px;
            border-left: 3px solid #00ff88;
            background: rgba(0, 255, 136, 0.1);
            border-radius: 4px;
        `;

        // Result header
        const header = document.createElement('div');
        header.style.cssText = 'font-size: 0.85em; color: #888; margin-bottom: 6px;';
        const timestamp = new Date(this.timestamp).toLocaleTimeString();
        header.textContent = `✨ Result [${timestamp}]`;

        // Result content
        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = 'white-space: pre-wrap; font-family: monospace; color: #d4d4d4;';
        contentDiv.textContent = this.content;

        cell.appendChild(header);
        cell.appendChild(contentDiv);

        this.element = cell;

        return cell;
    }
}

/**
 * Notebook manager for REPL cells
 */
export class NotebookManager {
    constructor(container) {
        this.container = container;
        this.cells = [];
    }

    addCell(cell) {
        this.cells.push(cell);
        const element = cell.render();
        this.container.appendChild(element);
        this.scrollToBottom();
        return cell;
    }

    createCodeCell(content = '', onExecute = null) {
        const cell = new CodeCell(content, onExecute);
        cell.onDelete = (c) => this.removeCell(c);
        return this.addCell(cell);
    }

    createResultCell(content, category = 'result') {
        const cell = new ResultCell(content, category);
        return this.addCell(cell);
    }

    removeCell(cell) {
        const index = this.cells.indexOf(cell);
        if (index > -1) {
            this.cells.splice(index, 1);
        }
        cell.destroy();
    }

    clear() {
        this.cells.forEach(cell => cell.destroy());
        this.cells = [];
    }

    scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
    }

    exportNotebook() {
        return this.cells.map(cell => ({
            type: cell.type,
            content: cell.content,
            timestamp: cell.timestamp,
            category: cell.category
        }));
    }

    importNotebook(data) {
        this.clear();
        data.forEach(cellData => {
            if (cellData.type === 'code') {
                this.createCodeCell(cellData.content);
            } else if (cellData.type === 'result') {
                this.createResultCell(cellData.content, cellData.category);
            }
        });
    }
}
