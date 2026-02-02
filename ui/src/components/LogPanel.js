import { Component } from './Component.js';
import { DEMOS } from '../explorer/demos.js';
import { LMConfigDialog } from '../agent/LMConfigDialog.js';

export class LogPanel extends Component {
    constructor(container) {
        super(container);
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="hud-panel log-panel-container">
                 <div class="control-group top-controls">
                    <input type="text" id="search-input" placeholder="Search..." class="control-input">
                    <select id="demo-select" class="control-select">
                        <option value="" disabled selected>Load Demo...</option>
                    </select>
                    <button id="btn-clear" class="btn warning-btn">Clear</button>
                    <div class="divider"></div>
                    <button id="btn-llm-config" class="btn">LLM Config</button>
                    <div id="llm-status" class="status-indicator">Offline</div>
                </div>

                <div id="log-panel" class="log-area">
                    <div id="log-content"></div>
                    <div class="repl-container">
                        <span class="repl-prompt">&gt;</span>
                        <input type="text" id="repl-input" placeholder="Enter command or chat..." autocomplete="off">
                    </div>
                </div>
            </div>
        `;
    }
}
