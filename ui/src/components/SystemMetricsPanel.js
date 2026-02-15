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

        // Set container ID for docking system
        this.container.id = 'metrics-widget';
        this.container.className = 'hud-widget dock-right';

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

        // 6. Sparkline (Last)
        const svgContainer = FluentUI.create('div').class('metric-compact sparkline-container')
            .mount(grid);

        svgContainer.html(`<svg width="80" height="20" viewBox="0 0 80 20" preserveAspectRatio="none">
            <path id="sm-sparkline" d="" fill="none" stroke="#00ff9d" stroke-width="1.5" />
        </svg>`);

        this.ui.sparkline = { dom: svgContainer.dom.querySelector('#sm-sparkline') };
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

        this.ui.memoryBar.style({ width: `${memory}%` });
        if (memoryUtilization > 0.8) this.ui.memoryBar.class('progress-fill danger');
        else if (memoryUtilization > 0.6) this.ui.memoryBar.class('progress-fill warning');
        else this.ui.memoryBar.class('progress-fill success');

        this.ui.memoryText.text(`${Math.round(memory)}%`);

        this.ui.success.text(`${Math.round(successRate * 100)}%`);
        this.ui.latency.text(avgLatency.toFixed(1));
        this.ui.uptime.text(`${Math.floor(uptime / 1000)}s`);

        if (this.ui.sparkline && this.ui.sparkline.dom) {
            this.ui.sparkline.dom.setAttribute('d', this.generateSparklinePath(this.history));
        }
    }

    generateSparklinePath(data) {
        if (data.length < 2) return '';
        const max = Math.max(...data, 10);
        const width = 80;
        const height = 20;

        return data.map((val, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - (val / max) * height;
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        }).join(' ');
    }
}
