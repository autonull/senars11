import { Component } from '../Component.js';
import Chart from 'chart.js/auto';

export class ChartWidget extends Component {
    constructor(container, config = {}) {
        super(container);
        this.config = config;
        this.chart = null;
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';
        this.container.style.cssText = 'position: relative; height: 250px; width: 100%; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 4px;';

        const canvas = document.createElement('canvas');
        this.container.appendChild(canvas);

        const ctx = canvas.getContext('2d');

        // Default cyberpunk config
        const defaultConfig = {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Metric',
                    data: [],
                    borderColor: '#00ff9d',
                    backgroundColor: 'rgba(0, 255, 157, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#d4d4d4', font: { family: 'monospace' } }
                    }
                },
                scales: {
                    x: {
                        grid: { color: '#333' },
                        ticks: { color: '#888', font: { family: 'monospace' } }
                    },
                    y: {
                        grid: { color: '#333' },
                        ticks: { color: '#888', font: { family: 'monospace' } }
                    }
                },
                animation: false
            }
        };

        const finalConfig = this._deepMerge(defaultConfig, this.config);

        this.chart = new Chart(ctx, finalConfig);
    }

    _deepMerge(target, source) {
        if (typeof source !== 'object' || source === null) {
            return source;
        }

        const result = Array.isArray(target) ? [...target] : { ...target };

        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                    result[key] = this._deepMerge(result[key] || {}, source[key]);
                } else {
                    result[key] = source[key];
                }
            }
        }
        return result;
    }

    updateData(label, value, datasetIndex = 0) {
        if (!this.chart) return;

        const data = this.chart.data;

        // Add new label
        data.labels.push(label);

        // Add new data point
        if (data.datasets[datasetIndex]) {
            data.datasets[datasetIndex].data.push(value);
        }

        // Keep only last 50 points
        if (data.labels.length > 50) {
            data.labels.shift();
            data.datasets.forEach(ds => ds.data.shift());
        }

        this.chart.update('none'); // 'none' for performance
    }
}
