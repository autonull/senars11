import { jest } from '@jest/globals';
import { Channel } from '../../src/io/Channel.js';
import { ChannelManager } from '../../src/io/ChannelManager.js';

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
        manager = new ChannelManager();
        channel = new MockChannel({ id: 'test-chan' });
    });

    test('should register and connect channel', async () => {
        const spy = jest.spyOn(manager, 'emit');
        manager.register(channel);
        await channel.connect();

        expect(manager.get('test-chan')).toBe(channel);
        expect(channel.status).toBe('connected');
        expect(spy).toHaveBeenCalledWith('channel.registered', channel);
    });

    test('should route messages from channel to manager', () => {
        const spy = jest.spyOn(manager, 'emit');
        manager.register(channel);

        channel.emitMessage('user1', 'hello');

        expect(spy).toHaveBeenCalledWith('message', expect.objectContaining({
            channelId: 'test-chan',
            content: 'hello',
            from: 'user1'
        }));
    });

    test('should send message through manager', async () => {
        manager.register(channel);
        await channel.connect();
        const spy = jest.spyOn(channel, 'sendMessage');

        await manager.sendMessage('test-chan', '#general', 'hi');
        expect(spy).toHaveBeenCalledWith('#general', 'hi', {});
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
