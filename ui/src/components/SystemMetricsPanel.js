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
        this.els = {};
        this.initialized = false;
    }

    initialize() {
        if (this.initialized || !this.container) return;
        this.render();
        this.initialized = true;
    }

    update(metrics = {}) {
        const {
            performance: perf = {},
            resourceUsage: res = {},
            taskProcessing: proc = {},
            reasoningSteps: steps = 0,
            uptime = 0
        } = metrics;

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

        this.updateView();
    }

    render() {
        if (!this.container) return;

        // Add styles once
        if (!this.container.querySelector('style')) {
            const style = document.createElement('style');
            style.textContent = `
                @keyframes heartbeat { 0% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.2); opacity: 1; text-shadow: 0 0 5px red; } 100% { transform: scale(1); opacity: 0.8; } }
                .beating { animation: heartbeat 1s infinite; }
                .metric-heart { font-size: 1.2em; margin-right: 5px; color: #ff4444; }
            `;
            this.container.appendChild(style);
        }

        const grid = document.createElement('div');
        grid.className = 'metrics-grid';
        grid.innerHTML = `
            <div class="metric-item">
                <span class="metric-heart">♥</span><span class="metric-label">Heartbeat</span>
            </div>
            <div class="metric-item">
                <span class="metric-label">Throughput</span><span class="metric-value"><span id="sm-throughput">0.00</span> <small>ops/s</small></span>
            </div>
            <div class="metric-item">
                <span class="metric-label">Memory</span>
                <div class="progress-bar"><div class="progress-fill" id="sm-memory-bar" style="width: 0%"></div></div>
                <span class="metric-sub" id="sm-memory-text">0.0%</span>
            </div>
            <div class="metric-item">
                <span class="metric-label">Success Rate</span><span class="metric-value" id="sm-success">0.0%</span>
            </div>
             <div class="metric-item">
                <span class="metric-label">Avg Latency</span><span class="metric-value"><span id="sm-latency">0.00</span> <small>ms</small></span>
            </div>
            <div class="metric-item full-width">
                <span class="metric-label">Throughput History</span>
                <svg width="100%" height="30" viewBox="0 0 50 30" preserveAspectRatio="none" style="background: rgba(0,0,0,0.2); border: 1px solid #333;">
                    <path id="sm-sparkline" d="" fill="none" stroke="#00ff9d" stroke-width="1" />
                </svg>
            </div>
            <div class="metric-item full-width" style="display: flex; justify-content: space-between;">
                <span><span class="metric-label">Uptime</span> <span class="metric-value" id="sm-uptime">0s</span></span>
            </div>
        `;

        // Clear previous grid if any (re-rendering case)
        const oldGrid = this.container.querySelector('.metrics-grid');
        if (oldGrid) oldGrid.remove();

        this.container.appendChild(grid);

        // Cache elements
        this.els = {
            heart: grid.querySelector('.metric-heart'),
            throughput: grid.querySelector('#sm-throughput'),
            memoryBar: grid.querySelector('#sm-memory-bar'),
            memoryText: grid.querySelector('#sm-memory-text'),
            success: grid.querySelector('#sm-success'),
            latency: grid.querySelector('#sm-latency'),
            sparkline: grid.querySelector('#sm-sparkline'),
            uptime: grid.querySelector('#sm-uptime')
        };
    }

    updateView() {
        if (!this.initialized) this.render();
        if (!this.els.throughput) return; // Guard

        const { throughput, memoryUtilization, successRate, avgLatency, uptime } = this.metrics;
        const memory = (memoryUtilization * 100).toFixed(1);

        this.els.throughput.textContent = throughput.toFixed(2);

        if (throughput > 0) this.els.heart.classList.add('beating');
        else this.els.heart.classList.remove('beating');

        this.els.memoryBar.style.width = `${memory}%`;
        this.els.memoryBar.className = `progress-fill ${this.getMemoryColor(memoryUtilization)}`;
        this.els.memoryText.textContent = `${memory}%`;

        this.els.success.textContent = `${(successRate * 100).toFixed(1)}%`;
        this.els.latency.textContent = avgLatency.toFixed(2);

        this.els.sparkline.setAttribute('d', this.generateSparklinePath(this.history));
        this.els.uptime.textContent = `${Math.floor(uptime / 1000)}s`;
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
