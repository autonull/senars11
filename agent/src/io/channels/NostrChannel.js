import {Embodiment} from '../Embodiment.js';
import {finalizeEvent, getPublicKey, SimplePool} from 'nostr-tools';
import {WebSocket} from 'ws';
import {Logger} from '@senars/core';
import {randomBytes} from 'crypto';

if (typeof global.WebSocket === 'undefined') {
    global.WebSocket = WebSocket;
}

export class NostrChannel extends Embodiment {
    constructor(config = {}) {
        super({
            ...config,
            name: config.name || 'Nostr',
            description: config.description || 'Nostr decentralized channel',
            capabilities: config.capabilities || ['private-messages', 'encryption', 'multi-relay'],
            constraints: {maxMessageLength: 65536},
            isPublic: config.isPublic ?? true,
            isInternal: false,
            defaultSalience: config.defaultSalience ?? 0.6
        });

        this.type = 'nostr';
        this.pool = new SimplePool();
        this.relays = config.relays || ['wss://relay.damus.io', 'wss://relay.nostr.band'];

        this.sk = config.privateKey;
        if (!this.sk) {
            this.sk = this._generatePrivateKey();
            Logger.warn(`[Nostr:${this.id}] Using ephemeral private key. Identity will be lost on restart.`);
        }

        this.skBytes = typeof this.sk === 'string' ? Uint8Array.from(this.sk.match(/.{2}/g).map(b => parseInt(b, 16))) : this.sk;

        try {
            this.pk = getPublicKey(this.skBytes);
        } catch (e) {
            throw new Error(`Invalid private key for Nostr: ${e.message}`);
        }

        this.subscriptions = new Map();
    }

    _generatePrivateKey() {
        const array = new Uint8Array(32);
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            crypto.getRandomValues(array);
            return Buffer.from(array).toString('hex');
        }
        return randomBytes(32).toString('hex');
    }

    async connect() {
        if (this.status === 'connected') {
            return;
        }
        this.setStatus('connecting');
        try {
            this.setStatus('connected');
            Logger.info(`[Nostr:${this.id}] Ready. Public Key: ${this.pk}`);
            if (this.config.filters) {
                this.subscribe('main', this.config.filters);
            } else {
                this.subscribe('dms', [{kinds: [4], '#p': [this.pk]}]);
                this.subscribe('mentions', [{kinds: [1], '#p': [this.pk]}]);
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
        let {content} = event;

        if (event.kind === 4) {
            try {
                if (this.config.decrypt !== false) {
                    const {nip04} = await import('nostr-tools');
                    content = nip04.decrypt(this.sk, event.pubkey, event.content);
                }
            } catch (e) {
                Logger.warn(`[Nostr:${this.id}] Failed to decrypt DM:`, e);
                content = '<encrypted>';
            }
        }

        this.emitMessage({
            from: event.pubkey,
            content,
            metadata: {
                id: event.id,
                kind: event.kind,
                tags: event.tags,
                created_at: event.created_at
            }
        });
    }

    async sendMessage(target, content, metadata = {}) {
        if (this.status !== 'connected') {
            throw new Error('Not connected to Nostr');
        }

        const eventTemplate = {
            kind: metadata.kind || 1,
            created_at: Math.floor(Date.now() / 1000),
            tags: metadata.tags || [],
            content: content,
        };

        // If target is a public key, we might be sending a DM (kind 4) or a reply
        if (metadata.kind === 4) {
            // Encrypt content
            const {nip04} = await import('nostr-tools');
            eventTemplate.content = nip04.encrypt(this.sk, target, content);
            eventTemplate.tags.push(['p', target]);
        }

        // Sign event
        const event = finalizeEvent(eventTemplate, this.skBytes);

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
