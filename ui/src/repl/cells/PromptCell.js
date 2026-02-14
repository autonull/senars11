import { REPLCell } from './REPLCell.js';

/**
 * Prompt cell for system requests
 */
export class PromptCell extends REPLCell {
    constructor(question, onResponse = null) {
        super('prompt', question);
        this.onResponse = onResponse;
        this.response = '';
        this.responded = false;
    }

    render() {
        this.element = document.createElement('div');
        this.element.className = 'repl-cell prompt-cell';
        this.element.style.cssText = `
            margin-bottom: 12px; border: 1px solid #00ff9d; border-radius: 4px;
            background: rgba(0, 255, 157, 0.05); overflow: hidden;
        `;

        const header = document.createElement('div');
        header.style.cssText = 'padding: 8px; background: rgba(0, 255, 157, 0.1); color: #00ff9d; font-weight: bold; font-size: 0.9em;';
        header.innerHTML = '🤖 System Request';

        const content = document.createElement('div');
        content.style.padding = '12px';

        const questionText = document.createElement('div');
        questionText.style.cssText = 'margin-bottom: 10px; font-size: 1.1em; color: white;';
        questionText.textContent = this.content;

        const inputContainer = document.createElement('div');
        inputContainer.style.display = 'flex';
        inputContainer.style.gap = '8px';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Type your response here...';
        input.style.cssText = `
            flex: 1; background: #252526; border: 1px solid #444; color: white;
            padding: 8px; border-radius: 3px; outline: none;
        `;

        const submitBtn = document.createElement('button');
        submitBtn.textContent = 'Reply';
        submitBtn.style.cssText = `
            padding: 8px 16px; background: #00ff9d; color: black; border: none;
            border-radius: 3px; cursor: pointer; font-weight: bold;
        `;

        const submit = () => {
            if (!input.value.trim() || this.responded) return;
            this.response = input.value.trim();
            this.responded = true;
            input.disabled = true;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sent';
            this.onResponse?.(this.response);
        };

        submitBtn.onclick = submit;
        input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };

        inputContainer.append(input, submitBtn);
        content.append(questionText, inputContainer);
        this.element.append(header, content);

        requestAnimationFrame(() => input.focus());

        return this.element;
    }
}
