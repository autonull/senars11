import {expect, test as base} from '@playwright/test';
import {NarPage} from '../utils/NarPage.js';
import {spawn} from 'child_process';
import {setTimeout} from 'timers/promises';
import net from 'net';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to find a free port
async function getFreePort() {
    return new Promise(resolve => {
        const srv = net.createServer();
        srv.listen(0, () => {
            const port = srv.address().port;
            srv.close(() => resolve(port));
        });
    });
}

// Helper to wait for port
async function waitForPort(port, timeout = 20000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        try {
            await new Promise((resolve, reject) => {
                const socket = new net.Socket();
                socket.setTimeout(500);
                socket.on('connect', () => {
                    socket.destroy();
                    resolve();
                });
                socket.on('timeout', () => {
                    socket.destroy();
                    reject(new Error('timeout'));
                });
                socket.on('error', (e) => {
                    socket.destroy();
                    reject(e);
                });
                socket.connect(port, 'localhost');
            });
            return true;
        } catch (e) {
            await setTimeout(200);
        }
    }
    throw new Error(`Timeout waiting for port ${port}`);
}

export const test = base.extend({
    realBackend: async ({}, use) => {
        console.log('🚀 Starting SeNARS via launcher.js...');

        const wsPort = await getFreePort();
        const uiPort = await getFreePort();

        const rootDir = path.resolve(__dirname, '../../../../');
        const launcherPath = path.resolve(rootDir, 'scripts/ui/launcher.js');

        const narProcess = spawn('node', [
            launcherPath,
            '--prod',
            '--ws-port', wsPort.toString(),
            '--port', uiPort.toString()
        ], {
            cwd: rootDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {...process.env}
        });

        narProcess.stdout.on('data', (d) => console.log(`[LAUNCHER]: ${d}`));
        narProcess.stderr.on('data', (d) => console.error(`[LAUNCHER ERR]: ${d}`));

        try {
            await Promise.all([
                waitForPort(wsPort, 20000),
                waitForPort(uiPort, 20000)
            ]);
        } catch (e) {
            console.error('Backend/UI failed to start');
            narProcess.kill();
            throw e;
        }

        await use({wsPort, uiPort});

        // Graceful shutdown
        narProcess.kill('SIGINT');
        await setTimeout(2000);

        if (!narProcess.killed) narProcess.kill('SIGKILL');
    },

    productionPage: async ({page, realBackend}, use) => {
        const {uiPort} = realBackend;

        const narPage = new NarPage(page);
        await page.goto(`http://localhost:${uiPort}/ide.html`);
        await narPage.waitForConnection();

        await use(narPage);
    }
});

export {expect};
