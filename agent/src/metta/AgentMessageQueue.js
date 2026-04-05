export class AgentMessageQueue {
    constructor(embodimentBus, cap) {
        this._msgQueue = [];
        this._msgWaiters = [];
        embodimentBus.on('message', msg => {
            const text = `[${msg.from ?? 'unknown'}@${msg.embodimentId ?? 'embodiment'}] ${msg.content ?? ''}`;
            this._msgWaiters.length > 0 ? this._msgWaiters.shift()(text) : this._msgQueue.push(text);
        });
        this._cap = cap;
    }

    dequeue() {
        if (this._msgQueue.length > 0) {
            return Promise.resolve(this._msgQueue.shift());
        }
        if (!this._cap('autonomousLoop')) {
            return new Promise(res => this._msgWaiters.push(res));
        }
        return Promise.resolve(null);
    }
}
