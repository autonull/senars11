// fs
export const readFile = async () => "{}";
export const writeFile = async () => { };
export const access = async () => { };
export const stat = async () => ({ isDirectory: () => false });
export const mkdir = async () => { };
export const readdir = async () => [];
export const rm = async () => { };

// fs sync (for tools that need it, e.g. inquirer)
export const readFileSync = () => "{}";
export const writeFileSync = () => { };
export const unlinkSync = () => { };
export const existsSync = () => false;
export const mkdirSync = () => { };
export const statSync = () => ({ isDirectory: () => false });

export const constants = {};
export const promises = { readFile, writeFile, access, stat, mkdir, readdir, rm, constants };

// path
export const join = (...args) => args.join('/');
export const resolve = (...args) => args.join('/');
export const dirname = (path) => path;
export const basename = (path) => path;
export const extname = (path) => '';

// child_process
export const spawn = () => ({ on: () => { }, stdout: { on: () => { } }, stderr: { on: () => { } } });
export const exec = () => { };
export const spawnSync = () => ({ output: [], stdout: '', stderr: '', status: 0, signal: null, error: null });

// os
export const platform = () => 'browser';
export const arch = () => 'javascript';

// crypto
export const randomUUID = () => 'uuid';
export const createHash = () => ({ update: () => { }, digest: () => 'hash' });

// url
export const fileURLToPath = (url) => url;

// async_hooks
export class AsyncLocalStorage {
    run(store, callback, ...args) { return callback(...args); }
    getStore() { return undefined; }
}
export class AsyncResource {
    constructor(type) { this.type = type; }
    runInAsyncScope(fn, ...args) { return fn(...args); }
}

// util
export const styleText = (style, text) => text;
export const stripVTControlCharacters = (text) => text;
export const promisify = (fn) => fn;
export const callbackify = (fn) => fn;
export const debuglog = () => () => { };
export const types = { isDate: () => false, isNativeError: () => false };
export const inspect = (obj) => JSON.stringify(obj);

// module
export const createRequire = () => ((path) => { console.warn("require called in browser for", path); return {}; });
export const builtinModules = [];

// events
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

// buffer
export const Buffer = {
    isBuffer: () => false,
    from: (str) => str,
    alloc: () => [],
    concat: (list) => list.join(''),
    byteLength: (str) => str.length
};

// worker_threads
export class Worker extends EventEmitter {
    constructor(path, options) {
        super();
        this.path = path;
        this.options = options;
        console.warn('Worker threads not supported in browser environment');
    }
    postMessage(msg) { }
    terminate() { }
}
export const parentPort = new EventEmitter();
export const isMainThread = true;

export default {
    readFile, writeFile, access, stat, mkdir, readdir, rm, constants, promises,
    readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, statSync,
    join, resolve, dirname, basename, extname,
    spawn, exec, spawnSync,
    platform, arch,
    randomUUID, createHash,
    fileURLToPath,
    AsyncLocalStorage, AsyncResource,
    styleText, stripVTControlCharacters, promisify, callbackify, debuglog, types, inspect,
    createRequire, builtinModules,
    EventEmitter, Buffer,
    Worker, parentPort, isMainThread
};
