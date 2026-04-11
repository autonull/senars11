
export class EventEmitter {
    constructor() { this.events = {}; }
    on(event, listener) { (this.events[event] = this.events[event] || []).push(listener); return this; }
    emit(event, ...args) { (this.events[event] || []).forEach(l => l(...args)); return true; }
    removeListener(event, listener) {
        if (!this.events[event]) {return this;}
        this.events[event] = this.events[event].filter(l => l !== listener);
        return this;
    }
    off(event, listener) { return this.removeListener(event, listener); }
    once(event, listener) {
        const onceWrapper = (...args) => { this.removeListener(event, onceWrapper); listener(...args); };
        return this.on(event, onceWrapper);
    }
    removeAllListeners(event) { if(event) {delete this.events[event];} else {this.events = {};} return this; }
}

export default EventEmitter;
