/**
 * @file ProcessManager.js
 * @description Utility for managing external processes with consistent lifecycle
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

export class ProcessManager {
    static async startProcess({
        command,
        args,
        cwd,
        env = process.env,
        timeout = 30000,
        readyCondition,
        stdoutHandler,
        stderrHandler = (data) => {
            const str = data.toString();
            if (!str.includes('ExperimentalWarning')) {
                console.error(`[PROCESS-ERROR] ${str.trim()}`);
            }
        }
    }) {
        const processHandle = spawn(command, args, {
            cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...env }
        });

        return new Promise((resolve, reject) => {
            let output = '';
            const startTime = Date.now();

            processHandle.stdout.on('data', (data) => {
                const str = data.toString();
                output += str;
                
                if (stdoutHandler) {
                    stdoutHandler(data, processHandle);
                }
                
                if (readyCondition && readyCondition(str, output)) {
                    resolve(processHandle);
                }
            });

            processHandle.stderr.on('data', stderrHandler);

            const timeoutId = setTimeout(() => {
                reject(new Error(`Process failed to start within ${timeout}ms`));
                processHandle.kill('SIGKILL');
            }, timeout);

            // Check periodically if condition is met
            const intervalId = setInterval(() => {
                if (readyCondition && readyCondition(output, output)) {
                    clearInterval(intervalId);
                    clearTimeout(timeoutId);
                    resolve(processHandle);
                }
                
                if (Date.now() - startTime > timeout) {
                    clearInterval(intervalId);
                    clearTimeout(timeoutId);
                    reject(new Error(`Process failed to start within ${timeout}ms`));
                    processHandle.kill('SIGKILL');
                }
            }, 200);
        });
    }

    static async stopProcess(processHandle, timeout = 3000) {
        if (!processHandle) return Promise.resolve();

        return new Promise((resolve) => {
            processHandle.removeAllListeners();

            const killTimeout = setTimeout(() => {
                processHandle.kill('SIGKILL');
            }, timeout);

            processHandle.on('close', () => {
                clearTimeout(killTimeout);
                resolve();
            });

            processHandle.kill('SIGTERM');
        });
    }

    static async createTempScript(content, dir = '.', prefix = 'temp') {
        const tempScriptPath = join(dir, `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}.js`);
        await fs.writeFile(tempScriptPath, content);
        return tempScriptPath;
    }

    static async cleanupTempFile(filePath) {
        try {
            await fs.unlink(filePath);
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}