import { Cell } from './Cell.js';
import { marked } from 'marked';
import { FluentUI } from '../../utils/FluentUI.js';

/**
 * Markdown cell for documentation
 */
export class MarkdownCell extends Cell {
    constructor(content = '') {
        super('markdown', content);
        this.isEditing = false;
        this.onUpdate = null;
    }

    render() {
        const wrapper = FluentUI.create('div')
            .class('repl-cell markdown-cell')
            .data('cellId', this.id)
            .attr({ draggable: 'true' })
            .style({
                marginBottom: '12px', padding: '8px', border: '1px solid transparent',
                borderRadius: '4px', background: 'transparent', transition: 'all 0.2s'
            })
            .on('dblclick', () => this.toggleEdit(true));

        this.element = wrapper.dom;

        this.previewDiv = FluentUI.create('div')
            .class('markdown-preview')
            .style({ color: '#d4d4d4' })
            .dom;

        this.updatePreview();

        this.editorDiv = FluentUI.create('div').style({ display: 'none' }).dom;

        const textarea = FluentUI.create('textarea')
            .val(this.content)
            .attr({ rows: 5 })
            .style({
                width: '100%', background: '#1e1e1e', color: '#d4d4d4',
                border: '1px solid #3c3c3c', padding: '8px', fontFamily: 'monospace'
            })
            .dom;

        const saveBtn = FluentUI.create('button')
            .text('Render')
            .style({ marginTop: '5px', padding: '4px 8px', cursor: 'pointer' })
            .on('click', () => {
                this.content = textarea.value;
                this.toggleEdit(false);
                this.onUpdate?.();
            })
            .dom;

        this.editorDiv.append(textarea, saveBtn);

        wrapper.child(this.previewDiv).child(this.editorDiv);
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
