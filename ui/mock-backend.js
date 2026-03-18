import {WebSocketServer} from 'ws';

// Mock Backend for Testing
const port = process.env.WS_PORT || 8081;
const wss = new WebSocketServer({port: Number(port)});

console.log(`Mock backend starting on port ${port}`);

wss.on('connection', (ws) => {
    console.log('Mock backend: client connected');

    ws.on('message', (message) => {
        console.log('Mock backend received:', message.toString());

        let parsed;
        try {
            parsed = JSON.parse(message.toString());
        } catch (e) {
            console.error('Failed to parse message:', e);
            return;
        }

        // Handle specific commands to make tests pass
        if (parsed.type === 'narseseInput') {
            // Echo back the input as a log
            const input = parsed.payload.input || parsed.payload.text;
            ws.send(JSON.stringify({
                type: 'log',
                payload: {message: `> ${input}`}
            }));

            // Simulate processing result
            if (input && input.includes('-->')) {
                const parts = input.split('-->');
                const subject = parts[0].replace(/[< >]/g, '');
                const predicate = parts[1].replace(/[< >.]/g, '');

                // Echo specific terms for verification
                ws.send(JSON.stringify({
                    type: 'log',
                    payload: {message: subject} // Send 'bird'
                }));
                ws.send(JSON.stringify({
                    type: 'log',
                    payload: {message: predicate} // Send 'flyer'
                }));
            }

            ws.send(JSON.stringify({
                type: 'narsese.result',
                payload: {result: 'OK'}
            }));
        } else if (parsed.type === 'control/refresh') {
            ws.send(JSON.stringify({
                type: 'log',
                payload: {message: 'Graph refresh requested'}
            }));
        } else {
            // Default ack
            ws.send(JSON.stringify({
                type: 'info',
                payload: {message: 'Acknowledged: ' + parsed.type}
            }));
        }
    });
});

console.log(`Mock backend server listening on ws://localhost:${port}`);
