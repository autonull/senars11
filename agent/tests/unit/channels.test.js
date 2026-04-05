import {jest} from '@jest/globals';

const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
};

await jest.unstable_mockModule('@senars/core', () => ({
    Logger: mockLogger,
    generateId: (prefix = 'id') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}));

const {Embodiment} = await import('../../src/io/Embodiment.js');
const {EmbodimentBus} = await import('../../src/io/EmbodimentBus.js');

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

    async connect() {
        this.setStatus('connected');
    }

    async disconnect() {
        this.setStatus('disconnected');
    }

    async sendMessage(target, content, metadata) {
        return true;
    }
}

describe('Channel Infrastructure', () => {
    let bus;
    let channel;

    beforeEach(() => {
        bus = new EmbodimentBus();
        channel = new MockChannel({id: 'test-chan'});
    });

    test('should register and connect channel', async () => {
        const emitSpy = jest.spyOn(bus, 'emit');
        bus.register(channel);
        await channel.connect();

        expect(bus.get('test-chan')).toBe(channel);
        expect(channel.status).toBe('connected');
        expect(emitSpy).toHaveBeenCalledWith('embodiment.registered', channel);
    });

    test('should route messages from channel to bus', () => {
        const emitSpy = jest.spyOn(bus, 'emit');
        bus.register(channel);

        channel.emitMessage({from: 'user1', content: 'hello'});

        expect(emitSpy).toHaveBeenCalledWith('message', expect.objectContaining({
            content: 'hello',
            from: 'user1'
        }));
    });

    test('should send message through bus', async () => {
        bus.register(channel);
        await channel.connect();
        const sendSpy = jest.spyOn(channel, 'sendMessage');

        await bus.sendMessage('test-chan', '#general', 'hi');
        expect(sendSpy).toHaveBeenCalledWith('#general', 'hi', {});
    });

    test('should unregister and disconnect', async () => {
        bus.register(channel);
        await channel.connect();

        const disconnectSpy = jest.spyOn(channel, 'disconnect');
        await bus.unregister('test-chan');

        expect(disconnectSpy).toHaveBeenCalled();
        expect(bus.get('test-chan')).toBeUndefined();
    });
});
