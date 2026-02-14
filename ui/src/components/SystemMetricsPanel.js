import { Component } from './Component.js';
import { FluentUI } from '../utils/FluentUI.js';

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
        this.ui = {};
        this.initialized = false;
    }

    initialize() {
        if (this.initialized) return;
        // If container exists (passed in constructor), render.
        // If not, render will be called by mount() later.
        if (this.container) {
            this.render();
        }
        this.initialized = true;
    }

    render() {
        if (!this.container) return;

        // Note: Container ID and class are now managed by HUDWidget/HUDLayoutManager
        // We just render the content grid

        const grid = FluentUI.create(this.container)
            .clear()
            .child(FluentUI.create('div').class('metrics-grid'));

        // 1. Throughput (TPS)
        this.ui.throughput = FluentUI.create('span').class('metric-val-mono').text('0.00');
        grid.child(
            FluentUI.create('div').class('metric-compact')
                .child(FluentUI.create('span').class('metric-label-small').text('TPS'))
                .child(this.ui.throughput)
        );

        // 2. Memory (MEM)
        this.ui.memoryBar = FluentUI.create('div').class('progress-fill').style({ width: '0%' });
        this.ui.memoryText = FluentUI.create('span').class('metric-val-mono').text('0%');

        grid.child(
            FluentUI.create('div').class('metric-compact')
                .child(FluentUI.create('span').class('metric-label-small').text('MEM'))
                .child(
                    FluentUI.create('div').class('mini-progress-track')
                        .child(this.ui.memoryBar)
                )
                .child(this.ui.memoryText)
        );

        // 3. Success (ACC)
        this.ui.success = FluentUI.create('span').class('metric-val-mono').text('0%');
        grid.child(
            FluentUI.create('div').class('metric-compact')
                .child(FluentUI.create('span').class('metric-label-small').text('ACC'))
                .child(this.ui.success)
        );

        // 4. Latency (LAT)
        this.ui.latency = FluentUI.create('span').class('metric-val-mono').text('0.00');
        grid.child(
            FluentUI.create('div').class('metric-compact')
                .child(FluentUI.create('span').class('metric-label-small').text('LAT'))
                .child(this.ui.latency)
                .child(FluentUI.create('span').class('metric-unit').text('ms'))
        );

        // 5. Uptime (UP)
        this.ui.uptime = FluentUI.create('span').class('metric-val-mono').text('0s');
        grid.child(
            FluentUI.create('div').class('metric-compact')
                .child(FluentUI.create('span').class('metric-label-small').text('UP'))
                .child(this.ui.uptime)
        );

        // 6. Detailed Graph (Replacing simple sparkline)
        const graphContainer = FluentUI.create('div').class('metric-graph-container')
            .mount(grid);

        // Expand grid span for graph
        graphContainer.style({ gridColumn: '1 / -1', height: '40px', marginTop: '4px' });

        graphContainer.html(`
            <svg width="100%" height="100%" viewBox="0 0 300 100" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="tps-gradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stop-color="rgba(0, 255, 157, 0.5)"/>
                        <stop offset="100%" stop-color="rgba(0, 255, 157, 0.0)"/>
                    </linearGradient>
                </defs>
                <path id="sm-graph-area" d="" fill="url(#tps-gradient)" />
                <path id="sm-graph-line" d="" fill="none" stroke="#00ff9d" stroke-width="1.5" />
                <text x="2" y="36" fill="#666" font-size="9" font-family="monospace">TPS History</text>
            </svg>
        `);

        this.ui.graph = {
            line: graphContainer.dom.querySelector('#sm-graph-line'),
            area: graphContainer.dom.querySelector('#sm-graph-area')
        };

        // Heartbeat Indicator
        this.ui.heartbeat = FluentUI.create('div').class('metric-heart-indicator')
            .style({ width: '6px', height: '6px', borderRadius: '50%', background: '#00ff9d', marginLeft: 'auto', marginRight: '4px', opacity: '0.2' });

        // Inject heartbeat into TPS container
        const tpsContainer = this.ui.throughput.dom.parentNode;
        tpsContainer.insertBefore(this.ui.heartbeat.dom, this.ui.throughput.dom);
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

        this.history.push(this.metrics.throughput);
        if (this.history.length > 50) this.history.shift();

        this.updateView();
    }

    updateView() {
        if (!this.container && !this.initialized) return;
        // If rendered but references lost or not created yet
        if (!this.ui.throughput) this.render();
        if (!this.ui.throughput) return;

        const { throughput, memoryUtilization, successRate, avgLatency, uptime } = this.metrics;
        const memory = (memoryUtilization * 100).toFixed(1);

        this.ui.throughput.text(throughput.toFixed(1));

        // Heartbeat animation logic
        if (throughput > 0.1) {
            this.ui.heartbeat.class('metric-heart-indicator beating');
            this.ui.heartbeat.style({ opacity: '1', boxShadow: '0 0 5px #00ff9d' });
        } else {
            this.ui.heartbeat.class('metric-heart-indicator');
            this.ui.heartbeat.style({ opacity: '0.2', boxShadow: 'none' });
        }

        this.ui.memoryBar.style({ width: `${memory}%` });
        if (memoryUtilization > 0.8) this.ui.memoryBar.class('progress-fill danger');
        else if (memoryUtilization > 0.6) this.ui.memoryBar.class('progress-fill warning');
        else this.ui.memoryBar.class('progress-fill success');

        this.ui.memoryText.text(`${Math.round(memory)}%`);

        this.ui.success.text(`${Math.round(successRate * 100)}%`);
        this.ui.latency.text(avgLatency.toFixed(1));
        this.ui.uptime.text(`${Math.floor(uptime / 1000)}s`);

        if (this.ui.graph && this.ui.graph.line) {
            const { linePath, areaPath } = this.generateGraphPaths(this.history);
            this.ui.graph.line.setAttribute('d', linePath);
            this.ui.graph.area.setAttribute('d', areaPath);
        }
    }

    generateGraphPaths(data) {
        if (data.length < 2) return { linePath: '', areaPath: '' };

        // Dynamic scale
        const max = Math.max(...data, 10) * 1.1;
        const width = 100; // Percentage logic handled by SVG viewbox if defined, here we assume arbitrary units mapped to 100% via CSS?
        // Actually, SVG usually needs explicit units. The previous code used explicit width 80.
        // Let's use 100 coordinate space for simplicity and rely on preserveAspectRatio="none"

        const h = 100; // coordinate height
        const w = 300; // coordinate width (higher res)

        const points = data.map((val, i) => {
            const x = (i / (data.length - 1)) * w;
            const y = h - (val / max) * h;
            return { x, y };
        });

        const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`;

        return { linePath, areaPath };
    }
}
