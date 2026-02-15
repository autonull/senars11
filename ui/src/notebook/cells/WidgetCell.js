import { Cell } from './Cell.js';
import { WidgetFactory } from '../../components/widgets/WidgetFactory.js';
import { FluentUI } from '../../utils/FluentUI.js';

/**
 * Widget cell for interactive components
 */
export class WidgetCell extends Cell {
    constructor(widgetType, data = {}, notebookClass = null) {
        super('widget', data);
        this.widgetType = widgetType;
        this.widgetInstance = null;
        this.NotebookManagerClass = notebookClass;
    }

    render() {
        const wrapper = FluentUI.create('div')
            .class('repl-cell widget-cell')
            .attr({ draggable: 'true' })
            .style({
                marginBottom: '12px',
                border: '1px solid #333',
                background: '#1e1e1e',
                borderRadius: '4px',
                padding: '10px'
            });

        const header = FluentUI.create('div')
            .style({
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '8px',
                fontSize: '11px',
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                cursor: 'move'
            })
            .html(`<span>🧩 ${this.widgetType}</span>`)
            .child(this._createActionBtn('✖️', 'Remove', () => this.destroy()));

        const content = FluentUI.create('div').style({ position: 'relative' });

        wrapper.child(header).child(content);
        this.element = wrapper.dom;

        if (this.widgetType === 'SubNotebook' && this.NotebookManagerClass) {
             const nestedManager = new this.NotebookManagerClass(content.dom, {
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

            this.widgetInstance = WidgetFactory.createWidget(this.widgetType, content.dom, config);

            if (this.widgetInstance) {
                this.widgetInstance.render();
            } else {
                content.html(`<div style="color:red">Unknown widget: ${this.widgetType}</div>`);
            }
        }

        return this.element;
    }
}
