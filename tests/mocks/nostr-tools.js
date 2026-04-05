import crypto from 'crypto';

export function generateSecretKey() {
    return crypto.randomBytes(32);
}

export function getPublicKey(secretKey) {
    return crypto.createHash('sha256').update(secretKey).digest('hex');
}

export function finalizeEvent(event, secretKey) {
    return {...event, id: 'mock-id', sig: 'mock-sig'};
}

export function getEventHash(event) {
    return 'mock-hash';
}

export class MockSubscription {
    constructor(handlers) {
        this.handlers = handlers;
        this._closed = false;
    }

    close() {
        this._closed = true;
    }

    emit(event) {
        if (!this._closed && this.handlers.onevent) {
            this.handlers.onevent(event);
        }
    }
}

export class SimplePool {
    constructor() {
        this.relays = new Map();
        this.subscriptions = new Map();
        this.events = [];
    }

    async ensureRelay(url) {
        this.relays.set(url, {url, connected: true});
    }

    async connectRelays(urls) {
        for (const url of urls) {
            await this.ensureRelay(url);
        }
    }

    subscribeMany(relays, filters, handlers) {
        const subId = `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const sub = new MockSubscription(handlers);
        this.subscriptions.set(subId, sub);
        return sub;
    }

    publish(relays, event) {
        this.events.push(event);
        for (const [, sub] of this.subscriptions) {
            sub.emit(event);
        }
        return [Promise.resolve()];
    }

    close() {
        for (const [, sub] of this.subscriptions) {
            sub.close();
        }
        this.subscriptions.clear();
        this.relays.clear();
    }
}

export const nip19 = {
    nprofileEncode: (data) => `nprofile-mock-${data.pubkey || ''}`,
    npubEncode: (hex) => `npub1${hex}`,
    decode: (str) => ({type: 'npub', data: str}),
};
