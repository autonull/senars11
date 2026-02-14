/**
 * Manages the autocomplete popup for the SmartTextarea
 */
export class AutocompleteManager {
    constructor(textarea, wrapper) {
        this.textarea = textarea;
        this.wrapper = wrapper;
        this.suggestions = [
            // Narsese
            { label: '-->', type: 'relation', info: 'Inheritance' },
            { label: '<->', type: 'relation', info: 'Similarity' },
            { label: '==>', type: 'relation', info: 'Implication' },
            { label: '<=>', type: 'relation', info: 'Equivalence' },
            { label: '{--', type: 'relation', info: 'Instance' },
            { label: '--]', type: 'relation', info: 'Property' },
            { label: '(&&,', type: 'connector', info: 'Conjunction' },
            { label: '(||,', type: 'connector', info: 'Disjunction' },
            { label: '(&/,', type: 'connector', info: 'Sequence' },
            { label: '(|/,', type: 'connector', info: 'Parallel' },
            { label: '^op', type: 'operator', info: 'Operator' },
            // MeTTa
            { label: 'match', type: 'keyword', info: 'Pattern Matching' },
            { label: 'superpose', type: 'keyword', info: 'Superposition' },
            { label: 'let', type: 'keyword', info: 'Variable Binding' },
            { label: 'let*', type: 'keyword', info: 'Sequential Binding' },
            { label: 'type', type: 'keyword', info: 'Type Definition' },
            { label: '->', type: 'keyword', info: 'Function Type' },
            { label: '!', type: 'keyword', info: 'Execution' },
            { label: 'import!', type: 'keyword', info: 'Import Module' },
            { label: 'bind!', type: 'keyword', info: 'Bind Token' },
            { label: 'get-type', type: 'keyword', info: 'Get Atom Type' },
            { label: 'assertEqual', type: 'keyword', info: 'Assertion' }
        ];

        this.element = document.createElement('div');
        this.element.className = 'autocomplete-popup';
        this.element.style.cssText = `
            position: absolute;
            display: none;
            flex-direction: column;
            background: #252526;
            border: 1px solid #454545;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            z-index: 100;
            max-height: 200px;
            overflow-y: auto;
            border-radius: 4px;
            min-width: 150px;
        `;

        // Append to body or wrapper?
        // If wrapper has overflow:hidden, body is safer, but positioning is harder.
        // SmartTextarea wrapper has overflow:hidden (for backdrop).
        // So we must append to body or a parent.
        document.body.appendChild(this.element);

        this.selectedIndex = 0;
        this.matched = [];
        this.currentWord = '';
        this.isVisible = false;

        this.measureDiv = document.createElement('div');
        this.measureDiv.style.cssText = `
            position: absolute; visibility: hidden; pointer-events: none;
            white-space: pre-wrap; word-wrap: break-word;
            font-family: monospace; font-size: 13px; line-height: 1.5;
            padding: 8px; border: 1px solid transparent;
        `;
        document.body.appendChild(this.measureDiv);
    }

    destroy() {
        this.element.remove();
        this.measureDiv.remove();
    }

    onInput(e) {
        const text = this.textarea.value;
        const cursorPos = this.textarea.selectionEnd;

        // Find word boundary
        // Look back from cursor
        const left = text.slice(0, cursorPos);
        const match = left.match(/([a-zA-Z0-9_\-\>\<\=\!\&\^\|\*]+)$/);

        if (match) {
            this.currentWord = match[1];
            if (this.currentWord.length >= 1) {
                this.show(this.currentWord, cursorPos);
                return;
            }
        }
        this.hide();
    }

    onKeyDown(e) {
        if (!this.isVisible) return false;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedIndex = (this.selectedIndex + 1) % this.matched.length;
            this.renderList();
            return true;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedIndex = (this.selectedIndex - 1 + this.matched.length) % this.matched.length;
            this.renderList();
            return true;
        } else if (e.key === 'Tab' || e.key === 'Enter') {
            e.preventDefault();
            this.insert();
            return true;
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.hide();
            return true;
        }
        return false;
    }

    show(prefix, cursorPos) {
        this.matched = this.suggestions.filter(s => s.label.startsWith(prefix) && s.label !== prefix);
        if (this.matched.length === 0) {
            this.hide();
            return;
        }

        this.selectedIndex = 0;
        this.renderList();
        this.updatePosition(cursorPos);
        this.isVisible = true;
        this.element.style.display = 'flex';
    }

    hide() {
        this.isVisible = false;
        this.element.style.display = 'none';
    }

    renderList() {
        this.element.innerHTML = '';
        this.matched.forEach((item, index) => {
            const div = document.createElement('div');
            div.style.cssText = `
                padding: 4px 8px; cursor: pointer; display: flex; align-items: center; gap: 8px;
                background: ${index === this.selectedIndex ? '#094771' : 'transparent'};
                color: #ccc; font-family: monospace; font-size: 12px;
            `;

            const icon = document.createElement('span');
            icon.textContent = this._getIcon(item.type);
            div.appendChild(icon);

            const label = document.createElement('span');
            label.textContent = item.label;
            label.style.flex = '1';

            // Highlight match
            // label.innerHTML = `<strong>${this.currentWord}</strong>${item.label.substring(this.currentWord.length)}`;

            div.appendChild(label);

            const info = document.createElement('span');
            info.textContent = item.info;
            info.style.color = '#666';
            info.style.fontSize = '10px';
            div.appendChild(info);

            div.onmousedown = (e) => {
                e.preventDefault(); // Prevent blur
                this.selectedIndex = index;
                this.insert();
            };

            this.element.appendChild(div);
        });

        // Auto-scroll
        const selected = this.element.children[this.selectedIndex];
        if (selected) {
            if (selected.offsetTop < this.element.scrollTop) {
                this.element.scrollTop = selected.offsetTop;
            } else if (selected.offsetTop + selected.offsetHeight > this.element.scrollTop + this.element.offsetHeight) {
                this.element.scrollTop = selected.offsetTop + selected.offsetHeight - this.element.offsetHeight;
            }
        }
    }

    _getIcon(type) {
        const icons = {
            relation: '🔗',
            keyword: '🔑',
            connector: '⚪',
            operator: '⚙️'
        };
        return icons[type] || '📄';
    }

    insert() {
        if (!this.matched[this.selectedIndex]) return;
        const completion = this.matched[this.selectedIndex].label;

        const text = this.textarea.value;
        const cursorPos = this.textarea.selectionEnd;
        const prefixLen = this.currentWord.length;

        const before = text.substring(0, cursorPos - prefixLen);
        const after = text.substring(cursorPos);

        this.textarea.value = before + completion + after;

        // Reset cursor
        const newCursorPos = before.length + completion.length;
        this.textarea.setSelectionRange(newCursorPos, newCursorPos);

        this.hide();

        // Trigger input event to update highlighter
        this.textarea.dispatchEvent(new Event('input'));
        this.textarea.focus();
    }

    updatePosition(cursorPos) {
        // Calculate coordinates
        // 1. Copy styles
        const styles = window.getComputedStyle(this.textarea);
        ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'padding', 'border', 'width'].forEach(prop => {
            this.measureDiv.style[prop] = styles[prop];
        });
        this.measureDiv.style.width = this.textarea.clientWidth + 'px';

        // 2. Set content up to cursor
        const text = this.textarea.value.substring(0, cursorPos);
        const span = document.createElement('span');
        span.textContent = '|';

        this.measureDiv.innerHTML = text.replace(/\n/g, '<br>') // Simple replace might be buggy with whitespace
            .replace(/ /g, '&nbsp;'); // And spaces

        // Better: TextNode
        this.measureDiv.textContent = text;
        this.measureDiv.appendChild(span);

        // 3. Get coordinates
        const rect = this.textarea.getBoundingClientRect();
        const spanRect = span.getBoundingClientRect(); // This gives pos relative to viewport because measureDiv is absolute

        // Wait, measureDiv is invisible and somewhere in body.
        // We need measureDiv to match textarea position?
        // No, we just need offset inside measureDiv

        const measureRect = this.measureDiv.getBoundingClientRect();
        const left = span.offsetLeft;
        const top = span.offsetTop;

        // Position popup
        // It should be relative to textarea on screen
        this.element.style.left = (rect.left + left) + 'px';
        this.element.style.top = (rect.top + top + parseInt(styles.lineHeight || 20)) + 'px';
    }
}
