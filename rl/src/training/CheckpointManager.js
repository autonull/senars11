/**
 * Checkpoint Manager for Training Persistence
 * Save/load agent states, manage checkpoint rotation, track best models
 */
import { Component } from '../composable/Component.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHECKPOINT_DEFAULTS = {
    directory: './checkpoints',
    interval: 100,
    maxKeep: 5,
    saveBest: true,
    saveHistory: true,
    compression: false,
    includeOptimizer: true,
    includeHistory: true
};

export class CheckpointManager extends Component {
    constructor(config = {}) {
        const merged = mergeConfig(CHECKPOINT_DEFAULTS, config);
        super(merged);
        this.checkpoints = [];
        this.bestReward = -Infinity;
        this.bestCheckpoint = null;
        this.history = [];
    }

    async onInitialize() {
        await fs.mkdir(this.config.directory, { recursive: true });
        await this._loadMetadata();
        this.setState('ready', true);
    }

    async _loadMetadata() {
        try {
            const metaPath = path.join(this.config.directory, 'metadata.json');
            const data = await fs.readFile(metaPath, 'utf-8');
            const metadata = JSON.parse(data);
            this.checkpoints = metadata.checkpoints ?? [];
            this.bestReward = metadata.bestReward ?? -Infinity;
            this.bestCheckpoint = metadata.bestCheckpoint ?? null;
            this.history = metadata.history ?? [];
        } catch {
            // No existing metadata, start fresh
            this.checkpoints = [];
            this.bestReward = -Infinity;
        }
    }

    async _saveMetadata() {
        const metaPath = path.join(this.config.directory, 'metadata.json');
        const metadata = {
            checkpoints: this.checkpoints,
            bestReward: this.bestReward,
            bestCheckpoint: this.bestCheckpoint,
            history: this.history,
            lastUpdated: Date.now()
        };
        await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
    }

    /**
     * Save checkpoint if interval reached or new best reward
     * @param {Component} agent - Agent to checkpoint
     * @param {number} episode - Current episode number
     * @param {number} reward - Current episode reward
     * @returns {Promise<string|null>} Path to saved checkpoint or null if not saved
     */
    async save(agent, episode, reward) {
        const shouldSave = episode % this.config.interval === 0;
        const isBest = this.config.saveBest && reward > this.bestReward;

        if (!shouldSave && !isBest) {
            return null;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const suffix = isBest ? '_best' : '';
        const filename = `checkpoint_ep${episode}${suffix}_${timestamp}.json`;
        const filepath = path.join(this.config.directory, filename);

        const stateDict = this._extractStateDict(agent);
        const checkpoint = {
            filename,
            episode,
            reward,
            timestamp: Date.now(),
            isBest,
            metrics: agent.getMetrics?.() ?? {},
            config: agent._config ?? {}
        };

        await fs.writeFile(filepath, JSON.stringify({
            checkpoint,
            stateDict,
            history: this.config.includeHistory ? this.history : undefined
        }, null, 2));

        this.checkpoints.push(checkpoint);
        if (isBest) {
            this.bestReward = reward;
            this.bestCheckpoint = checkpoint;
        }

        if (this.config.saveHistory) {
            this.history.push({ episode, reward, timestamp: Date.now() });
        }

        await this._rotateCheckpoints();
        await this._saveMetadata();

        this.emit('checkpointSaved', { filepath, episode, reward, isBest });
        return filepath;
    }

    _extractStateDict(agent) {
        const stateDict = {};

        // Try agent's stateDict method
        if (typeof agent.stateDict === 'function') {
            return agent.stateDict();
        }

        // Try agent's getParameters method
        if (typeof agent.getParameters === 'function') {
            return { parameters: agent.getParameters() };
        }

        // Try agent's serialize method
        if (typeof agent.serialize === 'function') {
            return { serialized: agent.serialize() };
        }

        // Fallback: extract network weights if available
        if (agent.network && typeof agent.network.stateDict === 'function') {
            stateDict.network = agent.network.stateDict();
        }
        if (agent.qNet && typeof agent.qNet.stateDict === 'function') {
            stateDict.qNet = agent.qNet.stateDict();
        }
        if (agent.targetNet && typeof agent.targetNet.stateDict === 'function') {
            stateDict.targetNet = agent.targetNet.stateDict();
        }
        if (agent.policy && typeof agent.policy.stateDict === 'function') {
            stateDict.policy = agent.policy.stateDict();
        }

        return stateDict;
    }

    async _rotateCheckpoints() {
        if (this.checkpoints.length <= this.config.maxKeep) {
            return;
        }

        // Sort by timestamp, keep newest
        this.checkpoints.sort((a, b) => b.timestamp - a.timestamp);

        // Separate best checkpoint if it exists
        const bestIdx = this.checkpoints.findIndex(cp => cp.isBest);
        const bestCheckpoint = bestIdx >= 0 ? this.checkpoints[bestIdx] : null;
        
        if (bestIdx >= 0) {
            this.checkpoints.splice(bestIdx, 1); // Remove best from list temporarily
        }

        // Keep only maxKeep checkpoints (or maxKeep-1 if we have a best to preserve)
        const maxKeep = bestCheckpoint ? this.config.maxKeep - 1 : this.config.maxKeep;
        const toRemove = this.checkpoints.slice(maxKeep);
        this.checkpoints = this.checkpoints.slice(0, maxKeep);

        // Add best back if it exists
        if (bestCheckpoint) {
            this.checkpoints.push(bestCheckpoint);
        }

        // Remove old checkpoint files (but never delete best)
        for (const checkpoint of toRemove) {
            if (checkpoint.isBest) continue; // Never delete best

            const filepath = path.join(this.config.directory, checkpoint.filename);
            try {
                await fs.unlink(filepath);
                this.emit('checkpointRemoved', { filename: checkpoint.filename });
            } catch (e) {
                this.logger.warn(`Failed to remove old checkpoint: ${checkpoint.filename}`, e);
            }
        }
    }

    /**
     * Load latest checkpoint for agent
     * @param {Component} agent - Agent to restore
     * @returns {Promise<object|null>} Checkpoint metadata or null if no checkpoint found
     */
    async loadLatest(agent) {
        if (this.checkpoints.length === 0) {
            return null;
        }

        // Get most recent checkpoint
        const latest = [...this.checkpoints].sort((a, b) => b.timestamp - a.timestamp)[0];
        return this.load(agent, latest.filename);
    }

    /**
     * Load best checkpoint for agent
     * @param {Component} agent - Agent to restore
     * @returns {Promise<object|null>} Checkpoint metadata or null if no best checkpoint found
     */
    async loadBest(agent) {
        if (!this.bestCheckpoint) {
            return null;
        }
        return this.load(agent, this.bestCheckpoint.filename);
    }

    /**
     * Load specific checkpoint by filename
     * @param {Component} agent - Agent to restore
     * @param {string} filename - Checkpoint filename
     * @returns {Promise<object|null>} Checkpoint metadata or null if load failed
     */
    async load(agent, filename) {
        const filepath = path.join(this.config.directory, filename);

        try {
            const data = await fs.readFile(filepath, 'utf-8');
            const { checkpoint, stateDict, history } = JSON.parse(data);

            await this._restoreStateDict(agent, stateDict);

            if (history && this.config.includeHistory) {
                this.history = history;
            }

            this.emit('checkpointLoaded', { filepath, episode: checkpoint.episode, reward: checkpoint.reward });
            return checkpoint;
        } catch (e) {
            this.logger.error(`Failed to load checkpoint: ${filename}`, e);
            return null;
        }
    }

    async _restoreStateDict(agent, stateDict) {
        // Try agent's loadStateDict method
        if (typeof agent.loadStateDict === 'function') {
            agent.loadStateDict(stateDict);
            return;
        }

        // Try agent's setParameters method
        if (typeof agent.setParameters === 'function') {
            agent.setParameters(stateDict.parameters);
            return;
        }

        // Try agent's deserialize method
        if (stateDict.serialized && typeof agent.constructor.deserialize === 'function') {
            const restored = agent.constructor.deserialize(stateDict.serialized);
            Object.assign(agent, restored);
            return;
        }

        // Fallback: restore network weights if available
        if (stateDict.network && agent.network && typeof agent.network.loadStateDict === 'function') {
            agent.network.loadStateDict(stateDict.network);
        }
        if (stateDict.qNet && agent.qNet && typeof agent.qNet.loadStateDict === 'function') {
            agent.qNet.loadStateDict(stateDict.qNet);
        }
        if (stateDict.targetNet && agent.targetNet && typeof agent.targetNet.loadStateDict === 'function') {
            agent.targetNet.loadStateDict(stateDict.targetNet);
        }
        if (stateDict.policy && agent.policy && typeof agent.policy.loadStateDict === 'function') {
            agent.policy.loadStateDict(stateDict.policy);
        }
    }

    /**
     * Get list of all checkpoints
     * @returns {Promise<Array>} List of checkpoint metadata
     */
    async list() {
        return this.checkpoints.map(cp => ({ ...cp }));
    }

    /**
     * Delete specific checkpoint
     * @param {string} filename - Checkpoint filename
     */
    async delete(filename) {
        const idx = this.checkpoints.findIndex(cp => cp.filename === filename);
        if (idx === -1) return false;

        const checkpoint = this.checkpoints[idx];
        const filepath = path.join(this.config.directory, filename);

        try {
            await fs.unlink(filepath);
            this.checkpoints.splice(idx, 1);

            if (this.bestCheckpoint?.filename === filename) {
                this.bestReward = -Infinity;
                this.bestCheckpoint = null;
            }

            await this._saveMetadata();
            this.emit('checkpointDeleted', { filename });
            return true;
        } catch (e) {
            this.logger.error(`Failed to delete checkpoint: ${filename}`, e);
            return false;
        }
    }

    /**
     * Get training progress from history
     * @returns {object} Training statistics
     */
    getProgress() {
        if (this.history.length === 0) {
            return { episodes: 0, bestReward: -Infinity, avgReward: 0, trend: 'stable' };
        }

        const rewards = this.history.map(h => h.reward);
        const recent = rewards.slice(-10);
        const older = rewards.slice(-20, -10);

        const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
        const avgOlder = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : avgRecent;

        return {
            episodes: this.history.length,
            bestReward: this.bestReward,
            avgReward: avgRecent,
            trend: avgRecent > avgOlder ? 'improving' : avgRecent < avgOlder ? 'declining' : 'stable'
        };
    }

    async onShutdown() {
        await this._saveMetadata();
    }
}

/**
 * Checkpoint callback factory for use in training loops
 * @param {CheckpointManager} manager
 * @param {object} options
 * @returns {Function} Callback function for training
 */
export function createCheckpointCallback(manager, options = {}) {
    const { metric = 'reward', threshold = null } = options;

    return async (agent, episode, metrics) => {
        const value = metrics?.[metric] ?? metrics?.reward ?? 0;

        if (threshold !== null && value < threshold) {
            return null; // Skip if below threshold
        }

        return manager.save(agent, episode, value);
    };
}
