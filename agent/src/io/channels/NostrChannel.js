/**
 * NostrChannel.js - Nostr Protocol Implementation
 * Uses 'nostr-tools' and 'ws' for decentralized messaging.
 */
import { Channel } from '../Channel.js';
import { SimplePool, getPublicKey, finalizeEvent, nip19 } from 'nostr-tools';
import { WebSocket } from 'ws'; // Node.js WebSocket polyfill if needed
import { Logger } from '@senars/core';
import { randomBytes } from 'crypto';

// Polyfill WebSocket for Node environment if not present globally
if (typeof global.WebSocket === 'undefined') {
    global.WebSocket = WebSocket;
}

export class NostrChannel extends Channel {
    constructor(config = {}) {
        super(config);
        this.type = 'nostr';
        this.pool = new SimplePool();
        this.relays = config.relays || ['wss://relay.damus.io', 'wss://relay.nostr.band'];

        // Key management
        this.sk = config.privateKey; // Hex private key
        if (!this.sk) {
             // Generate ephemeral key if none provided (warning: identity lost on restart)
             // For simplicity, we require a key or generate a throwaway one for testing
             // In production, keys should be loaded securely
             this.sk = this._generatePrivateKey();
             Logger.warn(`[Nostr:${this.id}] Using ephemeral private key. Identity will be lost on restart.`);
        }

        try {
            this.pk = getPublicKey(this.sk);
        } catch (e) {
            throw new Error(`Invalid private key for Nostr: ${e.message}`);
        }

        this.subscriptions = new Map();
    }

    _generatePrivateKey() {
        // Simple random 32-byte hex string generation for ephemeral keys
        // In a real app, use generateSecretKey() from nostr-tools
        const array = new Uint8Array(32);
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
             crypto.getRandomValues(array);
             return Buffer.from(array).toString('hex');
        } else {
            // Node.js fallback using imported crypto module
            return randomBytes(32).toString('hex');
        }
    }

    async connect() {
        if (this.status === 'connected') return;
        this.setStatus('connecting');

        try {
            // Verify relay connectivity
            // SimplePool handles connections lazily, but we want to ensure at least one is reachable
            // We can just set status to connected as the pool manages the sockets
            this.setStatus('connected');
            Logger.info(`[Nostr:${this.id}] Ready. Public Key: ${this.pk}`);

            // Auto-subscribe to DM's or specific filters if configured
            if (this.config.filters) {
                this.subscribe('main', this.config.filters);
            } else {
                // Default: Listen for DMs (kind 4) and mentions (kind 1 with p tag)
                this.subscribe('dms', [{ kinds: [4], '#p': [this.pk] }]);
                this.subscribe('mentions', [{ kinds: [1], '#p': [this.pk] }]);
            }
        } catch (error) {
            this.setStatus('error');
            Logger.error(`[Nostr:${this.id}] Connection failed:`, error);
            throw error;
        }
    }

    async disconnect() {
        this.subscriptions.forEach(sub => sub.close());
        this.subscriptions.clear();
        this.pool.close(this.relays);
        this.setStatus('disconnected');
    }

    subscribe(id, filters) {
        // Close existing subscription with same ID
        if (this.subscriptions.has(id)) {
            this.subscriptions.get(id).close();
        }

        const sub = this.pool.subscribeMany(
            this.relays,
            filters,
            {
                onevent: (event) => {
                    this._handleEvent(event);
                },
                oneose: () => {
                    // End of stored events
                }
            }
        );

        this.subscriptions.set(id, sub);
        Logger.info(`[Nostr:${this.id}] Subscribed to '${id}'`);
    }

    async _handleEvent(event) {
        // Decrypt DMs if kind 4
        let content = event.content;

        if (event.kind === 4) {
            try {
                // Decryption requires nip04 implementation
                // For this MVP, we might skip full NIP-04 decryption implementation
                // unless 'nostr-tools' nip04 module is fully available and easy to use in this context.
                // We'll placeholder it.
                if (this.config.decrypt !== false) {
                     const { nip04 } = await import('nostr-tools');
                     content = await nip04.decrypt(this.sk, event.pubkey, event.content);
                }
            } catch (e) {
                Logger.warn(`[Nostr:${this.id}] Failed to decrypt DM:`, e);
                content = '<encrypted>';
            }
        }

        this.emitMessage(event.pubkey, content, {
            id: event.id,
            kind: event.kind,
            tags: event.tags,
            created_at: event.created_at
        });
    }

    async sendMessage(target, content, metadata = {}) {
        if (this.status !== 'connected') throw new Error('Not connected to Nostr');

        const eventTemplate = {
            kind: metadata.kind || 1,
            created_at: Math.floor(Date.now() / 1000),
            tags: metadata.tags || [],
            content: content,
        };

        // If target is a public key, we might be sending a DM (kind 4) or a reply
        if (metadata.kind === 4) {
            // Encrypt content
             const { nip04 } = await import('nostr-tools');
             eventTemplate.content = await nip04.encrypt(this.sk, target, content);
             eventTemplate.tags.push(['p', target]);
        }

        // Sign event
        const event = finalizeEvent(eventTemplate, this.sk);

        // Publish to all relays
        try {
            await Promise.any(this.pool.publish(this.relays, event));
            return true;
        } catch (error) {
            Logger.error(`[Nostr:${this.id}] Failed to publish:`, error);
            throw error;
        }
    }
}
