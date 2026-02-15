
import {NAR} from '../nar/NAR.js';
import {WebSocketMonitor} from '../server/WebSocketMonitor.js';

async function startServer() {
  const nar = new NAR();
  await nar.initialize();

  const monitor = new WebSocketMonitor({port: 8131});
  await monitor.start();
  monitor.listenToNAR(nar);

  console.log('WebSocket monitoring server started on ws://localhost:8131/ws');
}

startServer().catch(console.error);
        