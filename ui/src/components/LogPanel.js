import { Component } from './Component.js';
import { FluentUI, div, input, button, span } from '../utils/FluentUI.js';
import { SyntaxHighlighter } from '../utils/SyntaxHighlighter.js';

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

        // Clear container
        this.container.innerHTML = '';

        const panel = div({ class: 'hud-panel log-panel-container' }).mount(this.container);

        // Header
        const header = div({ class: 'log-header' }).mount(panel);
        const controls = div({ class: 'log-controls' }).mount(header);

        // Search
        input('text', { id: 'log-search', placeholder: 'Filter...', class: 'control-input-small' })
            .on('input', (e) => {
                this.filter.search = e.target.value.toLowerCase();
                this._renderLogs();
            })
            .mount(controls);

        // Toggles
        const toggles = div({ class: 'log-toggles' }).mount(controls);
        const createToggle = (cat, title, label) => {
            span({ class: 'log-toggle active', title, 'data-cat': cat })
                .text(label)
                .on('click', (e) => {
                    this.filter.categories[cat] = !this.filter.categories[cat];
                    e.target.classList.toggle('active', this.filter.categories[cat]);
                    this._renderLogs();
                })
                .mount(toggles);
        };

        createToggle('system', 'System', 'SYS');
        createToggle('user', 'User', 'USR');
        createToggle('agent', 'Agent', 'AGI');
        createToggle('error', 'Errors', 'ERR');

        // Actions
        const actions = div({ class: 'log-actions' }).mount(controls);

        button('📋', { id: 'btn-copy-logs', class: 'btn-icon small-btn', title: 'Copy to Clipboard' })
            .on('click', (e) => {
                const text = this.logs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.raw}`).join('\n');
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(text).then(() => {
                        const originalText = e.target.textContent;
                        e.target.textContent = '✓';
                        setTimeout(() => e.target.textContent = originalText, 1000);
                    });
                } else {
                    console.warn('Clipboard API not available');
                }
            })
            .mount(actions);

        button('🗑️', { id: 'btn-clear-logs', class: 'btn-icon small-btn', title: 'Clear Logs' })
            .on('click', () => this.clear())
            .mount(actions);

        // Log Area
        const logArea = div({ id: 'log-panel', class: 'log-area' }).mount(panel);
        this.logContent = div({ id: 'log-content' }).mount(logArea).dom;
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
        if (!this.logContent) return;

        // Check filters
        if (!this._shouldShow(entry)) return;

        const el = this._createLogElement(entry);
        this.logContent.appendChild(el);
        this._scrollToBottom(this.logContent.parentNode);
    }

    _renderLogs() {
        if (!this.logContent) return;

        this.logContent.innerHTML = '';
        const fragment = document.createDocumentFragment();

        this.logs.forEach(entry => {
            if (this._shouldShow(entry)) {
                fragment.appendChild(this._createLogElement(entry));
            }
        });

        this.logContent.appendChild(fragment);
        this._scrollToBottom(this.logContent.parentNode);
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
        // Use FluentUI to create element
        const entryDiv = div({ class: `log-entry log-${entry.type}` });

        // Timestamp
        span().text(`[${entry.timestamp}] `).mount(entryDiv);

        // Message
        let msg = entry.message;
        const msgSpan = span();

        if (entry.type !== 'error' && (msg.includes('<') || msg.includes('-->') || msg.includes('$') || msg.includes('{'))) {
             // Highlighter performs its own escaping and returns HTML string
             msgSpan.html(SyntaxHighlighter.highlight(msg));
        } else {
             // Standard text content handles escaping automatically
             msgSpan.text(msg);
        }
        msgSpan.mount(entryDiv);

        return entryDiv.dom;
    }

    clear() {
        this.logs = [];
        if (this.logContent) this.logContent.innerHTML = '';
    }
}
