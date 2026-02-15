import { Component } from '../Component.js';
import { SystemMetricsPanel } from '../SystemMetricsPanel.js';

export class MetricsWidget extends Component {
    constructor(container, config = {}) {
        super(container);
        this.config = config;
        this.metricsPanel = null;
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = '';
        this.container.style.cssText = 'height: 300px; width: 100%; background: #111114; border: 1px solid var(--border-color); position: relative; border-radius: 4px; overflow: hidden;';

        const content = document.createElement('div');
        content.style.cssText = 'width: 100%; height: 100%; overflow-y: auto; padding: 10px;';
        this.container.appendChild(content);

        this.metricsPanel = new SystemMetricsPanel(content);

        // Initial render with zero/default data or provided config data
        this.metricsPanel.update(this.config.data || {});

        // If we want it to auto-update, we need a way to hook into the system stream.
        // Widgets usually just receive data updates via notebook cells or parent calls.
        // So we expose an update method.
    }

    updateData(data) {
        if (this.metricsPanel) {
            this.metricsPanel.update(data);
        }
    }
}
