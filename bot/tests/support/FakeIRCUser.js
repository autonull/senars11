import { createConnection } from 'net';

const matches = (line, pattern) => typeof pattern === 'string' ? line.includes(pattern) : pattern.test(line);

export class FakeIRCUser {
    constructor(host, port, nick) {
        this.host = host;
        this.port = port;
        this.nick = nick;
        this.messages = [];
        this._socket = null;
        this._buffer = '';
        this._listeners = new Set();
        this._waiters = [];
    }

    connect() {
        return new Promise((resolve, reject) => {
            this._socket = createConnection({ host: this.host, port: this.port });
            this._socket.on('data', d => this._onData(d));
            this._socket.on('error', reject);
            this._socket.on('connect', () => {
                this._send(`NICK ${this.nick}`);
                this._send(`USER ${this.nick.toLowerCase()} 0 * :${this.nick}`);
                const onReg = line => {
                    if (line.includes(' 001 ')) {
                        this._listeners.delete(onReg);
                        resolve();
                    }
                };
                this._listeners.add(onReg);
            });
        });
    }

    _onData(data) {
        this._buffer += data.toString('utf-8');
        const lines = this._buffer.split('\r\n');
        this._buffer = lines.pop();
        for (const line of lines) {
            if (!line.trim()) {
                continue;
            }
            this.messages.push(line);
            for (const fn of this._listeners) {
                fn(line);
            }
            for (const [pattern, resolve] of this._waiters) {
                if (matches(line, pattern)) {
                    this._waiters = this._waiters.filter(w => w[1] !== resolve);
                    resolve(line);
                }
            }
        }
    }

    _send(line) {
        this._socket?.write(`${line}\r\n`);
    }

    say(target, content) {
        this._send(`PRIVMSG ${target} :${content}`);
    }

    waitFor(pattern, timeout = 10000) {
        const existing = this.messages.find(m => matches(m, pattern));
        if (existing) {
            return existing;
        }
        return new Promise((resolve, reject) => {
            this._waiters.push([pattern, resolve]);
            setTimeout(() => {
                this._waiters = this._waiters.filter(w => w[1] !== resolve);
                reject(new Error(`Timeout waiting for: ${pattern}`));
            }, timeout);
        });
    }

    hasMessage(pattern) {
        return this.messages.some(m => matches(m, pattern));
    }

    disconnect() {
        this._send('QUIT :done');
        this._socket?.destroy();
    }
}
