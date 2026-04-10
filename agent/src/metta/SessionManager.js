/**
 * SessionManager.js — Checkpoint/restore for MeTTa cognitive loop state.
 *
 * Saves loop state (working memory, history buffer, cycle count, model
 * override) to disk when the budget is exhausted or the bot shuts down.
 * Restores on next build().
 *
 * Triggered by:
 *   - 'budget-exhausted' event from MeTTaLoopBuilder
 *   - Agent.shutdown() → Bot.shutdown()
 *   - AgentLoop.metta (nar-serialize) at budget exhaustion
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Logger, resolveWithFallback, fallbackAgentDir } from '@senars/core';

const __agentDir = resolveWithFallback(() => dirname(fileURLToPath(import.meta.url)), fallbackAgentDir);

export class SessionManager {
    #dataDir;

    constructor(dataDir) {
        this.#dataDir = dataDir ?? join(__agentDir, '../../../workspace/sessions');
    }

    async save(loopState) {
        const snapshot = {
            cycleCount: loopState.cycleCount ?? 0,
            wm: loopState.wm ?? [],
            historyBuffer: loopState.historyBuffer ?? [],
            modelOverride: loopState.modelOverride ?? null,
            modelOverrideCycles: loopState.modelOverrideCycles ?? 0,
            timestamp: Date.now(),
        };
        try {
            await mkdir(this.#dataDir, { recursive: true });
            await writeFile(join(this.#dataDir, 'checkpoint.json'), JSON.stringify(snapshot, null, 2));
            Logger.info(`[SessionManager] Saved checkpoint: cycle ${snapshot.cycleCount}, ${snapshot.wm.length} WM entries, ${snapshot.historyBuffer.length} history entries`);
            return true;
        } catch (err) {
            Logger.warn('[SessionManager] Failed to save checkpoint:', err.message);
            return false;
        }
    }

    async load() {
        try {
            const data = await readFile(join(this.#dataDir, 'checkpoint.json'), 'utf8');
            const snapshot = JSON.parse(data);
            const age = Date.now() - (snapshot.timestamp ?? 0);
            const ageStr = age < 60000 ? `${Math.floor(age / 1000)}s ago` : age < 3600000 ? `${Math.floor(age / 60000)}m ago` : `${Math.floor(age / 3600000)}h ago`;
            Logger.info(`[SessionManager] Restored checkpoint from ${ageStr}: cycle ${snapshot.cycleCount}, ${snapshot.wm?.length ?? 0} WM entries, ${snapshot.historyBuffer?.length ?? 0} history entries`);
            return snapshot;
        } catch {
            Logger.debug('[SessionManager] No checkpoint to restore');
            return null;
        }
    }

    async clear() {
        try {
            const { unlink } = await import('fs/promises');
            await unlink(join(this.#dataDir, 'checkpoint.json'));
            Logger.info('[SessionManager] Checkpoint cleared');
        } catch { /* ignore if absent */ }
    }
}
