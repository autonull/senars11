import { REPLCell } from './REPLCell.js';
import { marked } from 'marked';

/**
 * Markdown cell for documentation
 */
export class MarkdownCell extends REPLCell {
    constructor(content = '') {
        super('markdown', content);
        this.isEditing = false;
        this.onUpdate = null;
    }

    render() {
        this.element = document.createElement('div');
        this.element.className = 'repl-cell markdown-cell';
        this.element.dataset.cellId = this.id;
        this.element.draggable = true;
        this.element.style.cssText = `
            margin-bottom: 12px;
            padding: 8px;
            border: 1px solid transparent;
            border-radius: 4px;
            background: transparent;
            transition: all 0.2s;
        `;

        this.element.ondblclick = () => this.toggleEdit(true);

        this.previewDiv = document.createElement('div');
        this.previewDiv.className = 'markdown-preview';
        this.previewDiv.style.color = '#d4d4d4';
        this.updatePreview();

        this.editorDiv = document.createElement('div');
        this.editorDiv.style.display = 'none';

        const textarea = document.createElement('textarea');
        textarea.value = this.content;
        textarea.rows = 5;
        textarea.style.cssText = 'width: 100%; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3c3c3c; padding: 8px; font-family: monospace;';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Render';
        saveBtn.style.cssText = 'margin-top: 5px; padding: 4px 8px; cursor: pointer;';
        saveBtn.onclick = () => {
            this.content = textarea.value;
            this.toggleEdit(false);
            this.onUpdate?.();
        };

        this.editorDiv.append(textarea, saveBtn);

        this.element.append(this.previewDiv, this.editorDiv);
        return this.element;
    }

    updatePreview() {
        if (this.previewDiv) {
            this.previewDiv.innerHTML = marked.parse(this.content);
        }
    }

    toggleEdit(editing) {
        this.isEditing = editing;
        if (editing) {
            this.previewDiv.style.display = 'none';
            this.editorDiv.style.display = 'block';
            this.element.style.border = '1px solid #3c3c3c';
            this.element.style.background = '#1e1e1e';
        } else {
            this.previewDiv.style.display = 'block';
            this.editorDiv.style.display = 'none';
            this.element.style.border = '1px solid transparent';
            this.element.style.background = 'transparent';
            this.updatePreview();
        }
    }
}
