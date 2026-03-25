/**
 * MonitoringSystem Tests
 */
import { MetricsExporter, TrainingMonitor, createMonitor, createMonitorCallback } from '../../src/evaluation/MonitoringSystem.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const _fileURLToPath = fileURLToPath;
const __dirname_fixed = path.dirname(_fileURLToPath(import.meta.url));
const TEST_DIR = path.join(__dirname, 'test_monitor_logs');

describe('MetricsExporter', () => {
    let exporter;

    beforeEach(async () => {
        await fs.mkdir(TEST_DIR, { recursive: true });
        exporter = new MetricsExporter({
            exportDirectory: TEST_DIR,
            logInterval: 1,
            json: { enabled: true, filename: 'test_metrics.json' },
            prometheus: { enabled: false },
            tensorboard: { enabled: false },
            wandb: { enabled: false }
        });
        await exporter.initialize();
    });

    afterEach(async () => {
        await exporter.shutdown();
        try {
            await fs.rm(TEST_DIR, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('record', () => {
        it('should record metric values', () => {
            exporter.record('reward', 50, { episode: 1 });

            expect(exporter.metrics.size).toBe(1);
            expect(exporter.history.length).toBe(1);
        });

        it('should record multiple values for same metric', () => {
            // Record without labels to get same key
            exporter.record('reward', 50);
            exporter.record('reward', 75);
            exporter.record('reward', 100);

            const metric = exporter.metrics.get('reward');
            expect(metric.values).toHaveLength(3);
            expect(metric.values).toEqual([50, 75, 100]);
        });

        it('should handle labeled metrics', () => {
            exporter.record('loss', 0.5, { type: 'training', episode: 1 });
            exporter.record('loss', 0.3, { type: 'validation', episode: 1 });

            expect(exporter.metrics.size).toBe(2);
        });
    });

    describe('export', () => {
        it('should export to JSON format', async () => {
            exporter.record('reward', 50, { episode: 1 });
            exporter.record('reward', 75, { episode: 2 });

            const results = await exporter.export();

            const jsonExport = results.find(r => r.format === 'json');
            expect(jsonExport).toBeDefined();
            expect(jsonExport.filepath).toContain('test_metrics.json');

            // Verify file contents
            const data = JSON.parse(await fs.readFile(jsonExport.filepath, 'utf-8'));
            expect(data.history).toHaveLength(2);
        });

        it('should export to Prometheus format', async () => {
            exporter.config.prometheus.enabled = true;
            exporter.record('reward', 50);
            exporter.record('loss', 0.5);

            const results = await exporter.export();

            const promExport = results.find(r => r.format === 'prometheus');
            expect(promExport).toBeDefined();

            const content = await fs.readFile(promExport.filepath, 'utf-8');
            expect(content).toContain('# HELP');
            expect(content).toContain('# TYPE');
            expect(content).toContain('senars_rl_reward');
        });

        it('should export to TensorBoard format', async () => {
            exporter.config.tensorboard.enabled = true;
            exporter.config.tensorboard.logDir = 'tb_test';
            exporter.record('reward', 50, { episode: 1 });

            const results = await exporter.export();

            const tbExport = results.find(r => r.format === 'tensorboard');
            expect(tbExport).toBeDefined();
            expect(tbExport.logDir).toContain('tb_test');
        });

        it('should export to WandB format', async () => {
            exporter.config.wandb.enabled = true;
            exporter.config.wandb.project = 'test-project';
            exporter.record('reward', 50, { episode: 1 });

            const results = await exporter.export();

            const wandbExport = results.find(r => r.format === 'wandb');
            expect(wandbExport).toBeDefined();
            expect(wandbExport.filepath).toContain('wandb_export');
        });
    });

    describe('getSummary', () => {
        it('should return metrics summary', () => {
            exporter.record('reward', 50);
            exporter.record('reward', 75);
            exporter.record('reward', 100);

            const summary = exporter.getSummary();

            expect(summary.reward).toBeDefined();
            expect(summary.reward.latest).toBe(100);
            expect(summary.reward.min).toBe(50);
            expect(summary.reward.max).toBe(100);
            expect(summary.reward.avg).toBe(75);
            expect(summary.reward.count).toBe(3);
        });

        it('should return empty summary when no metrics', () => {
            const summary = exporter.getSummary();
            expect(summary).toEqual({});
        });
    });

    describe('getPrometheusFormat', () => {
        it('should return Prometheus text format', () => {
            exporter.record('reward', 50);
            exporter.record('loss', 0.5);

            const output = exporter.getPrometheusFormat();

            expect(output).toContain('# HELP senars_rl_metric');
            expect(output).toContain('# TYPE senars_rl_metric gauge');
            expect(output).toContain('senars_rl_reward 50');
            expect(output).toContain('senars_rl_loss 0.5');
        });
    });
});

describe('TrainingMonitor', () => {
    let exporter;
    let monitor;

    beforeEach(async () => {
        await fs.mkdir(TEST_DIR, { recursive: true });
        exporter = new MetricsExporter({
            exportDirectory: TEST_DIR,
            json: { enabled: false },
            prometheus: { enabled: false },
            tensorboard: { enabled: false },
            wandb: { enabled: false }
        });
        await exporter.initialize();

        monitor = new TrainingMonitor(exporter, {
            logToConsole: false,
            logInterval: 10
        });
        await monitor.initialize();
    });

    afterEach(async () => {
        await monitor.shutdown();
        try {
            await fs.rm(TEST_DIR, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('logEpisode', () => {
        it('should log episode metrics', () => {
            monitor.logEpisode(1, { reward: 50, loss: 0.5, epsilon: 0.9 });

            expect(monitor.episodeMetrics.size).toBe(1);
            expect(monitor.episodeMetrics.get(1).reward).toBe(50);
        });

        it('should record metrics in exporter', () => {
            monitor.logEpisode(1, { reward: 50, loss: 0.5 });

            expect(exporter.metrics.size).toBeGreaterThanOrEqual(2);
        });

        it('should handle partial metrics', () => {
            monitor.logEpisode(1, { reward: 50 });

            expect(monitor.episodeMetrics.get(1).reward).toBe(50);
            expect(monitor.episodeMetrics.get(1).loss).toBeUndefined();
        });
    });

    describe('getProgress', () => {
        it('should return training progress', () => {
            for (let i = 1; i <= 25; i++) {
                monitor.logEpisode(i, { reward: i * 4 });
            }

            const progress = monitor.getProgress();

            expect(progress.totalEpisodes).toBe(25);
            expect(progress.bestReward).toBe(100);
            expect(progress.trend).toBe('improving');
        });

        it('should detect declining trend', () => {
            for (let i = 1; i <= 25; i++) {
                monitor.logEpisode(i, { reward: 100 - (i * 2) });
            }

            const progress = monitor.getProgress();
            expect(progress.trend).toBe('declining');
        });

        it('should detect stable trend', () => {
            for (let i = 1; i <= 25; i++) {
                monitor.logEpisode(i, { reward: 50 });
            }

            const progress = monitor.getProgress();
            expect(progress.trend).toBe('stable');
        });
    });

    describe('export', () => {
        it('should export metrics', async () => {
            monitor.logEpisode(1, { reward: 50 });

            const results = await monitor.export();
            expect(results).toBeDefined();
        });
    });
});

describe('createMonitor', () => {
    afterEach(async () => {
        try {
            await fs.rm(TEST_DIR, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    it('should create exporter and monitor', async () => {
        const { exporter, monitor } = createMonitor({
            exportDirectory: TEST_DIR,
            json: { enabled: false }
        });

        expect(exporter).toBeInstanceOf(MetricsExporter);
        expect(monitor).toBeInstanceOf(TrainingMonitor);

        await exporter.shutdown();
    });
});

describe('createMonitorCallback', () => {
    let exporter;
    let monitor;
    let callback;

    beforeEach(async () => {
        await fs.mkdir(TEST_DIR, { recursive: true });
        exporter = new MetricsExporter({
            exportDirectory: TEST_DIR,
            json: { enabled: false }
        });
        await exporter.initialize();

        monitor = new TrainingMonitor(exporter, { logToConsole: false });
        await monitor.initialize();

        callback = createMonitorCallback(monitor);
    });

    afterEach(async () => {
        await monitor.shutdown();
        try {
            await fs.rm(TEST_DIR, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    it('should create callback that logs episodes', () => {
        callback(1, { reward: 50, loss: 0.5 });

        expect(monitor.episodeMetrics.size).toBe(1);
    });

    it('should record metrics in exporter', () => {
        callback(1, { reward: 50 });

        expect(exporter.metrics.size).toBeGreaterThan(0);
    });
});
