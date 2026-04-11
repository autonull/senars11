/**
 * BotHarness.js — Child process management for E2E tests.
 *
 * Spawns `node run.js`, captures stdout, discovers the IRC port,
 * and provides clean shutdown.
 */

import { spawn } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOT_ROOT = resolve(__dirname, '../..');

export class BotHarness {
    constructor(options = {}) {
        this.args = options.args ?? [];
        this.env = { ...process.env, ...(options.env ?? {}) };
        this.cwd = options.cwd ?? BOT_ROOT;
        this.process = null;
        this.stdout = '';
        this.stderr = '';
        this._outputWaiters = [];
    }

    spawn() {
        this.process = spawn('node', ['run.js', ...this.args], {
            cwd: this.cwd,
            env: this.env,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.process.stdout.on('data', d => this._onStdout(d.toString()));
        this.process.stderr.on('data', d => { this.stderr += d.toString(); });

        return new Promise((resolve, reject) => {
            this.process.on('error', reject);
            // Wait for IRC connected or embedded server started
            this._waitForPattern(/IRC connected|CLI embodiment|Embedded IRC server/, 15000)
                .then(() => resolve(this))
                .catch(() => resolve(this)); // Continue even if pattern not found
        });
    }

    _onStdout(text) {
        this.stdout += text;
        for (const [pattern, resolve] of this._outputWaiters) {
            if (typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text)) {
                this._outputWaiters = this._outputWaiters.filter(w => w[1] !== resolve);
                resolve(text);
            }
        }
    }

    _waitForPattern(pattern, timeout = 10000) {
        if (typeof pattern === 'string' ? this.stdout.includes(pattern) : pattern.test(this.stdout)) {
            return Promise.resolve(this.stdout);
        }
        return new Promise((resolve, reject) => {
            this._outputWaiters.push([pattern, resolve]);
            setTimeout(() => {
                this._outputWaiters = this._outputWaiters.filter(w => w[1] !== resolve);
                reject(new Error(`Timeout waiting for pattern: ${pattern}`));
            }, timeout);
        });
    }

    discoverPort() {
        const match = this.stdout.match(/Embedded IRC server.*?(\d{4,6})/);
        return match ? parseInt(match[1], 10) : null;
    }

    async waitFor(pattern, timeout = 10000) {
        return this._waitForPattern(pattern, timeout);
    }

    kill(signal = 'SIGTERM') {
        if (!this.process || this.process.killed) {return Promise.resolve();}
        return new Promise(resolve => {
            this.process.on('exit', () => resolve());
            this.process.kill(signal);
            // Force kill after 5s if not exited
            setTimeout(() => {
                if (!this.process.killed) {this.process.kill('SIGKILL');}
                resolve();
            }, 5000);
        });
    }
}
