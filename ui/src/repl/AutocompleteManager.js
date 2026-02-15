import { AUTOCOMPLETE_SUGGESTIONS } from './AutocompleteSuggestions.js';

/**
 * Manages the autocomplete popup for the SmartTextarea
 */
export class AutocompleteManager {
    constructor(textarea, wrapper) {
        this.textarea = textarea;
        this.wrapper = wrapper;
        this.suggestions = AUTOCOMPLETE_SUGGESTIONS;

        this.element = document.createElement('div');
        this.element.className = 'autocomplete-popup';
        this.element.style.cssText = `
            position: fixed; /* Fixed works better with viewport coords from getBoundingClientRect */
            display: none;
            flex-direction: column;
            background: #252526;
            border: 1px solid #454545;
            box-shadow: 0 4px 10px rgba(0,0,0,0.5);
            z-index: 9999;
            max-height: 200px;
            overflow-y: auto;
            border-radius: 4px;
            min-width: 150px;
        `;

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
            box-sizing: border-box; /* Match textarea default */
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
        const left = text.slice(0, cursorPos);
        // Match standard chars + special chars used in Narsese/MeTTa identifiers
        // Narsese relations often start with < or -, so we include them
        const match = left.match(/([a-zA-Z0-9_\-\>\<\=\!\&\^\|\*\.\{\}]+)$/);

        if (match) {
            this.currentWord = match[1];
            // Show only if length >= 1 or specific chars
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
        // Simple filter
        this.matched = this.suggestions.filter(s => s.label.startsWith(prefix) && s.label !== prefix);

        // If no prefix match, maybe fuzzy? For now stick to prefix.

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
            // Highlight match part
            const matchPart = item.label.substring(0, this.currentWord.length);
            const restPart = item.label.substring(this.currentWord.length);
            label.innerHTML = `<strong style="color: #fff">${matchPart}</strong>${restPart}`;
            label.style.flex = '1';
            div.appendChild(label);

            const info = document.createElement('span');
            info.textContent = item.info;
            info.style.color = '#888';
            info.style.fontSize = '10px';
            div.appendChild(info);

            div.onmousedown = (e) => {
                e.preventDefault(); // Prevent blur
                this.selectedIndex = index;
                this.insert();
            };

            // Hover effect
            div.onmouseenter = () => {
                this.selectedIndex = index;
                this.renderList(); // Re-render to update background
            };

            this.element.appendChild(div);
        });

        // Auto-scroll
        const selected = this.element.children[this.selectedIndex];
        if (selected) {
            selected.scrollIntoView({ block: 'nearest' });
        }
    }

    _getIcon(type) {
        const icons = {
            relation: '🔗',
            keyword: '🔑',
            connector: '⚪',
            operator: '⚙️',
            type: '🇹',
            snippet: '✂️'
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

        const newCursorPos = before.length + completion.length;
        this.textarea.setSelectionRange(newCursorPos, newCursorPos);

        this.hide();
        this.textarea.dispatchEvent(new Event('input'));
        this.textarea.focus();
    }

    updatePosition(cursorPos) {
        // 1. Sync styles to measureDiv
        const styles = window.getComputedStyle(this.textarea);
        ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'padding', 'border', 'width', 'boxSizing'].forEach(prop => {
            this.measureDiv.style[prop] = styles[prop];
        });
        this.measureDiv.style.width = this.textarea.clientWidth + 'px';

        // 2. Set content up to cursor
        const text = this.textarea.value.substring(0, cursorPos);
        const span = document.createElement('span');
        span.textContent = '|'; // Marker

        // We need to exactly mimic how textarea renders text, including newlines
        // Note: textarea pre-wrap handling is subtle.
        this.measureDiv.textContent = text;
        this.measureDiv.appendChild(span);

        // 3. Get coordinates
        const rect = this.textarea.getBoundingClientRect(); // Viewport relative
        const spanRect = span.getBoundingClientRect(); // Viewport relative (because measureDiv is in body, but invisible?)
        // Wait, measureDiv is absolute top/left in body. If body is 0,0, then spanRect is relative to body.
        // But we want relative to textarea top/left.
        // Better way: use offsetLeft/Top of span relative to measureDiv.

        const markerLeft = span.offsetLeft;
        const markerTop = span.offsetTop;

        // Position popup
        // rect.left/top are viewport coords of textarea.
        // We add marker offset.
        // We also need to account for textarea scroll.
        const scrollLeft = this.textarea.scrollLeft;
        const scrollTop = this.textarea.scrollTop;

        let left = rect.left + markerLeft - scrollLeft;
        let top = rect.top + markerTop - scrollTop + parseInt(styles.lineHeight || 20);

        // Boundary checks (keep in viewport)
        if (left + 200 > window.innerWidth) left = window.innerWidth - 210;
        if (top + 200 > window.innerHeight) {
            // Show above if not enough space below
            top = rect.top + markerTop - scrollTop - this.element.offsetHeight;
        }

        this.element.style.left = `${left}px`;
        this.element.style.top = `${top}px`;
    }
}
