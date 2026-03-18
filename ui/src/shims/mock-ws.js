export class WebSocket extends EventTarget {
    constructor(url) {
        super();
        this.url = url;
        this.readyState = 0; // CONNECTING
        setTimeout(() => {
             this.readyState = 1; // OPEN
             this.dispatchEvent(new Event('open'));
        }, 0);
    }
    send(data) {}
    close() {}
}

export class WebSocketServer extends EventTarget {
    constructor(options) {
        super();
        this.options = options;
    }
    on(event, cb) {}
    close(cb) { if (cb) cb(); }
}

export default WebSocket;
