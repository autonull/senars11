export class ExplorerInfoPanel {
    constructor(container) {
        this.container = container;
        this.statsContent = null;
    }

    initialize() {
        this.render();
    }

    render() {
        if (!this.container) {return;}

        const el = document.createElement('div');
        el.className = 'info-panel';
        el.style.padding = '10px';
        el.style.color = '#ccc';
        el.style.fontSize = '12px';

        this.statsContent = document.createElement('div');
        this.statsContent.innerHTML = '<div style="color: #666; font-style: italic;">Waiting for stats...</div>';
        el.appendChild(this.statsContent);

        this.container.innerHTML = '';
        this.container.appendChild(el);
    }

    updateStats(stats) {
        if (!this.statsContent) {return;}

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
