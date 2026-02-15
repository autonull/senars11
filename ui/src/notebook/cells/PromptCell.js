import { Cell } from './Cell.js';
import { FluentUI } from '../../utils/FluentUI.js';

/**
 * Prompt cell for system requests
 */
export class PromptCell extends Cell {
    constructor(question, onResponse = null) {
        super('prompt', question);
        this.onResponse = onResponse;
        this.response = '';
        this.responded = false;
    }

    render() {
        const wrapper = FluentUI.create('div')
            .class('repl-cell prompt-cell')
            .style({
                marginBottom: '12px', border: '1px solid #00ff9d', borderRadius: '4px',
                background: 'rgba(0, 255, 157, 0.05)', overflow: 'hidden'
            });

        wrapper.child(
            FluentUI.create('div')
                .style({ padding: '8px', background: 'rgba(0, 255, 157, 0.1)', color: '#00ff9d', fontWeight: 'bold', fontSize: '0.9em' })
                .html('🤖 System Request')
        );

        const content = FluentUI.create('div').style({ padding: '12px' });

        content.child(
            FluentUI.create('div')
                .style({ marginBottom: '10px', fontSize: '1.1em', color: 'white' })
                .text(this.content)
        );

        const inputContainer = FluentUI.create('div').style({ display: 'flex', gap: '8px' });

        const input = FluentUI.create('input')
            .attr({ type: 'text', placeholder: 'Type your response here...' })
            .style({
                flex: '1', background: '#252526', border: '1px solid #444', color: 'white',
                padding: '8px', borderRadius: '3px', outline: 'none'
            });

        const submitBtn = FluentUI.create('button')
            .text('Reply')
            .style({
                padding: '8px 16px', background: '#00ff9d', color: 'black', border: 'none',
                borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold'
            });

        const submit = () => {
            const val = input.dom.value.trim();
            if (!val || this.responded) return;
            this.response = val;
            this.responded = true;
            input.dom.disabled = true;
            submitBtn.dom.disabled = true;
            submitBtn.text('Sent');
            this.onResponse?.(this.response);
        };

        submitBtn.on('click', submit);
        input.on('keydown', (e) => { if (e.key === 'Enter') submit(); });

        inputContainer.child(input).child(submitBtn);
        content.child(inputContainer);
        wrapper.child(content);

        this.element = wrapper.dom;
        requestAnimationFrame(() => input.dom.focus());

        return this.element;
    }
}
