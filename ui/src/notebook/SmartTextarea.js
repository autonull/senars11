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

        // Common styles for layers
        const fontStyles = `
            font-family: monospace;
            font-size: 13px;
            line-height: 1.5;
            white-space: pre-wrap;
            padding: 8px;
            width: 100%;
            height: 100%;
            box-sizing: border-box;
        `;

        // Backdrop for highlighting
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'smart-textarea-backdrop';
        this.backdrop.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            ${fontStyles}
            pointer-events: none;
            color: #d4d4d4;
            overflow: hidden; /* Scroll is handled by sync */
            z-index: 1;
        `;

        // Bracket Layer for bracket matching
        this.bracketLayer = document.createElement('div');
        this.bracketLayer.className = 'smart-textarea-brackets';
        this.bracketLayer.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            ${fontStyles}
            pointer-events: none;
            color: transparent;
            overflow: hidden;
            z-index: 2;
        `;

        // The actual textarea
        this.textarea = document.createElement('textarea');
        this.textarea.className = 'smart-textarea-input';
        this.textarea.rows = this.rows;
        this.textarea.placeholder = 'Enter Narsese or MeTTa... (Shift+Enter to Run)';
        this.textarea.setAttribute('spellcheck', 'false');
        this.textarea.setAttribute('autocomplete', 'off');
        this.textarea.setAttribute('autocorrect', 'off');
        this.textarea.setAttribute('autocapitalize', 'off');
        this.textarea.style.cssText = `
            position: relative;
            z-index: 3;
            ${fontStyles}
            background: transparent;
            color: #d4d4d4; /* Text visible by default */
            caret-color: #d4d4d4;
            border: none;
            resize: vertical;
            outline: none;
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

            .metta-comment { color: #6a9955; font-style: italic; }
            .metta-keyword { color: #c586c0; font-weight: bold; }
            .metta-variable { color: #9cdcfe; }
            .metta-paren { color: #888; font-weight: bold; }

            .bracket-match { background-color: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 2px; }

            /* Hide text in textarea but keep caret */
            .smart-textarea-input.highlight-mode { color: transparent !important; background: transparent; }
            .smart-textarea-input.highlight-mode::selection { background: rgba(255, 255, 255, 0.2); color: transparent; }
        `;

        this.textarea.addEventListener('input', (e) => {
            this.update();
            if (this.autoResize) this.adjustHeight();
            this.autocomplete?.onInput(e);
        });

        this.textarea.addEventListener('scroll', () => this.syncScroll());

        this.textarea.addEventListener('click', () => this.updateBrackets());
        this.textarea.addEventListener('keyup', () => this.updateBrackets());

        this.textarea.addEventListener('keydown', (e) => {
            if (this.autocomplete?.onKeyDown(e)) return;

            if ((e.shiftKey && e.key === 'Enter') || (e.ctrlKey && e.key === 'Enter')) {
                e.preventDefault();
                this.onExecute(this.textarea.value, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey });
            } else if (e.key === 'Enter') {
                // Auto-indentation
                e.preventDefault();
                this.handleEnter();
            }
        });

        this.textarea.addEventListener('blur', () => {
             setTimeout(() => this.autocomplete?.hide(), 200);
        });

        this.wrapper.append(style, this.backdrop, this.bracketLayer, this.textarea);
        if (this.container) this.container.appendChild(this.wrapper);

        // this.autocomplete = new AutocompleteManager(this.textarea, this.wrapper);

        if (this.autoResize) {
             requestAnimationFrame(() => this.adjustHeight());
        }

        return this.wrapper;
    }

    handleEnter() {
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        const value = this.textarea.value;

        // Find current line start
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const currentLine = value.substring(lineStart, start);

        // Match indentation
        const match = currentLine.match(/^(\s*)/);
        let indent = match ? match[1] : '';

        // Increase indent if line ends with opening bracket
        const trimmed = currentLine.trim();
        if (trimmed.endsWith('(') || trimmed.endsWith('{') || trimmed.endsWith('[')) {
            indent += '  '; // 2 spaces
        }

        // Insert
        const textToInsert = '\n' + indent;
        this.textarea.setRangeText(textToInsert, start, end, 'end');
        this.textarea.dispatchEvent(new Event('input')); // Trigger update
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
        const trimmed = text.trim();
        const isMetta = trimmed.startsWith('(') || trimmed.startsWith(';') || trimmed.startsWith('!');
        const language = isMetta ? 'metta' : 'narsese';

        const highlighted = NarseseHighlighter.highlight(text, language);
        this.backdrop.innerHTML = highlighted + (text.endsWith('\n') ? '<br>&nbsp;' : '');
        this.value = text;

        if (text.length > 0) {
            this.textarea.classList.add('highlight-mode');
        } else {
            this.textarea.classList.remove('highlight-mode');
        }

        this.updateBrackets();
    }

    updateBrackets() {
        const text = this.textarea.value;
        const cursor = this.textarea.selectionStart;

        // Check if cursor is next to a bracket
        let matchIndex = -1;
        let selfIndex = -1;

        // Check character before cursor
        const before = text[cursor - 1];
        if (SmartTextarea.PAIRS[before]) {
            selfIndex = cursor - 1;
            matchIndex = this.findMatch(text, selfIndex);
        } else {
            // Check character after cursor
            const after = text[cursor];
            if (SmartTextarea.PAIRS[after]) {
                selfIndex = cursor;
                matchIndex = this.findMatch(text, selfIndex);
            }
        }

        if (matchIndex !== -1) {
            this.renderBracketHighlight(text, selfIndex, matchIndex);
        } else {
            this.bracketLayer.innerHTML = '';
        }
    }

    findMatch(text, index) {
        const char = text[index];
        const pairs = { '(': ')', '{': '}', '[': ']' };
        const reversePairs = { ')': '(', '}': '{', ']': '[' };

        if (pairs[char]) {
            // Opening bracket - search forward
            let depth = 1;
            for (let i = index + 1; i < text.length; i++) {
                if (text[i] === char) depth++;
                else if (text[i] === pairs[char]) depth--;

                if (depth === 0) return i;
            }
        } else if (reversePairs[char]) {
            // Closing bracket - search backward
            let depth = 1;
            for (let i = index - 1; i >= 0; i--) {
                if (text[i] === char) depth++;
                else if (text[i] === reversePairs[char]) depth--;

                if (depth === 0) return i;
            }
        }
        return -1;
    }

    renderBracketHighlight(text, idx1, idx2) {
        const html = text.split('').map((char, i) => {
            if (char === '<') char = '&lt;';
            else if (char === '>') char = '&gt;';
            else if (char === '&') char = '&amp;';

            return (i === idx1 || i === idx2)
                ? `<span class="bracket-match">${char}</span>`
                : char;
        }).join('');

        this.bracketLayer.innerHTML = html + (text.endsWith('\n') ? '<br>&nbsp;' : '');
    }

    syncScroll() {
        this.backdrop.scrollTop = this.textarea.scrollTop;
        this.backdrop.scrollLeft = this.textarea.scrollLeft;
        this.bracketLayer.scrollTop = this.textarea.scrollTop;
        this.bracketLayer.scrollLeft = this.textarea.scrollLeft;
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

SmartTextarea.PAIRS = { '(': ')', ')': '(', '{': '}', '}': '{', '[': ']', ']': '[' };
