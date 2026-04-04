/**
 * EmbodimentBus Test Suite
 * 
 * Tests for Phase 5: Embodiment Abstraction
 * - FIFO message retrieval
 * - Salience-ordered message retrieval
 * - Embodiment registration/unregistration
 * - Message routing
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EmbodimentBus } from '../../src/io/EmbodimentBus.js';
import { Embodiment } from '../../src/io/Embodiment.js';

// Mock embodiment for testing
class MockEmbodiment extends Embodiment {
    constructor(config = {}) {
        super({
            ...config,
            name: config.name || 'Mock',
            defaultSalience: config.defaultSalience ?? 0.5
        });
        this.type = 'mock';
    }

    async connect() {
        this.setStatus('connected');
    }

    async disconnect() {
        this.setStatus('disconnected');
    }

    async sendMessage(target, content, metadata = {}) {
        return true;
    }
}

describe('EmbodimentBus', () => {
    let bus;

    beforeEach(() => {
        bus = new EmbodimentBus({ attentionSalience: false });
    });

    afterEach(async () => {
        await bus.shutdown();
    });

    describe('Embodiment Registration', () => {
        it('should register an embodiment', () => {
            const embodiment = new MockEmbodiment({ id: 'mock1' });
            bus.register(embodiment);
            
            expect(bus.get('mock1')).toBe(embodiment);
            expect(bus.getAll().length).toBe(1);
        });

        it('should throw error on duplicate registration', () => {
            const embodiment = new MockEmbodiment({ id: 'mock1' });
            bus.register(embodiment);
            
            expect(() => bus.register(embodiment)).toThrow('already registered');
        });

        it('should unregister an embodiment', async () => {
            const embodiment = new MockEmbodiment({ id: 'mock1' });
            await embodiment.connect();
            bus.register(embodiment);
            
            await bus.unregister('mock1');
            
            expect(bus.get('mock1')).toBeUndefined();
            expect(embodiment.status).toBe('disconnected');
        });

        it('should emit registration events', (done) => {
            const embodiment = new MockEmbodiment({ id: 'mock1' });
            
            bus.on('embodiment.registered', (registered) => {
                expect(registered).toBe(embodiment);
                done();
            });
            
            bus.register(embodiment);
        });
    });

    describe('FIFO Message Retrieval', () => {
        it('should retrieve messages in FIFO order', async () => {
            const embodiment1 = new MockEmbodiment({ id: 'emb1', defaultSalience: 0.3 });
            const embodiment2 = new MockEmbodiment({ id: 'emb2', defaultSalience: 0.7 });
            
            bus.register(embodiment1);
            bus.register(embodiment2);
            
            await embodiment1.connect();
            await embodiment2.connect();
            
            // Send messages in order
            embodiment1.emitMessage({ from: 'user1', content: 'First message' });
            embodiment2.emitMessage({ from: 'user2', content: 'Second message' });
            embodiment1.emitMessage({ from: 'user1', content: 'Third message' });
            
            // Retrieve in FIFO order
            const msg1 = bus.getNextMessage({ mode: 'FIFO' });
            const msg2 = bus.getNextMessage({ mode: 'FIFO' });
            const msg3 = bus.getNextMessage({ mode: 'FIFO' });
            
            expect(msg1.content).toBe('First message');
            expect(msg2.content).toBe('Second message');
            expect(msg3.content).toBe('Third message');
        });

        it('should return null when queue is empty', () => {
            const msg = bus.getNextMessage();
            expect(msg).toBeNull();
        });

        it('should remove retrieved message from queue', () => {
            const embodiment = new MockEmbodiment({ id: 'emb1' });
            bus.register(embodiment);
            embodiment.emitMessage({ from: 'user', content: 'Test' });
            
            bus.getNextMessage();
            expect(bus.getQueueLength()).toBe(0);
        });
    });

    describe('Salience-Ordered Message Retrieval', () => {
        it('should retrieve messages by salience order', async () => {
            bus = new EmbodimentBus({ attentionSalience: true });
            
            const lowSalience = new MockEmbodiment({ id: 'low', defaultSalience: 0.2 });
            const highSalience = new MockEmbodiment({ id: 'high', defaultSalience: 0.9 });
            const medSalience = new MockEmbodiment({ id: 'med', defaultSalience: 0.5 });
            
            bus.register(lowSalience);
            bus.register(highSalience);
            bus.register(medSalience);
            
            await lowSalience.connect();
            await highSalience.connect();
            await medSalience.connect();
            
            // Send messages in reverse salience order
            lowSalience.emitMessage({ from: 'user1', content: 'Low salience' });
            highSalience.emitMessage({ from: 'user2', content: 'High salience' });
            medSalience.emitMessage({ from: 'user3', content: 'Medium salience' });
            
            // Retrieve in salience order
            const msg1 = bus.getNextMessage({ mode: 'salience' });
            const msg2 = bus.getNextMessage({ mode: 'salience' });
            const msg3 = bus.getNextMessage({ mode: 'salience' });
            
            expect(msg1.content).toBe('High salience');
            expect(msg1.salience).toBeGreaterThan(0.8);
            
            expect(msg2.content).toBe('Medium salience');
            expect(msg2.salience).toBeGreaterThan(0.4);
            
            expect(msg3.content).toBe('Low salience');
            expect(msg3.salience).toBeLessThan(0.4);
        });

        it('should boost salience for private messages', () => {
            const embodiment = new MockEmbodiment({ id: 'emb1', defaultSalience: 0.3 });
            bus.register(embodiment);
            
            embodiment.emitMessage({ from: 'user', content: 'Public', isPrivate: false });
            embodiment.emitMessage({ from: 'user', content: 'Private', isPrivate: true });
            
            const messages = bus.peekMessages(2, 'salience');
            
            // Private message should have higher salience
            expect(messages[0].content).toBe('Private');
            expect(messages[0].salience).toBeGreaterThan(messages[1].salience);
        });

        it('should default to FIFO when salience ordering is disabled', () => {
            bus = new EmbodimentBus({ attentionSalience: false });
            
            const embodiment = new MockEmbodiment({ id: 'emb1' });
            bus.register(embodiment);
            
            embodiment.emitMessage({ from: 'user', content: 'First' });
            embodiment.emitMessage({ from: 'user', content: 'Second' });
            
            const msg = bus.getNextMessage();
            expect(msg.content).toBe('First');
        });
    });

    describe('Message Routing', () => {
        it('should send message through specific embodiment', async () => {
            const embodiment = new MockEmbodiment({ id: 'emb1' });
            bus.register(embodiment);
            await embodiment.connect();
            
            const sent = await bus.sendMessage('emb1', 'target', 'Hello');
            
            expect(sent).toBe(true);
        });

        it('should throw error for non-existent embodiment', async () => {
            await expect(bus.sendMessage('nonexistent', 'target', 'Hello'))
                .rejects.toThrow('not found');
        });

        it('should broadcast to all connected embodiments', async () => {
            const emb1 = new MockEmbodiment({ id: 'emb1' });
            const emb2 = new MockEmbodiment({ id: 'emb2' });
            
            bus.register(emb1);
            bus.register(emb2);
            
            await emb1.connect();
            await emb2.connect();
            
            const results = await bus.broadcast('target', 'Broadcast message');
            
            expect(results.emb1.success).toBe(true);
            expect(results.emb2.success).toBe(true);
        });

        it('should handle broadcast failures gracefully', async () => {
            const emb1 = new MockEmbodiment({ id: 'emb1' });
            const emb2 = new MockEmbodiment({ id: 'emb2' });
            
            bus.register(emb1);
            bus.register(emb2);
            
            await emb1.connect();
            // emb2 not connected
            
            const results = await bus.broadcast('target', 'Broadcast');
            
            expect(results.emb1.success).toBe(true);
            expect(results.emb2).toBeUndefined();
        });
    });

    describe('Stats and Introspection', () => {
        it('should return bus stats', () => {
            const embodiment = new MockEmbodiment({ id: 'emb1' });
            bus.register(embodiment);
            
            const stats = bus.getStats();
            
            expect(stats.totalEmbodiments).toBe(1);
            expect(stats.connectedEmbodiments).toBe(0);
            expect(stats.embodiments.emb1).toBeDefined();
        });

        it('should track message count', () => {
            const embodiment = new MockEmbodiment({ id: 'emb1' });
            bus.register(embodiment);
            
            embodiment.emitMessage({ from: 'user', content: 'Msg1' });
            embodiment.emitMessage({ from: 'user', content: 'Msg2' });
            
            const stats = bus.getStats();
            expect(stats.totalMessages).toBe(2);
        });
    });

    describe('Middleware', () => {
        it('should process messages through middleware', async () => {
            const processed = [];
            
            bus.use((msg, next) => {
                processed.push('mw1');
                msg.metadata.processed = true;
                next();
            });
            
            const embodiment = new MockEmbodiment({ id: 'emb1' });
            bus.register(embodiment);
            
            embodiment.emitMessage({ from: 'user', content: 'Test' });
            
            // Wait for async processing
            await new Promise(resolve => setTimeout(resolve, 10));
            
            const msg = bus.getNextMessage();
            expect(msg.metadata.processed).toBe(true);
        });

        it('should stop message propagation if middleware does not call next', async () => {
            bus.use((msg, next) => {
                // Don't call next - stop propagation
            });
            
            const embodiment = new MockEmbodiment({ id: 'emb1' });
            bus.register(embodiment);
            
            embodiment.emitMessage({ from: 'user', content: 'Test' });
            
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(bus.getQueueLength()).toBe(0);
        });
    });
});
