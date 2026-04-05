/**
 * CheckpointManager Tests
 */
import {CheckpointManager, Component, createCheckpointCallback} from '../../src/index.js';
import fs from 'fs/promises';
import path from 'path';
import {fileURLToPath} from 'url';

// Workaround for Jest VM environment where import.meta.url might not be available
let __dirname_fixed;
try {
    __dirname_fixed = path.dirname(fileURLToPath(import.meta.url));
} catch (e) {
    // Jest VM environment - use global.__dirname or fallback
    __dirname_fixed = typeof global !== 'undefined' && global.__dirname
        ? global.__dirname
        : process.cwd();
}
const TEST_DIR = path.join(__dirname_fixed, 'test_checkpoints');

// Mock agent for testing
class MockAgent extends Component {
    constructor(config = {}) {
        super(config);
        this.weights = {layer1: [0.1, 0.2, 0.3], layer2: [0.4, 0.5]};
        this._metrics = {episodes: 0, reward: 0};
    }

    stateDict() {
        return {weights: this.weights, metrics: this._metrics};
    }

    loadStateDict(stateDict) {
        if (stateDict.weights) {
            this.weights = stateDict.weights;
        }
        if (stateDict.metrics) {
            this._metrics = stateDict.metrics;
        }
    }

    getMetrics() {
        return this._metrics;
    }
}

describe('CheckpointManager', () => {
    let manager;
    let testDir;
    let testCounter = 0;

    beforeEach(async () => {
        testDir = path.join(__dirname_fixed, `test_checkpoints_${Date.now()}_${++testCounter}`);
        await fs.mkdir(testDir, {recursive: true});
        manager = new CheckpointManager({directory: testDir, interval: 10, maxKeep: 3});
        await manager.initialize();
    });

    afterEach(async () => {
        try {
            await manager.shutdown();
        } catch {
            // Ignore shutdown errors
        }
        try {
            await fs.rm(testDir, {recursive: true, force: true});
        } catch {
            // Ignore cleanup errors
        }
    });

    afterEach(async () => {
        try {
            await manager.shutdown();
        } catch {
            // Ignore shutdown errors
        }
        try {
            await fs.rm(testDir, {recursive: true, force: true});
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('initialization', () => {
        it('should create checkpoint directory', async () => {
            const stats = await fs.stat(testDir);
            expect(stats.isDirectory()).toBe(true);
        });

        it('should initialize with default values', () => {
            expect(manager.checkpoints).toEqual([]);
            expect(manager.bestReward).toBe(-Infinity);
        });
    });

    describe('save', () => {
        it('should save checkpoint at interval', async () => {
            const agent = new MockAgent();
            const filepath = await manager.save(agent, 10, 50);

            expect(filepath).toContain('checkpoint_ep10');
            expect(manager.checkpoints.length).toBe(1);
        });

        it('should not save when not at interval', async () => {
            const agent = new MockAgent();
            // First save to establish baseline
            await manager.save(agent, 10, 50);

            // Try to save at non-interval episode with lower reward
            const filepath = await manager.save(agent, 5, 30);

            expect(filepath).toBeNull();
            expect(manager.checkpoints.length).toBe(1);
        });

        it('should save best checkpoint regardless of interval', async () => {
            const agent = new MockAgent();

            // First save at interval
            await manager.save(agent, 10, 50);

            // Save best at non-interval episode
            const filepath = await manager.save(agent, 15, 100);

            expect(filepath).toContain('_best');
            expect(manager.checkpoints.length).toBe(2);
            expect(manager.bestReward).toBe(100);
        });

        it('should emit checkpointSaved event', async () => {
            const agent = new MockAgent();
            let eventEmitted = false;
            let eventData = null;

            manager.subscribe('checkpointSaved', (data) => {
                eventEmitted = true;
                eventData = data;
            });

            await manager.save(agent, 10, 50);

            expect(eventEmitted).toBe(true);
            expect(eventData.episode).toBe(10);
            expect(eventData.reward).toBe(50);
        });
    });

    describe('load', () => {
        it('should load latest checkpoint', async () => {
            const agent1 = new MockAgent();
            agent1.weights = {layer1: [1, 2, 3], layer2: [4, 5]};

            await manager.save(agent1, 10, 50);
            await new Promise(r => setTimeout(r, 10)); // Ensure different timestamps
            await manager.save(agent1, 20, 75);

            const agent2 = new MockAgent();
            const checkpoint = await manager.loadLatest(agent2);

            expect(checkpoint.episode).toBe(20);
            expect(agent2.weights.layer1).toEqual([1, 2, 3]);
        });

        it('should load best checkpoint', async () => {
            const agent1 = new MockAgent();
            agent1.weights = {layer1: [1, 2, 3], layer2: [4, 5]};

            await manager.save(agent1, 10, 50);
            await manager.save(agent1, 15, 100); // Best

            const agent2 = new MockAgent();
            const checkpoint = await manager.loadBest(agent2);

            expect(checkpoint.episode).toBe(15);
            expect(agent2.weights.layer1).toEqual([1, 2, 3]);
        });

        it('should return null when no checkpoints exist', async () => {
            const agent = new MockAgent();
            const result = await manager.loadLatest(agent);

            expect(result).toBeNull();
        });

        it('should restore agent state', async () => {
            const agent1 = new MockAgent();
            agent1._metrics = {episodes: 100, reward: 250};

            await manager.save(agent1, 100, 250);

            const agent2 = new MockAgent();
            await manager.loadLatest(agent2);

            expect(agent2._metrics.episodes).toBe(100);
        });
    });

    describe('rotation', () => {
        it('should keep only maxKeep checkpoints', async () => {
            const agent = new MockAgent();

            // Save 5 checkpoints
            for (let i = 1; i <= 5; i++) {
                await manager.save(agent, i * 10, i * 10);
            }

            expect(manager.checkpoints.length).toBe(3); // maxKeep = 3
        });

        it('should never delete best checkpoint', async () => {
            const agent = new MockAgent();

            await manager.save(agent, 10, 50);
            await new Promise(r => setTimeout(r, 5));
            await manager.save(agent, 15, 100); // Best (highest reward)
            await new Promise(r => setTimeout(r, 5));
            await manager.save(agent, 20, 60);
            await new Promise(r => setTimeout(r, 5));
            await manager.save(agent, 30, 70);
            await new Promise(r => setTimeout(r, 5));
            await manager.save(agent, 40, 80);

            // Best checkpoint (episode 15, reward 100) should still exist
            const bestExists = manager.checkpoints.some(cp => cp.isBest);
            expect(bestExists).toBe(true);
            expect(manager.bestReward).toBe(100);

            // Verify best checkpoint is in the list
            const bestCheckpoint = manager.checkpoints.find(cp => cp.episode === 15);
            expect(bestCheckpoint).toBeDefined();
            expect(bestCheckpoint.isBest).toBe(true);
        });
    });

    describe('delete', () => {
        it('should delete specific checkpoint', async () => {
            const agent = new MockAgent();
            await manager.save(agent, 10, 50);

            const checkpoint = manager.checkpoints[0];
            const result = await manager.delete(checkpoint.filename);

            expect(result).toBe(true);
            expect(manager.checkpoints.length).toBe(0);
        });

        it('should update bestCheckpoint when best is deleted', async () => {
            const agent = new MockAgent();
            await manager.save(agent, 10, 50);
            await manager.save(agent, 15, 100); // Best

            await manager.delete(manager.bestCheckpoint.filename);

            expect(manager.bestCheckpoint).toBeNull();
            expect(manager.bestReward).toBe(-Infinity);
        });
    });

    describe('getProgress', () => {
        it('should return empty progress when no history', () => {
            const progress = manager.getProgress();

            expect(progress.episodes).toBe(0);
            expect(progress.bestReward).toBe(-Infinity);
        });

        it('should calculate training progress', async () => {
            const agent = new MockAgent();

            // Simulate training history with improving rewards (need 20+ for trend comparison)
            for (let i = 1; i <= 25; i++) {
                // First 15 episodes: lower rewards (10-30)
                // Last 10 episodes: higher rewards (80-100)
                const reward = i <= 15 ? 10 + (i * 2) : 80 + ((i - 15) * 2);
                await manager.save(agent, i * 10, reward);
            }

            const progress = manager.getProgress();

            expect(progress.episodes).toBe(25);
            expect(progress.bestReward).toBeGreaterThanOrEqual(80);
            // Recent rewards should be higher than older
            expect(progress.trend).toBe('improving');
        });
    });

    describe('list', () => {
        it('should list all checkpoints', async () => {
            const agent = new MockAgent();
            await manager.save(agent, 10, 50);
            await manager.save(agent, 20, 75);

            const list = await manager.list();

            expect(list.length).toBe(2);
            expect(list[0].episode).toBe(10);
            expect(list[1].episode).toBe(20);
        });
    });

    describe('createCheckpointCallback', () => {
        it('should create callback function', async () => {
            const callback = createCheckpointCallback(manager);

            const agent = new MockAgent();
            const result = await callback(agent, 10, {reward: 50});

            expect(result).toContain('checkpoint_ep10');
        });

        it('should respect threshold option', async () => {
            const callback = createCheckpointCallback(manager, {threshold: 100});

            const agent = new MockAgent();
            const result = await callback(agent, 10, {reward: 50});

            expect(result).toBeNull(); // Below threshold
        });
    });
});
