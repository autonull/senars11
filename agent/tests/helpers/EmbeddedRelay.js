import { WebSocketServer } from 'ws';
import { Logger } from '@senars/core';

export class EmbeddedRelay {
    constructor(port = 0) {
        this.port = port;
        this.wss = null;
        this.events = new Map(); // id -> event
        this.subs = new Map(); // subId -> { conn, filters }
    }

    async start() {
        return new Promise((resolve) => {
            this.wss = new WebSocketServer({ port: this.port });

            this.wss.on('listening', () => {
                const addr = this.wss.address();
                this.port = addr.port;
                this.url = `ws://localhost:${this.port}`;
                Logger.info(`EmbeddedRelay listening on ${this.url}`);
                resolve(this.url);
            });

            this.wss.on('connection', (ws) => {
                ws.on('message', (msg) => this._handleMessage(ws, msg));
            });
        });
    }

    async stop() {
        return new Promise((resolve) => {
            if (this.wss) {
                this.wss.close(resolve);
            } else {
                resolve();
            }
        });
    }

    _handleMessage(ws, msgData) {
        try {
            const msg = JSON.parse(msgData);
            const type = msg[0];

            if (type === 'EVENT') {
                const event = msg[1];
                this._handleEvent(ws, event);
            } else if (type === 'REQ') {
                const subId = msg[1];
                const filters = msg.slice(2);
                this._handleReq(ws, subId, filters);
            } else if (type === 'CLOSE') {
                const subId = msg[1];
                this._handleClose(ws, subId);
            }
        } catch (e) {
            Logger.error('Relay error:', e);
        }
    }

    _handleEvent(ws, event) {
        // Store event
        this.events.set(event.id, event);

        // Broadcast to matching subs
        for (const [subId, { conn, filters }] of this.subs.entries()) {
            if (this._matches(event, filters)) {
                if (conn.readyState === 1) {
                    conn.send(JSON.stringify(['EVENT', subId, event]));
                }
            }
        }

        // Ack
        ws.send(JSON.stringify(['OK', event.id, true, 'stored']));
    }

    _handleReq(ws, subId, filters) {
        this.subs.set(`${subId}:${Math.random()}`, { conn: ws, filters }); // Simplified sub tracking

        // Send stored events
        for (const event of this.events.values()) {
            if (this._matches(event, filters)) {
                ws.send(JSON.stringify(['EVENT', subId, event]));
            }
        }
        ws.send(JSON.stringify(['EOSE', subId]));
    }

    _handleClose(ws, subId) {
        // Cleanup subs
    }

    _matches(event, filters) {
        return filters.some(filter => {
            if (filter.ids && !filter.ids.includes(event.id)) return false;
            if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
            if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
            if (filter['#p'] && !event.tags.some(t => t[0] === 'p' && filter['#p'].includes(t[1]))) return false;
            return true;
        });
    }
}
