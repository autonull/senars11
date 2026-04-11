// Simple IRC client that connects to the embedded server and sends a message
import { Client } from 'irc-framework';

const client = new Client();
client.connect({
    host: '127.0.0.1',
    port: 6668,
    nick: 'TestUser',
    username: 'testuser',
    gecos: 'Test User',
    auto_reconnect: false
});

client.on('registered', (event) => {
    console.log(`✅ Connected as ${event.nick}`);
    setTimeout(() => {
        console.log('📩 Joining #testchan...');
        client.join('#testchan');
    }, 1000);
});

client.on('join', (event) => {
    console.log(`👤 ${event.nick} joined ${event.channel}`);
    if (event.nick === 'TestUser') {
        setTimeout(() => {
            console.log('💬 Sending test message...');
            client.say('#testchan', 'Hello bot, can you hear me?');
        }, 1000);
    }
});

client.on('message', (event) => {
    console.log(`📨 [${event.type}] ${event.nick}: ${event.message}`);
    if (event.nick === 'SeNARchy') {
        console.log('✅ Bot responded! Test passed.');
        setTimeout(() => process.exit(0), 1000);
    }
});

setTimeout(() => {
    console.log('❌ Timeout — bot did not respond within 30s');
    process.exit(1);
}, 30000);
