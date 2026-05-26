import { ConnectionInterface } from './ConnectionInterface.js';

export class ConnectionManager extends ConnectionInterface {
    constructor(adapter) {
        super();
        if (!adapter) {throw new Error('ConnectionManager requires adapter');}
        this.adapter = adapter;
    }

    async connect(...args) { return this.adapter.connect(...args); }
    isConnected() { return this.adapter.isConnected(); }
    sendMessage(type, payload) { return this.adapter.sendMessage(type, payload); }
    subscribe(event, handler) { return this.adapter.subscribe(event, handler); }
    unsubscribe(event, handler) { return this.adapter.unsubscribe(event, handler); }
    disconnect() { return this.adapter.disconnect(); }
}
