const { test: base, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const { setTimeout } = require('timers/promises');

// Define test fixtures
const test = base.extend({
  // Start the UI server before running tests
  server: async ({ }, use) => {
    // Start a mock backend server
    const mockBackend = spawn('node', ['-e', `
      import { WebSocketServer } from 'ws';

      const wss = new WebSocketServer({ port: 8081 });

      wss.on('connection', (ws) => {
        ws.on('message', (message) => {
          const parsed = JSON.parse(message.toString());

          // For debug commands, just acknowledge receipt
          ws.send(JSON.stringify({
            type: 'info',
            payload: { message: 'Acknowledged: ' + parsed.type }
          }));
        });
      });
    `], {
      stdio: 'pipe',
      shell: true
    });

    // Wait for mock backend to start
    await setTimeout(2000);

    // Start the UI server
    const server = spawn('node', ['server.js'], {
      cwd: './',
      stdio: 'pipe',
      env: {
        ...process.env,
        HTTP_PORT: '8080',
        WS_PORT: '8081'
      }
    });

    // Wait for UI server to start
    await setTimeout(2000);

    // Use the server
    await use({ mockBackend, server });

    // Cleanup after tests
    mockBackend.kill();
    server.kill();
  }
});

module.exports = { test, expect };