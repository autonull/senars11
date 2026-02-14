import { ReasoningSettingsPanel } from '../components/ReasoningSettingsPanel.js';

export class ExplorerInfoPanel {
    constructor(container) {
        this.container = container;
        this.settingsPanel = null;
        this.statsContent = null;
        this.activeTab = 'stats';
    }

    initialize() {
        this.render();
    }

    render() {
        if (!this.container) return;

        const el = document.createElement('div');
        el.className = 'info-panel';
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
        el.style.height = '100%';

        // Header
        const header = document.createElement('h3');
        header.textContent = 'Explorer Info';
        header.style.marginBottom = '10px';
        el.appendChild(header);

        // Tabs
        const tabs = document.createElement('div');
        tabs.className = 'panel-tabs';
        tabs.style.display = 'flex';
        tabs.style.marginBottom = '10px';
        tabs.style.borderBottom = '1px solid #444';

        const createTab = (id, label) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.style.flex = '1';
            btn.style.background = 'transparent';
            btn.style.border = 'none';
            btn.style.color = '#888';
            btn.style.padding = '5px';
            btn.style.cursor = 'pointer';

            if (this.activeTab === id) {
                btn.style.color = '#00ff9d';
                btn.style.borderBottom = '2px solid #00ff9d';
            }

            btn.onclick = () => {
                this.activeTab = id;
                this.render(); // Re-render whole panel (simple)
            };
            tabs.appendChild(btn);
        };

        createTab('stats', 'Stats');
        createTab('settings', 'Visuals');
        el.appendChild(tabs);

        // Content Area
        const content = document.createElement('div');
        content.style.flex = '1';
        content.style.overflowY = 'auto';

        if (this.activeTab === 'stats') {
            this.statsContent = document.createElement('div');
            this.statsContent.innerHTML = '<div style="color: #666; font-style: italic;">Waiting for stats...</div>';
            content.appendChild(this.statsContent);
        } else if (this.activeTab === 'settings') {
            const settingsContainer = document.createElement('div');
            this.settingsPanel = new ReasoningSettingsPanel(settingsContainer);
            this.settingsPanel.render();
            content.appendChild(settingsContainer);
        }

        el.appendChild(content);

        this.container.innerHTML = '';
        this.container.appendChild(el);
    }

    updateStats(stats) {
        if (!this.statsContent || this.activeTab !== 'stats') return;

        this.statsContent.innerHTML = `
            <div style="margin-bottom: 8px;">
                <div style="color: #aaa; font-size: 11px;">CYCLES</div>
                <div style="color: #00ff9d; font-size: 14px;">${stats.cycles}</div>
            </div>
            <div style="margin-bottom: 8px;">
                <div style="color: #aaa; font-size: 11px;">CONCEPTS (Active/Total)</div>
                <div style="color: #00d4ff; font-size: 14px;">${stats.activeNodes} / ${stats.nodes}</div>
            </div>
            <div style="margin-bottom: 8px;">
                <div style="color: #aaa; font-size: 11px;">TPS</div>
                <div style="color: #ffcc00; font-size: 14px;">${stats.tps}</div>
            </div>
        `;
    }
}
