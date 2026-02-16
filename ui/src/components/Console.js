import {Component} from './Component.js';
import {LogViewer} from './LogViewer.js';
import {SuggestionEngine} from '../utils/SuggestionEngine.js';

/**
 * Console component that provides command input and log display functionality
 */
export class Console extends Component {
    constructor(containerId, inputId) {
        super(containerId);
        this.logViewer = new LogViewer(this.container);
        this.inputElement = document.getElementById(inputId);
        this.onInputCallback = null;
        this.suggestionEngine = new SuggestionEngine();
        this.suggestionBox = null;

        if (this.inputElement) {
            this._setupInputListeners();
            this._createSuggestionBox();
        }

        document.addEventListener('senars:concept:select', (e) => {
            if (e.detail?.concept?.term) {
                this.suggestionEngine.setContext('lastConcept', e.detail.concept.term);
            }
        });
    }

    _setupInputListeners() {
        this.inputElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = this.inputElement.value.trim();
                if (val) {
                    this.handleInput(val);
                    this.inputElement.value = '';
                    this._hideSuggestions();
                }
            } else if (e.key === 'Tab') {
                e.preventDefault();
                this._acceptTopSuggestion();
            } else if (e.key === 'ArrowUp') {
                // Future: navigate suggestions
            }
        });

        this.inputElement.addEventListener('input', () => {
            this._updateSuggestions();
        });

        this.inputElement.addEventListener('focus', () => this._updateSuggestions());
        // Blur handling is tricky with click events on suggestions, omitted for simplicity
    }

    _createSuggestionBox() {
        this.suggestionBox = document.createElement('div');
        this.suggestionBox.className = 'console-suggestions';
        this.suggestionBox.style.cssText = `
            position: absolute;
            bottom: 40px; /* Above input */
            left: 10px;
            background: var(--bg-panel);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            width: calc(100% - 20px);
            display: none;
            z-index: 100;
            box-shadow: 0 -4px 10px rgba(0,0,0,0.5);
        `;
        this.inputElement.parentElement.style.position = 'relative';
        this.inputElement.parentElement.appendChild(this.suggestionBox);
    }

    _updateSuggestions() {
        const val = this.inputElement.value;
        const suggestions = this.suggestionEngine.getSuggestions(val);

        if (suggestions.length > 0) {
            this.suggestionBox.innerHTML = '';
            suggestions.forEach(s => {
                const item = document.createElement('div');
                item.style.cssText = 'padding: 5px 10px; cursor: pointer; color: var(--text-muted); font-family: monospace; border-bottom: 1px solid rgba(255,255,255,0.05);';

                // Securely create content to prevent XSS and rendering issues with Narsese brackets
                const textSpan = document.createElement('span');
                textSpan.style.color = 'var(--accent-primary)';
                textSpan.textContent = s.text;

                const labelSpan = document.createElement('span');
                labelSpan.style.fontSize = '0.8em';
                labelSpan.style.opacity = '0.7';
                labelSpan.textContent = ` (${s.label})`;

                item.appendChild(textSpan);
                item.appendChild(labelSpan);

                item.addEventListener('click', () => {
                    this.inputElement.value = s.text;
                    this.inputElement.focus();
                    this._hideSuggestions();
                });
                item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.05)');
                item.addEventListener('mouseleave', () => item.style.background = 'transparent');
                this.suggestionBox.appendChild(item);
            });
            this.suggestionBox.style.display = 'block';
        } else {
            this._hideSuggestions();
        }
    }

    _hideSuggestions() {
        if (this.suggestionBox) this.suggestionBox.style.display = 'none';
    }

    _acceptTopSuggestion() {
        if (this.suggestionBox.style.display !== 'none' && this.suggestionBox.firstElementChild) {
            // Very hacky extraction of text, but works for prototype
            const textSpan = this.suggestionBox.firstElementChild.querySelector('span');
            if (textSpan) {
                this.inputElement.value = textSpan.textContent;
                this._hideSuggestions();
            }
        }
    }

    onInput(callback) {
        this.onInputCallback = callback;
    }

    handleInput(text) {
        this.logViewer.addLog(text, 'input');
        this.suggestionEngine.setContext('command', text);
        if (this.onInputCallback) {
            this.onInputCallback(text);
        }
    }

    log(content, type, icon) {
        this.logViewer.addLog(content, type, icon);
    }

    clear() {
        this.logViewer.clear();
    }
}
