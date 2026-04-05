#!/usr/bin/env node
/**
 * Raw TCP IRC test client — no external packages needed.
 * Connects to embedded server, joins channel, sends message,
 * waits for an actual bot response (not join announcements).
 */
import { createConnection } from 'net';

const NICK = 'TestUser';
const CHANNEL = '##metta';
const BOT_NICK = 'SeNARchy';
const TEST_MSG = 'Hello bot, can you hear me?';

function send(sock, line) { sock.write(line + '\r\n'); }

const sock = createConnection(6668, '127.0.0.1', () => {
    console.log('🔌 Connected');
    send(sock, `NICK ${NICK}`);
    send(sock, `USER ${NICK.toLowerCase()} 0 * :Test`);
});

let buffer = '';
let joined = false;
let messageSent = false;
let joinAnnouncementSeen = false;
const startTime = Date.now();

sock.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\r\n');
    buffer = lines.pop();

    for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(' ');
        const code = parts[1];

        if (code === '001') {
            console.log('✅ Registered');
            setTimeout(() => { send(sock, `JOIN ${CHANNEL}`); }, 500);
            return;
        }

        if (code === '366' && !joined) {
            joined = true;
            console.log('📩 Joined channel');
            setTimeout(() => {
                console.log(`💬 Sending: ${TEST_MSG}`);
                send(sock, `PRIVMSG ${CHANNEL} :${TEST_MSG}`);
                messageSent = true;
            }, 500);
            return;
        }

        // Detect bot PRIVMSG — but NOT the automated join announcement
        if (line.includes('PRIVMSG') && line.includes(BOT_NICK)) {
            const content = line.substring(line.indexOf(':', line.indexOf(BOT_NICK)) + 1);
            // Skip the automated join announcement (sent ~2s after bot connects)
            if (content.includes('🤖') || content.includes('Ask me anything') || content.includes('type !help')) {
                console.log(`📢 (join announcement ignored)`);
                return;
            }
            console.log(`📨 Bot response: ${content}`);
            console.log(`✅ END-TO-END TEST PASSED (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
            setTimeout(() => { send(sock, 'QUIT :Test complete'); sock.end(); process.exit(0); }, 1000);
        }
    }
});

sock.on('error', (err) => { console.error('❌', err.message); process.exit(1); });

setTimeout(() => {
    console.log(`❌ TIMEOUT (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
    console.log(`   Join announcement seen: ${joinAnnouncementSeen}`);
    console.log(`   Message sent: ${messageSent}`);
    console.log('   Check bot logs for: [MeTTa] LLM: ... and [MeTTa auto-respond]');
    process.exit(1);
}, 120000);
