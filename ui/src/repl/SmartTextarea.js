import { NarseseHighlighter } from '../utils/NarseseHighlighter.js';
import { AutocompleteManager } from './AutocompleteManager.js';

export class SmartTextarea {
    constructor(container, options = {}) {
        this.container = container;
        this.onExecute = options.onExecute || (() => {});
        this.value = '';
        this.rows = options.rows || 3;
        this.autoResize = options.autoResize || false;
        this.autocomplete = null;
    }

    render() {
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'smart-textarea-wrapper';
        this.wrapper.style.cssText = `
            position: relative;
            width: 100%;
            background: #1e1e1e;
            border: 1px solid #3c3c3c;
            border-radius: 2px;
            overflow: hidden;
        `;

        // Backdrop for highlighting
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'smart-textarea-backdrop';
        this.backdrop.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            padding: 8px;
            font-family: monospace;
            font-size: 13px; /* Match typical textarea font size */
            line-height: 1.5;
            white-space: pre-wrap;
            pointer-events: none;
            color: transparent;
            overflow: auto;
            z-index: 1;
        `;

        // The actual textarea
        this.textarea = document.createElement('textarea');
        this.textarea.className = 'smart-textarea-input';
        this.textarea.rows = this.rows;
        this.textarea.placeholder = 'Enter Narsese or MeTTa... (Shift+Enter to Run)';
        this.textarea.style.cssText = `
            position: relative;
            z-index: 2;
            width: 100%;
            height: 100%;
            padding: 8px;
            font-family: monospace;
            font-size: 13px;
            line-height: 1.5;
            background: transparent;
            color: #d4d4d4; /* Text visible by default, caret color needs to match */
            caret-color: #d4d4d4;
            border: none;
            resize: vertical;
            outline: none;
            white-space: pre-wrap;
            overflow: auto;
        `;

        // Styling for highlights
        const style = document.createElement('style');
        style.textContent = `
            .smart-textarea-input:focus { border-color: #0e639c; }
            .smart-textarea-backdrop .nars-structure { color: #569cd6; font-weight: bold; }
            .smart-textarea-backdrop .nars-copula { color: #c586c0; font-weight: bold; }
            .smart-textarea-backdrop .nars-truth { color: #4ec9b0; }
            .smart-textarea-backdrop .nars-variable { color: #9cdcfe; }
            .smart-textarea-backdrop .nars-punctuation { color: #ce9178; font-weight: bold; }

            /* Hide text in textarea but keep caret */
            .smart-textarea-input.highlight-mode { color: transparent; background: transparent; }
            .smart-textarea-input.highlight-mode::selection { background: rgba(255, 255, 255, 0.2); color: transparent; }
        `;

        this.textarea.addEventListener('input', (e) => {
            this.update();
            if (this.autoResize) this.adjustHeight();
            this.autocomplete?.onInput(e);
        });
        this.textarea.addEventListener('scroll', () => this.syncScroll());
        this.textarea.addEventListener('keydown', (e) => {
            if (this.autocomplete?.onKeyDown(e)) return;

            if ((e.shiftKey && e.key === 'Enter') || (e.ctrlKey && e.key === 'Enter')) {
                e.preventDefault();
                this.onExecute(this.textarea.value, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey });
            }
        });
        this.textarea.addEventListener('blur', () => {
             setTimeout(() => this.autocomplete?.hide(), 200);
        });

        this.wrapper.append(style, this.backdrop, this.textarea);
        if (this.container) this.container.appendChild(this.wrapper);

        this.autocomplete = new AutocompleteManager(this.textarea, this.wrapper);

        if (this.autoResize) {
             // Initial adjustment
             requestAnimationFrame(() => this.adjustHeight());
        }

        return this.wrapper;
    }

    adjustHeight() {
        this.textarea.style.height = 'auto';
        const newHeight = Math.max(this.textarea.scrollHeight, this.rows * 20); // Min height
        this.textarea.style.height = '100%'; // Reset to fill wrapper
        this.wrapper.style.height = newHeight + 'px';
    }

    destroy() {
        this.autocomplete?.destroy();
        this.wrapper.remove();
    }

    update() {
        const text = this.textarea.value;

        // Language detection for highlighting
        const trimmed = text.trim();
        const isMetta = trimmed.startsWith('(') || trimmed.startsWith(';') || trimmed.startsWith('!');
        const language = isMetta ? 'metta' : 'narsese';

        // Simple highlighting
        const highlighted = NarseseHighlighter.highlight(text, language);

        // Ensure trailing newline is handled for scrolling match
        this.backdrop.innerHTML = highlighted + (text.endsWith('\n') ? '<br>&nbsp;' : '');
        this.value = text;

        // Toggle highlight mode if text is present to show colors
        // Ideally we make textarea text transparent so backdrop shows through
        if (text.length > 0) {
            this.textarea.classList.add('highlight-mode');
        } else {
            this.textarea.classList.remove('highlight-mode');
        }
    }

    syncScroll() {
        this.backdrop.scrollTop = this.textarea.scrollTop;
        this.backdrop.scrollLeft = this.textarea.scrollLeft;
    }

    setValue(text) {
        this.textarea.value = text;
        this.update();
    }

    getValue() {
        return this.textarea.value;
    }

    focus() {
        this.textarea.focus();
    }

    get selectionStart() { return this.textarea.selectionStart; }
    get selectionEnd() { return this.textarea.selectionEnd; }
    setSelectionRange(start, end) { this.textarea.setSelectionRange(start, end); }
}
