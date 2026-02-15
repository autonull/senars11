// Test server for Playwright
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

// Start the mock backend server
const mockBackend = spawn('node', ['-e', `
  import { WebSocketServer } from 'ws';

  const wss = new WebSocketServer({ port: 8081 });

  wss.on('connection', (ws) => {
    console.log('Mock backend: client connected');
    ws.on('message', (message) => {
      const parsed = JSON.parse(message.toString());

      // For debug commands, just acknowledge receipt
      ws.send(JSON.stringify({
        type: 'info',
        payload: { message: 'Acknowledged: ' + parsed.type }
      }));
    });
  });
  
  console.log('Mock backend server listening on ws://localhost:8081');
`], {
  stdio: 'inherit',
  shell: true
});

// Wait for mock backend to start
await setTimeout(2000);

// Start the UI server
const server = spawn('node', ['server.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    HTTP_PORT: '8080',
    WS_PORT: '8081'
  }
});

// Keep the process alive
process.on('exit', () => {
  mockBackend.kill();
  server.kill();
});

process.on('SIGINT', () => {
  mockBackend.kill();
  server.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  mockBackend.kill();
  server.kill();
  process.exit(0);
});