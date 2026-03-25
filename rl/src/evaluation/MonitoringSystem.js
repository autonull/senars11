/**
 * Monitoring and Metrics Export System
 * Export training metrics to Prometheus, TensorBoard, Weights & Biases, and JSON
 */
import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const _fileURLToPath = fileURLToPath;
const __dirname_fixed = path.dirname(_fileURLToPath(import.meta.url));

const MONITOR_DEFAULTS = {
    enabled: true,
    logInterval: 10,
    exportFormat: 'json',
    exportDirectory: './logs',
    prometheus: {
        enabled: false,
        port: 9090,
        path: '/metrics'
    },
    tensorboard: {
        enabled: false,
        logDir: './tensorboard_logs'
    },
    wandb: {
        enabled: false,
        project: 'senars-rl',
        entity: null,
        tags: []
    },
    json: {
        enabled: true,
        filename: 'training_metrics.json',
        pretty: true
    }
};

/**
 * Base metrics exporter interface
 */
export class MetricsExporter extends Component {
    constructor(config = {}) {
        super(mergeConfig(MONITOR_DEFAULTS, config));
        this.metrics = new Map();
        this.history = [];
        this.startTime = null;
    }

    async onInitialize() {
        this.startTime = Date.now();
        await this._setupExporters();
    }

    async _setupExporters() {
        // Override in subclasses
    }

    /**
     * Record a metric value
     * @param {string} name - Metric name
     * @param {number} value - Metric value
     * @param {object} labels - Optional labels for the metric
     */
    record(name, value, labels = {}) {
        const key = this._makeKey(name, labels);
        const timestamp = Date.now() - this.startTime;

        if (!this.metrics.has(key)) {
            this.metrics.set(key, {
                name,
                labels,
                values: [],
                timestamps: []
            });
        }

        const metric = this.metrics.get(key);
        metric.values.push(value);
        metric.timestamps.push(timestamp);

        this.history.push({ name, value, labels, timestamp, wallTime: Date.now() });
    }

    _makeKey(name, labels) {
        const labelStr = Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join(',');
        return labelStr ? `${name}{${labelStr}}` : name;
    }

    /**
     * Export all metrics
     */
    async export() {
        const results = [];

        if (this.config.json.enabled) {
            results.push(await this._exportJson());
        }
        if (this.config.prometheus.enabled) {
            results.push(await this._exportPrometheus());
        }
        if (this.config.tensorboard.enabled) {
            results.push(await this._exportTensorBoard());
        }
        if (this.config.wandb.enabled) {
            results.push(await this._exportWandB());
        }

        return results;
    }

    async _exportJson() {
        const data = {
            startTime: this.startTime,
            endTime: Date.now(),
            metrics: Object.fromEntries(this.metrics),
            history: this.history
        };

        const filepath = path.join(this.config.exportDirectory, this.config.json.filename);
        await fs.mkdir(path.dirname(filepath), { recursive: true });
        await fs.writeFile(
            filepath,
            JSON.stringify(data, null, this.config.json.pretty ? 2 : 0)
        );

        return { format: 'json', filepath };
    }

    async _exportPrometheus() {
        // Prometheus text format
        let output = '# HELP senars_rl_metric SeNARS RL Training Metric\n';
        output += '# TYPE senars_rl_metric gauge\n';

        for (const [key, metric] of this.metrics) {
            const latestValue = metric.values[metric.values.length - 1];
            const labelStr = Object.entries(metric.labels)
                .map(([k, v]) => `${k}="${v}"`)
                .join(',');
            const fullName = `senars_rl_${metric.name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
            
            if (labelStr) {
                output += `${fullName}{${labelStr}} ${latestValue}\n`;
            } else {
                output += `${fullName} ${latestValue}\n`;
            }
        }

        const filepath = path.join(this.config.exportDirectory, 'prometheus_metrics.txt');
        await fs.mkdir(path.dirname(filepath), { recursive: true });
        await fs.writeFile(filepath, output);

        return { format: 'prometheus', filepath };
    }

    async _exportTensorBoard() {
        // Simple TensorBoard event format (summary)
        const logDir = path.join(this.config.exportDirectory, this.config.tensorboard.logDir);
        await fs.mkdir(logDir, { recursive: true });

        // Write events file (simplified format)
        const eventsFile = path.join(logDir, 'events.out.tfevents.json');
        const events = this.history.map(h => ({
            wall_time: h.wallTime / 1000,
            step: h.timestamp,
            tag: this._makeKey(h.name, h.labels),
            value: h.value
        }));

        await fs.writeFile(eventsFile, events.map(e => JSON.stringify(e)).join('\n'));

        return { format: 'tensorboard', logDir };
    }

    async _exportWandB() {
        // WandB requires their SDK, so we export to a format they can import
        const wandbDir = path.join(this.config.exportDirectory, 'wandb_export');
        await fs.mkdir(wandbDir, { recursive: true });

        const data = {
            config: {
                project: this.config.wandb.project,
                entity: this.config.wandb.entity,
                tags: this.config.wandb.tags
            },
            metrics: this.history.map(h => ({
                _step: h.timestamp,
                _timestamp: h.wallTime / 1000,
                ...h.labels,
                [h.name]: h.value
            }))
        };

        const filepath = path.join(wandbDir, 'metrics.json');
        await fs.writeFile(filepath, JSON.stringify(data, null, 2));

        return { format: 'wandb', filepath, note: 'Import with: wandb sync ' + wandbDir };
    }

    /**
     * Get current metrics summary
     */
    getSummary() {
        const summary = {};

        for (const [key, metric] of this.metrics) {
            const values = metric.values;
            summary[metric.name] = {
                latest: values[values.length - 1],
                min: Math.min(...values),
                max: Math.max(...values),
                avg: values.reduce((a, b) => a + b, 0) / values.length,
                count: values.length
            };
        }

        return summary;
    }

    /**
     * Get metrics as Prometheus format string
     */
    getPrometheusFormat() {
        let output = '# HELP senars_rl_metric SeNARS RL Training Metric\n';
        output += '# TYPE senars_rl_metric gauge\n';

        for (const [key, metric] of this.metrics) {
            const latestValue = metric.values[metric.values.length - 1];
            const labelStr = Object.entries(metric.labels)
                .map(([k, v]) => `${k}="${v}"`)
                .join(',');
            const fullName = `senars_rl_${metric.name.replace(/[^a-zA-Z0-9_]/g, '_')}`;

            if (labelStr) {
                output += `${fullName}{${labelStr}} ${latestValue}\n`;
            } else {
                output += `${fullName} ${latestValue}\n`;
            }
        }

        return output;
    }

    async onShutdown() {
        await this.export();
    }
}

/**
 * Training monitor with real-time logging
 */
export class TrainingMonitor extends Component {
    constructor(exporter, config = {}) {
        super(mergeConfig({ logToConsole: true, logLevel: 'info' }, config));
        this.exporter = exporter;
        this.episodeMetrics = new Map();
    }

    /**
     * Log episode completion
     */
    logEpisode(episode, metrics) {
        const { reward, loss, epsilon, ...rest } = metrics;

        this.exporter.record('episode_reward', reward, { episode });
        if (loss !== undefined) this.exporter.record('loss', loss, { episode });
        if (epsilon !== undefined) this.exporter.record('epsilon', epsilon, { episode });

        for (const [key, value] of Object.entries(rest)) {
            this.exporter.record(key, value, { episode });
        }

        this.episodeMetrics.set(episode, { reward, loss, epsilon, ...rest });

        if (this.config.logToConsole && episode % this.config.logInterval === 0) {
            this._logToConsole(episode, metrics);
        }
    }

    _logToConsole(episode, metrics) {
        const { reward, loss, epsilon } = metrics;
        const recent = Array.from(this.episodeMetrics.values())
            .slice(-10)
            .map(m => m.reward);
        const avgReward = recent.reduce((a, b) => a + b, 0) / recent.length;

        let log = `[Episode ${episode}] Reward: ${reward?.toFixed(2)}, Avg(10): ${avgReward?.toFixed(2)}`;
        if (loss !== undefined) log += `, Loss: ${loss.toFixed(4)}`;
        if (epsilon !== undefined) log += `, ε: ${epsilon.toFixed(3)}`;

        console.log(log);
    }

    /**
     * Get training progress
     */
    getProgress() {
        const rewards = Array.from(this.episodeMetrics.values()).map(m => m.reward);
        const recent = rewards.slice(-10);
        const older = rewards.slice(-20, -10);

        const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length || 0;
        const avgOlder = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : avgRecent;

        return {
            totalEpisodes: rewards.length,
            bestReward: Math.max(...rewards, -Infinity),
            avgReward: avgRecent,
            trend: avgRecent > avgOlder ? 'improving' : avgRecent < avgOlder ? 'declining' : 'stable'
        };
    }

    async export() {
        return this.exporter.export();
    }
}

/**
 * Create a configured metrics exporter
 */
export function createMonitor(config = {}) {
    const exporter = new MetricsExporter(config);
    const monitor = new TrainingMonitor(exporter, config);
    return { exporter, monitor };
}

/**
 * Callback factory for training loops
 */
export function createMonitorCallback(monitor) {
    return (episode, metrics) => {
        monitor.logEpisode(episode, metrics);
    };
}
