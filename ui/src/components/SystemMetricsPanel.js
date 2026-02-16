import { Component } from './Component.js';

export class SystemMetricsPanel extends Component {
    constructor(containerId) {
        super(containerId);
        this.metrics = {
            throughput: 0,
            memoryUtilization: 0,
            successRate: 0,
            cycleCount: 0,
            avgLatency: 0
        };
        this.history = [];
    }

    update(metrics = {}) {
        const { performance: perf = {}, resourceUsage: res = {}, taskProcessing: proc = {}, reasoningSteps: steps = 0, uptime = 0 } = metrics;

        this.metrics = {
            throughput: perf.throughput ?? 0,
            memoryUtilization: res.heapTotal ? res.heapUsed / res.heapTotal : 0,
            successRate: proc.totalProcessed ? proc.successful / proc.totalProcessed : 0,
            cycleCount: steps,
            avgLatency: perf.avgLatency ?? 0,
            uptime
        };

        // Track throughput history (last 50 points)
        this.history.push(this.metrics.throughput);
        if (this.history.length > 50) this.history.shift();

        this.render();
    }

    render() {
        if (!this.container) return;
        const { throughput, memoryUtilization, successRate, avgLatency, uptime } = this.metrics;
        const memory = (memoryUtilization * 100).toFixed(1);
        const heartbeatClass = throughput > 0 ? 'beating' : '';

        // Add styles once
        if (!this.container.querySelector('style')) {
            this.container.innerHTML = `
                <style>
                    @keyframes heartbeat { 0% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.2); opacity: 1; text-shadow: 0 0 5px red; } 100% { transform: scale(1); opacity: 0.8; } }
                    .beating { animation: heartbeat 1s infinite; }
                    .metric-heart { font-size: 1.2em; margin-right: 5px; color: #ff4444; }
                </style>
                <div class="metrics-grid"></div>`;
        }

        this.container.querySelector('.metrics-grid').innerHTML = `
            <div class="metric-item">
                <span class="metric-heart ${heartbeatClass}">♥</span><span class="metric-label">Heartbeat</span>
            </div>
            <div class="metric-item">
                <span class="metric-label">Throughput</span><span class="metric-value">${throughput.toFixed(2)} <small>ops/s</small></span>
            </div>
            <div class="metric-item">
                <span class="metric-label">Memory</span>
                <div class="progress-bar"><div class="progress-fill ${this.getMemoryColor(memoryUtilization)}" style="width: ${memory}%"></div></div>
                <span class="metric-sub">${memory}%</span>
            </div>
            <div class="metric-item">
                <span class="metric-label">Success Rate</span><span class="metric-value">${(successRate * 100).toFixed(1)}%</span>
            </div>
             <div class="metric-item">
                <span class="metric-label">Avg Latency</span><span class="metric-value">${avgLatency.toFixed(2)} <small>ms</small></span>
            </div>
            <div class="metric-item full-width">
                <span class="metric-label">Throughput History</span>
                <svg width="100%" height="30" viewBox="0 0 50 30" preserveAspectRatio="none" style="background: rgba(0,0,0,0.2); border: 1px solid #333;">
                    <path d="${this.generateSparklinePath(this.history)}" fill="none" stroke="#00ff9d" stroke-width="1" />
                </svg>
            </div>
            <div class="metric-item full-width" style="display: flex; justify-content: space-between;">
                <span><span class="metric-label">Uptime</span> <span class="metric-value">${Math.floor(uptime / 1000)}s</span></span>
            </div>
        `;
    }

    generateSparklinePath(data) {
        if (data.length < 2) return '';
        const max = Math.max(...data, 10); // Ensure some height
        const width = 50;
        const height = 30;

        return data.map((val, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - (val / max) * height;
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        }).join(' ');
    }

    getMemoryColor(usage) {
        return usage > 0.8 ? 'danger' : usage > 0.6 ? 'warning' : 'success';
    }
}
