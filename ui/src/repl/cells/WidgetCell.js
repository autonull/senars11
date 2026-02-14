import { REPLCell } from './REPLCell.js';
import { WidgetFactory } from '../../components/widgets/WidgetFactory.js';

/**
 * Widget cell for interactive components
 */
export class WidgetCell extends REPLCell {
    constructor(widgetType, data = {}, notebookClass = null) {
        super('widget', data);
        this.widgetType = widgetType;
        this.widgetInstance = null;
        this.NotebookManagerClass = notebookClass;
    }

    render() {
        this.element = document.createElement('div');
        this.element.className = 'repl-cell widget-cell';
        this.element.draggable = true;
        this.element.style.cssText = 'margin-bottom: 12px; border: 1px solid #333; background: #1e1e1e; border-radius: 4px; padding: 10px;';

        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; cursor: move;';
        header.innerHTML = `<span>🧩 ${this.widgetType}</span>`;

        const closeBtn = this._createActionBtn('✖️', 'Remove', () => this.destroy());
        header.appendChild(closeBtn);

        const content = document.createElement('div');
        content.style.position = 'relative';

        this.element.append(header, content);

        if (this.widgetType === 'SubNotebook' && this.NotebookManagerClass) {
             const nestedManager = new this.NotebookManagerClass(content, {
                 onExecute: (text, cell, options) => {
                     console.log('Nested execution:', text);
                 }
             });
             this.widgetInstance = nestedManager;
             nestedManager.createCodeCell('(print "Hello Nested World")');
        } else {
            let config = this.content;
            if (this.widgetType === 'TruthSlider') {
                config = {
                    frequency: this.content.frequency,
                    confidence: this.content.confidence,
                    onChange: (val) => console.log('Widget update:', val)
                };
            }

            this.widgetInstance = WidgetFactory.createWidget(this.widgetType, content, config);

            if (this.widgetInstance) {
                this.widgetInstance.render();
            } else {
                content.innerHTML = `<div style="color:red">Unknown widget: ${this.widgetType}</div>`;
            }
        }

        return this.element;
    }
}
