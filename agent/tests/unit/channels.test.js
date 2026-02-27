import { jest } from '@jest/globals';
import { Channel } from '../../src/io/Channel.js';
import { ChannelManager } from '../../src/io/ChannelManager.js';

// Mock Logger
jest.mock('@senars/core', () => ({
    Logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

// Add a mock implementation of setImmediate/clearImmediate for environments where they might be missing/behaving oddly
if (typeof setImmediate === 'undefined') {
    global.setImmediate = (fn) => setTimeout(fn, 0);
    global.clearImmediate = (id) => clearTimeout(id);
}

class MockChannel extends Channel {
    constructor(config) {
        super(config);
        this.type = 'mock';
    }
    async connect() { this.setStatus('connected'); }
    async disconnect() { this.setStatus('disconnected'); }
    async sendMessage(target, content, metadata) {
        return true;
    }
}

describe('Channel Infrastructure', () => {
    let manager;
    let channel;

    beforeEach(() => {
        // Setup with fast rate limiter for tests
        manager = new ChannelManager({ rateLimit: { max: 100, interval: 100 } });
        channel = new MockChannel({ id: 'test-chan' });
    });

    test('should register and connect channel', async () => {
        // Mock emit to verify call
        const emitSpy = jest.spyOn(manager, 'emit');
        manager.register(channel);
        await channel.connect();

        expect(manager.get('test-chan')).toBe(channel);
        expect(channel.status).toBe('connected');
        expect(emitSpy).toHaveBeenCalledWith('channel.registered', channel);
    });

    test('should route messages from channel to manager', () => {
        const emitSpy = jest.spyOn(manager, 'emit');
        manager.register(channel);

        channel.emitMessage('user1', 'hello');

        expect(emitSpy).toHaveBeenCalledWith('message', expect.objectContaining({
            channelId: 'test-chan',
            content: 'hello',
            from: 'user1'
        }));
    });

    test('should send message through manager', async () => {
        manager.register(channel);
        await channel.connect();
        const sendSpy = jest.spyOn(channel, 'sendMessage');

        await manager.sendMessage('test-chan', '#general', 'hi');
        expect(sendSpy).toHaveBeenCalledWith('#general', 'hi', {});
    });

    test('should apply rate limiting', async () => {
        // Create manager with strict limits
        manager = new ChannelManager({ rateLimit: { max: 1, interval: 500 } });
        manager.register(channel);
        await channel.connect(); // Ensure connected status logic if checked (not checked in mock)

        const start = Date.now();
        await manager.sendMessage('test-chan', 'u1', 'msg1');
        // This second message should wait approx 500ms
        await manager.sendMessage('test-chan', 'u1', 'msg2');
        const duration = Date.now() - start;

        // Allow some flexibility in timer resolution (e.g. > 450ms)
        expect(duration).toBeGreaterThan(450);
    }, 10000); // Increase timeout

    test('should unregister and disconnect', async () => {
        manager.register(channel);
        await channel.connect();

        const disconnectSpy = jest.spyOn(channel, 'disconnect');
        await manager.unregister('test-chan');

        expect(disconnectSpy).toHaveBeenCalled();
        expect(manager.get('test-chan')).toBeUndefined();
    });
});
