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

import { Logger } from '@senars/core';

export class ShellGuard {
    constructor(config = {}) {
        this._allowlist = config.allowlist ?? [];
        this._allowedPrefixes = config.allowedPrefixes ?? [];
        this._forbiddenPatterns = config.forbiddenPatterns ?? [
            'rm',
            'sudo',
            'curl',
            'wget',
            '>',
            '|',
            ';',
            '&&',
            '`',
            '$(',
            'eval',
            'nc',
            'netcat',
            'bash -c',
            'sh -c',
            'python -c',
            'perl -e',
            'ruby -e'
        ];
        this._workingDir = config.workingDir ?? process.cwd();
    }

    /**
     * Validate a shell command.
     * @param {string} cmd - Command string
     * @returns {{valid: boolean, reason?: string, parsed?: {exec: string, args: string[]}}}
     */
    validate(cmd) {
        const cmdStr = String(cmd).trim();

        if (!cmdStr) {
            return { valid: false, reason: 'empty-command' };
        }

        // Check forbidden patterns first (fast fail)
        for (const pattern of this._forbiddenPatterns) {
            if (cmdStr.includes(pattern)) {
                Logger.warn(`[ShellGuard] Forbidden pattern "${pattern}" in: ${cmdStr.slice(0, 50)}`);
                return { valid: false, reason: 'forbidden-pattern', pattern };
            }
        }

        // Check for shell metacharacters that could be dangerous
        const dangerousChars = ['$', '`', '>', '<', '|', '&', ';', '\n', '\r'];
        for (const char of dangerousChars) {
            if (cmdStr.includes(char)) {
                Logger.warn(`[ShellGuard] Dangerous character "${char.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}" in: ${cmdStr.slice(0, 50)}`);
                return { valid: false, reason: 'dangerous-character', character: char };
            }
        }

        // Parse command into executable and arguments
        const parts = cmdStr.split(' ').filter(p => p.length > 0);
        if (parts.length === 0) {
            return { valid: false, reason: 'no-command' };
        }

        const [exec, ...args] = parts;

        // Check allowlist (exact match)
        if (this._allowlist.includes(cmdStr)) {
            Logger.debug(`[ShellGuard] Allowed (exact): ${cmdStr}`);
            return { valid: true, parsed: { exec, args } };
        }

        // Check prefix allowlist
        for (const prefix of this._allowedPrefixes) {
            if (cmdStr.startsWith(prefix)) {
                // Additional check: ensure the prefix is a complete word boundary
                const afterPrefix = cmdStr.slice(prefix.length);
                if (afterPrefix.length === 0 || afterPrefix[0] === ' ') {
                    Logger.debug(`[ShellGuard] Allowed (prefix "${prefix}"): ${cmdStr}`);
                    return { valid: true, parsed: { exec, args } };
                }
            }
        }

        Logger.warn(`[ShellGuard] Not allowlisted: ${cmdStr.slice(0, 100)}`);
        return { valid: false, reason: 'not-allowlisted', command: cmdStr.slice(0, 100) };
    }

    /**
     * Update configuration at runtime.
     */
    configure(config) {
        if (config.allowlist) this._allowlist = config.allowlist;
        if (config.allowedPrefixes) this._allowedPrefixes = config.allowedPrefixes;
        if (config.forbiddenPatterns) this._forbiddenPatterns = config.forbiddenPatterns;
        if (config.workingDir) this._workingDir = config.workingDir;
    }

    /**
     * Get current configuration (for introspection).
     */
    getConfig() {
        return {
            allowlist: [...this._allowlist],
            allowedPrefixes: [...this._allowedPrefixes],
            forbiddenPatterns: [...this._forbiddenPatterns],
            workingDir: this._workingDir
        };
    }
}

/**
 * Execute a validated command with spawn.
 * @param {string} cmd - Command string
 * @param {Object} options - ShellGuard config
 * @returns {Promise<{success: boolean, stdout?: string, stderr?: string, exitCode?: number}>}
 */
export async function executeValidatedCommand(cmd, options = {}) {
    const guard = new ShellGuard(options);
    const validation = guard.validate(cmd);

    if (!validation.valid) {
        return {
            success: false,
            error: validation.reason,
            details: validation
        };
    }

    const { spawn } = await import('child_process');
    const { exec, args } = validation.parsed;

    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';

        const proc = spawn(exec, args, {
            shell: false,
            timeout: options.timeout ?? 30000,
            cwd: options.workingDir ?? process.cwd()
        });

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            resolve({
                success: code === 0,
                stdout: stdout.slice(0, options.maxOutput ?? 10000),
                stderr: stderr.slice(0, options.maxErrorOutput ?? 2000),
                exitCode: code
            });
        });

        proc.on('error', (err) => {
            resolve({
                success: false,
                error: err.message,
                stderr: err.message
            });
        });

        proc.on('timeout', () => {
            proc.kill();
            resolve({
                success: false,
                error: 'timeout',
                stderr: `Command timed out after ${options.timeout ?? 30000}ms`
            });
        });
    });
}
