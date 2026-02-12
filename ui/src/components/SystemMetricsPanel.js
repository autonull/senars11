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

        this.history.push(this.metrics.throughput);
        if (this.history.length > 50) this.history.shift();

        this.updateView();
    }

    render() {
        if (!this.container) return;

        this.fluent().clear();

        const grid = FluentUI.create('div')
            .class('metrics-grid')
            .mount(this.container);

        // 1. Heartbeat
        this.ui.heart = FluentUI.create('span').class('metric-heart').text('♥');
        grid.child(FluentUI.create('div').class('metric-item').child(this.ui.heart).child(FluentUI.create('span').class('metric-label').text('Heartbeat')));

        // 2. Throughput
        this.ui.throughput = FluentUI.create('span').id('sm-throughput').text('0.00');
        grid.child(
            FluentUI.create('div').class('metric-item')
                .child(FluentUI.create('span').class('metric-label').text('Throughput'))
                .child(
                    FluentUI.create('span').class('metric-value')
                        .child(this.ui.throughput)
                        .child(FluentUI.create('small').text(' ops/s'))
                )
        );

        // 3. Memory
        this.ui.memoryBar = FluentUI.create('div').class('progress-fill').id('sm-memory-bar');
        this.ui.memoryText = FluentUI.create('span').class('metric-sub').id('sm-memory-text').text('0.0%');
        grid.child(
            FluentUI.create('div').class('metric-item')
                .child(FluentUI.create('span').class('metric-label').text('Memory'))
                .child(FluentUI.create('div').class('progress-bar').child(this.ui.memoryBar))
                .child(this.ui.memoryText)
        );

        // 4. Success Rate
        this.ui.success = FluentUI.create('span').class('metric-value').id('sm-success').text('0.0%');
        grid.child(
            FluentUI.create('div').class('metric-item')
                .child(FluentUI.create('span').class('metric-label').text('Success Rate'))
                .child(this.ui.success)
        );

        // 5. Avg Latency
        this.ui.latency = FluentUI.create('span').id('sm-latency').text('0.00');
        grid.child(
            FluentUI.create('div').class('metric-item')
                .child(FluentUI.create('span').class('metric-label').text('Avg Latency'))
                .child(
                    FluentUI.create('span').class('metric-value')
                        .child(this.ui.latency)
                        .child(FluentUI.create('small').text(' ms'))
                )
        );

        // 6. Throughput History (Sparkline)
        this.ui.sparkline = FluentUI.create('path').id('sm-sparkline').attr({ d: '', fill: 'none', stroke: '#00ff9d', 'stroke-width': '1' });

        // Note: SVG must be created with correct namespace usually, but browsers often handle it if inserted via innerHTML or createElementNS
        // FluentUI uses createElement, which might fail for SVG if not NS aware.
        // Let's modify FluentUI or use helper. FluentUI doesn't support NS yet.
        // We will create SVG manually and wrap it or just use innerHTML for the SVG part to be safe and quick.

        const svgContainer = FluentUI.create('div').class('metric-item full-width')
            .child(FluentUI.create('span').class('metric-label').text('Throughput History'))
            .mount(grid);

        svgContainer.dom.innerHTML += `<svg width="100%" height="30" viewBox="0 0 50 30" preserveAspectRatio="none" class="sparkline-svg">
            <path id="sm-sparkline" d="" fill="none" stroke="#00ff9d" stroke-width="1" />
        </svg>`;
        this.ui.sparkline = { dom: svgContainer.dom.querySelector('#sm-sparkline') }; // Manual binding

        // 7. Uptime
        this.ui.uptime = FluentUI.create('span').class('metric-value').id('sm-uptime').text('0s');
        grid.child(
            FluentUI.create('div').class('metric-item full-width')
                .style({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' })
                .child(FluentUI.create('span').class('metric-label').text('Uptime'))
                .child(this.ui.uptime)
        );
    }

    updateView() {
        if (!this.initialized) this.render();
        if (!this.ui.throughput) return;

        const { throughput, memoryUtilization, successRate, avgLatency, uptime } = this.metrics;
        const memory = (memoryUtilization * 100).toFixed(1);

        this.ui.throughput.text(throughput.toFixed(2));

        if (throughput > 0) this.ui.heart.addClass('beating');
        else this.ui.heart.removeClass('beating');

        this.ui.memoryBar.style({ width: `${memory}%` }).class(`progress-fill ${this.getMemoryColor(memoryUtilization)}`);
        this.ui.memoryText.text(`${memory}%`);

        this.ui.success.text(`${(successRate * 100).toFixed(1)}%`);
        this.ui.latency.text(avgLatency.toFixed(2));

        if (this.ui.sparkline && this.ui.sparkline.dom) {
            this.ui.sparkline.dom.setAttribute('d', this.generateSparklinePath(this.history));
        }

        this.ui.uptime.text(`${Math.floor(uptime / 1000)}s`);
    }

    generateSparklinePath(data) {
        if (data.length < 2) return '';
        const max = Math.max(...data, 10);
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
