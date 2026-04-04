import { jest } from '@jest/globals';
import { Embodiment } from '../../src/io/Embodiment.js';
import { ChannelManager } from '../../src/io/ChannelManager.js';
import { EmbodimentBus } from '../../src/io/EmbodimentBus.js';

jest.mock('@senars/core', () => ({
    Logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

if (typeof setImmediate === 'undefined') {
    global.setImmediate = (fn) => setTimeout(fn, 0);
    global.clearImmediate = (id) => clearTimeout(id);
}

class MockChannel extends Embodiment {
    constructor(config) {
        super({
            ...config,
            name: config.name || 'Mock',
            description: 'Mock channel for testing',
            capabilities: [],
            constraints: {},
            isPublic: false,
            isInternal: false
        });
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
    let bus;
    let channel;

    beforeEach(() => {
        bus = new EmbodimentBus();
        manager = new ChannelManager({}, bus);
        channel = new MockChannel({ id: 'test-chan' });
    });

    test('should register and connect channel', async () => {
        const emitSpy = jest.spyOn(bus, 'emit');
        manager.register(channel);
        await channel.connect();

        expect(manager.get('test-chan')).toBe(channel);
        expect(channel.status).toBe('connected');
        expect(emitSpy).toHaveBeenCalledWith('embodiment.registered', channel);
    });

    test('should route messages from channel to bus', () => {
        const emitSpy = jest.spyOn(bus, 'emit');
        manager.register(channel);

        channel.emitMessage({ from: 'user1', content: 'hello' });

        expect(emitSpy).toHaveBeenCalledWith('message', expect.objectContaining({
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

    test('should unregister and disconnect', async () => {
        manager.register(channel);
        await channel.connect();

        const disconnectSpy = jest.spyOn(channel, 'disconnect');
        await manager.unregister('test-chan');

        expect(disconnectSpy).toHaveBeenCalled();
        expect(manager.get('test-chan')).toBeUndefined();
    });
});
