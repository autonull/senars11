import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Starting Mock Environment...');

const ui = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, PORT: '8080', WS_PORT: '8081' }
});

const mockBackend = spawn('node', ['mock-backend.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, WS_PORT: '8081' }
});

const cleanup = () => {
    console.log('Stopping Mock Environment...');
    ui.kill();
    mockBackend.kill();
    process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
