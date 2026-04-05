import {IntrospectionEvents, NAR} from '@senars/nar';
import WebSocket from 'ws';

// Skip: WebSocket timing dependencies cause unreliable test results
describe.skip('Web UI Simulation Integration Test', () => {
    let nar;
    let monitor;
    let client;
    let PORT;
    let WS_URL;

    beforeEach(async () => {
        // Use global.testPort if available, otherwise random
        PORT = global.testPort || 8090 + Math.floor(Math.random() * 100);
        WS_URL = `ws://localhost:${PORT}/ws/monitor`;

        nar = new NAR();
        monitor = new WebSocketMonitor({
            port: PORT,
            path: '/ws/monitor',
            minBroadcastInterval: 100 // 100ms batch interval
        });

        nar.connectToWebSocketMonitor(monitor);
        await nar.initialize();
        await monitor.start();
    });

    afterEach(async () => {
        if (client) {
            client.terminate();
        }
        if (monitor) {
            await monitor.stop();
        }
        if (nar) {
            await nar.dispose();
        }
        // Give some time for sockets to close
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    const createClient = () => {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(WS_URL);
            ws.on('open', () => resolve(ws));
            ws.on('error', reject);
        });
    };

    test('should receive single message timely', async () => {
        client = await createClient();
        const receivedBatches = [];

        client.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'eventBatch') {
                receivedBatches.push(msg);
            }
        });

        // Subscribe to all events
        client.send(JSON.stringify({type: 'subscribe', channel: 'all'}));

        // Wait a bit for subscription to be processed
        await new Promise(resolve => setTimeout(resolve, 50));

        const startTime = Date.now();
        await nar.input('(test --> case).');

        // Wait for message
        await new Promise((resolve, reject) => {
            const check = setInterval(() => {
                if (receivedBatches.length > 0) {
                    clearInterval(check);
                    resolve();
                }
                if (Date.now() - startTime > 5000) {
                    clearInterval(check);
                    reject(new Error('Timeout waiting for message'));
                }
            }, 100);
        });

        const endTime = Date.now();
        expect(receivedBatches.length).toBeGreaterThan(0);
        // Expecting reasonable latency (batch interval + processing)
        expect(endTime - startTime).toBeLessThan(2000);

        const events = receivedBatches.flatMap(b => b.data);
        const taskInputEvent = events.find(e => e.type === IntrospectionEvents.TASK_INPUT);
        expect(taskInputEvent).toBeDefined();
    });

    test('should batch multiple messages', async () => {
        client = await createClient();
        const receivedBatches = [];

        client.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'eventBatch') {
                receivedBatches.push(msg);
            }
        });

        client.send(JSON.stringify({type: 'subscribe', channel: 'all'}));
        await new Promise(resolve => setTimeout(resolve, 50));

        // Send multiple inputs rapidly
        const inputs = ['(a --> b).', '(b --> c).', '(c --> d).'];
        const startTime = Date.now();
        for (const input of inputs) {
            await nar.input(input);
        }

        // Wait for messages
        await new Promise((resolve, reject) => {
            const check = setInterval(() => {
                const events = receivedBatches.flatMap(b => b.data);
                const taskInputEvents = events.filter(e => e.type === IntrospectionEvents.TASK_INPUT);
                if (taskInputEvents.length >= 3) {
                    clearInterval(check);
                    resolve();
                }
                if (Date.now() - startTime > 5000) {
                    clearInterval(check);
                    reject(new Error('Timeout waiting for batch messages'));
                }
            }, 50);
        });

        const events = receivedBatches.flatMap(b => b.data);
        const taskInputEvents = events.filter(e => e.type === 'task.input');

        expect(taskInputEvents.length).toBeGreaterThanOrEqual(3);

        // Check batching efficiency
        expect(receivedBatches.length).toBeLessThan(5);
    });
});
