#!/usr/bin/env node

/**
 * IRC Test - Connect to irc.quakenet.org ##metta
 */

import { IRCChannel } from '@senars/agent/io/index.js';
import { Logger } from '@senars/core';

async function main() {
    Logger.info('🔌 Testing IRC connection to irc.quakenet.org ##metta...');

    const channel = new IRCChannel({
        id: 'test-irc',
        host: 'irc.quakenet.org',
        port: 6667,
        nick: 'senars-test',
        username: 'senars',
        realname: 'SeNARS Test Bot',
        tls: false,
        channels: ['##metta']
    });

    let isConnected = false;
    let messageCount = 0;
    let connectionPromise;

    // Create a promise that resolves when connected
    connectionPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Connection timeout after 10 seconds'));
        }, 10000);

        channel.once('connected', (event) => {
            clearTimeout(timeout);
            resolve(event);
        });

        channel.once('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });

    // Set up event handlers
    channel.on('connected', async (event) => {
        Logger.info('✅ Connected to IRC!');
        Logger.info(`   Nick: ${event.nick}`);
        isConnected = true;

        // Send a test message after joining
        setTimeout(async () => {
            if (channel.status === 'connected') {
                Logger.info('📤 Sending test message...');
                try {
                    await channel.sendMessage('##metta', 'Hello from SeNARS IRC test!');
                } catch (e) {
                    Logger.error('Failed to send message:', e.message);
                }
            }
        }, 2000);
    });

    channel.on('message', (data) => {
        messageCount++;
        Logger.info(`💬 [${data.channel || 'unknown'}] ${data.from || 'unknown'}: ${data.content}`);
    });

    channel.on('disconnected', () => {
        Logger.info('❌ Disconnected from IRC');
        isConnected = false;
    });

    channel.on('error', (err) => {
        Logger.error('IRC Error:', err);
    });

    channel.on('close', () => {
        Logger.info('IRC connection closed');
    });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        Logger.info('\n👋 Received SIGINT, disconnecting...');
        await channel.disconnect();
        process.exit(0);
    });

    try {
        await channel.connect();
        
        // Wait for connection
        await connectionPromise;
        
        Logger.info('⏳ Waiting for messages (Ctrl+C to exit, or will exit after 30 seconds)...');

        // Keep alive for 30 seconds to test and listen for responses
        await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                Logger.info(`⏰ Timeout reached. Received ${messageCount} messages.`);
                resolve();
            }, 30000);

            // Also resolve if disconnected unexpectedly
            channel.on('disconnected', () => {
                clearTimeout(timeout);
                resolve();
            });
        });

    } catch (error) {
        Logger.error('Failed to connect:', error.message);
    } finally {
        Logger.info('👋 Disconnecting...');
        await channel.disconnect();
        process.exit(0);
    }
}

main().catch(err => {
    Logger.error('Fatal:', err);
    process.exit(1);
});
