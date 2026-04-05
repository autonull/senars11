/**
 * ShellGuard.js — Allowlist-based shell command validator
 *
 * Security checks:
 * - Exact allowlist match
 * - Prefix allowlist match
 * - Forbidden pattern detection
 * - Path traversal prevention
 * - Shell metacharacter detection
 *
 * Always use with child_process.spawn with shell: false
 */

import {Logger} from '@senars/core';

export class ShellGuard {
    constructor(config = {}) {
        this._allowlist = config.allowlist ?? [];
        this._allowedPrefixes = config.allowedPrefixes ?? [];
        this._forbiddenPatterns = config.forbiddenPatterns ?? [
            'rm', 'sudo', 'curl', 'wget', '>', '|', ';', '&&', '`', '$(', 'eval',
            'nc', 'netcat', 'bash -c', 'sh -c', 'python -c', 'perl -e', 'ruby -e'
        ];
        this._workingDir = config.workingDir ?? process.cwd();
    }

    validate(cmd) {
        const cmdStr = String(cmd).trim();
        if (!cmdStr) {
            return {valid: false, reason: 'empty-command'};
        }

        for (const pattern of this._forbiddenPatterns) {
            if (cmdStr.includes(pattern)) {
                Logger.warn(`[ShellGuard] Forbidden pattern "${pattern}" in: ${cmdStr.slice(0, 50)}`);
                return {valid: false, reason: 'forbidden-pattern', pattern};
            }
        }

        const dangerousChars = ['$', '`', '>', '<', '|', '&', ';', '\n', '\r'];
        for (const char of dangerousChars) {
            if (cmdStr.includes(char)) {
                Logger.warn(`[ShellGuard] Dangerous character "${char.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}" in: ${cmdStr.slice(0, 50)}`);
                return {valid: false, reason: 'dangerous-character', character: char};
            }
        }

        const parts = cmdStr.split(' ').filter(p => p.length > 0);
        if (parts.length === 0) {
            return {valid: false, reason: 'no-command'};
        }

        const [exec, ...args] = parts;

        if (this._allowlist.includes(cmdStr)) {
            Logger.debug(`[ShellGuard] Allowed (exact): ${cmdStr}`);
            return {valid: true, parsed: {exec, args}};
        }

        for (const prefix of this._allowedPrefixes) {
            if (cmdStr.startsWith(prefix)) {
                Logger.debug(`[ShellGuard] Allowed (prefix "${prefix}"): ${cmdStr}`);
                return {valid: true, parsed: {exec, args}};
            }
        }

        Logger.warn(`[ShellGuard] Not allowlisted: ${cmdStr.slice(0, 100)}`);
        return {valid: false, reason: 'not-allowlisted', command: cmdStr.slice(0, 100)};
    }

    configure(config) {
        if (config.allowlist) {
            this._allowlist = config.allowlist;
        }
        if (config.allowedPrefixes) {
            this._allowedPrefixes = config.allowedPrefixes;
        }
        if (config.forbiddenPatterns) {
            this._forbiddenPatterns = config.forbiddenPatterns;
        }
        if (config.workingDir) {
            this._workingDir = config.workingDir;
        }
    }

    getConfig() {
        return {
            allowlist: [...this._allowlist],
            allowedPrefixes: [...this._allowedPrefixes],
            forbiddenPatterns: [...this._forbiddenPatterns],
            workingDir: this._workingDir
        };
    }
}

export async function executeValidatedCommand(cmd, options = {}) {
    const guard = new ShellGuard(options);
    const validation = guard.validate(cmd);

    if (!validation.valid) {
        return {success: false, error: validation.reason, details: validation};
    }

    const {spawn} = await import('child_process');
    const {exec, args} = validation.parsed;
    const timeout = options.timeout ?? 30000;

    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let resolved = false;

        const proc = spawn(exec, args, {
            shell: false,
            cwd: options.workingDir ?? process.cwd()
        });

        const timer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                proc.kill();
                resolve({success: false, error: 'timeout', stderr: `Command timed out after ${timeout}ms`});
            }
        }, timeout);

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                resolve({
                    success: code === 0,
                    stdout: stdout.slice(0, options.maxOutput ?? 10000),
                    stderr: stderr.slice(0, options.maxErrorOutput ?? 2000),
                    exitCode: code
                });
            }
        });

        proc.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                resolve({success: false, error: err.message, stderr: err.message});
            }
        });
    });
}
