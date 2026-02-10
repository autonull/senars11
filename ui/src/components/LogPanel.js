import { Component } from './Component.js';
import { NarseseHighlighter } from '../utils/NarseseHighlighter.js';

export class LogPanel extends Component {
    constructor(container) {
        super(container);
        this.logs = [];
        this.filter = {
            search: '',
            categories: {
                system: true,
                user: true,
                agent: true,
                error: true,
                success: true,
                warning: true
            }
        };
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="hud-panel log-panel-container">
                <div class="log-header">
                    <div class="log-controls">
                        <input type="text" id="log-search" placeholder="Filter..." class="control-input-small">
                        <div class="log-toggles">
                            <span class="log-toggle active" data-cat="system" title="System">SYS</span>
                            <span class="log-toggle active" data-cat="user" title="User">USR</span>
                            <span class="log-toggle active" data-cat="agent" title="Agent">AGI</span>
                            <span class="log-toggle active" data-cat="error" title="Errors">ERR</span>
                        </div>
                    </div>
                </div>
                <div id="log-panel" class="log-area">
                    <div id="log-content"></div>
                </div>
            </div>
        `;

        this._bindEvents();
    }

    _bindEvents() {
        // Search
        const searchInput = this.container.querySelector('#log-search');
        if (searchInput) {
            searchInput.oninput = (e) => {
                this.filter.search = e.target.value.toLowerCase();
                this._renderLogs();
            };
        }

        // Toggles
        this.container.querySelectorAll('.log-toggle').forEach(toggle => {
            toggle.onclick = (e) => {
                const cat = e.target.dataset.cat;
                this.filter.categories[cat] = !this.filter.categories[cat];
                e.target.classList.toggle('active', this.filter.categories[cat]);
                this._renderLogs();
            };
        });
    }

    addLog(message, type = 'info') {
        const entry = {
            id: Date.now() + Math.random(),
            timestamp: new Date().toLocaleTimeString(),
            message,
            type,
            raw: String(message)
        };

        this.logs.push(entry);
        // Keep max 1000 logs
        if (this.logs.length > 1000) this.logs.shift();

        this._appendLog(entry);
    }

    _appendLog(entry) {
        const content = this.container.querySelector('#log-content');
        if (!content) return;

        // Check filters
        if (!this._shouldShow(entry)) return;

        const el = this._createLogElement(entry);
        content.appendChild(el);
        this._scrollToBottom(content.parentNode);
    }

    _renderLogs() {
        const content = this.container.querySelector('#log-content');
        if (!content) return;

        content.innerHTML = '';
        const fragment = document.createDocumentFragment();

        this.logs.forEach(entry => {
            if (this._shouldShow(entry)) {
                fragment.appendChild(this._createLogElement(entry));
            }
        });

        content.appendChild(fragment);
        this._scrollToBottom(content.parentNode);
    }

    _scrollToBottom(container) {
        // If user is near bottom (within 50px), scroll to bottom.
        // Otherwise, do nothing (allow user to read history).
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;

        if (isNearBottom) {
            container.scrollTop = container.scrollHeight;
        }
    }

    _shouldShow(entry) {
        if (this.filter.search && !entry.raw.toLowerCase().includes(this.filter.search)) return false;

        // Map types to categories
        let cat = entry.type;
        if (cat === 'success') cat = 'system'; // Treat success as system unless explicit
        if (!this.filter.categories[cat] && this.filter.categories[cat] !== undefined) return false;

        return true;
    }

    _createLogElement(entry) {
        const div = document.createElement('div');
        div.className = `log-entry log-${entry.type}`;

        // Highlighting or Escaping
        let msg = entry.message;
        if (entry.type !== 'error' && (msg.includes('<') || msg.includes('-->') || msg.includes('$') || msg.includes('{'))) {
             // Highlighter performs its own escaping
             msg = NarseseHighlighter.highlight(msg);
        } else {
             // Standard escaping for other messages
             msg = this._escapeHtml(msg);
        }

        div.innerHTML = `<span>[${entry.timestamp}]</span> <span>${msg}</span>`;
        return div;
    }

    _escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    clear() {
        this.logs = [];
        const content = this.container.querySelector('#log-content');
        if (content) content.innerHTML = '';
    }
}
