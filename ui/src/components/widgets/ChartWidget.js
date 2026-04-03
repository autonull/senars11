import { Component } from '../Component.js';
import Chart from 'chart.js/auto';
import { deepMerge } from '../../../core/src/util/object.js';

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
        const finalConfig = deepMerge(this._getDefaultConfig(), this.config);
        this.chart = new Chart(ctx, finalConfig);
    }

    _getDefaultConfig() {
        return {
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
