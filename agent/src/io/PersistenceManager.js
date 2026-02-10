import { promises as fs } from 'fs';

class PersistenceAdapter {
    async save(state, identifier) {
        throw new Error('save method must be implemented by subclass');
    }

    async load(identifier) {
        throw new Error('load method must be implemented by subclass');
    }
}

class FileSystemAdapter extends PersistenceAdapter {
    async save(state, filePath) {
        const serializedState = JSON.stringify(state, null, 2);
        await fs.writeFile(filePath, serializedState);
        return {success: true, identifier: filePath, size: serializedState.length};
    }

    async load(filePath) {
        const data = await fs.readFile(filePath, 'utf8');
        try {
            return JSON.parse(data);
        } catch (error) {
            throw new Error(`Failed to parse JSON from ${filePath}: ${error.message}`);
        }
    }
}

class MemoryAdapter extends PersistenceAdapter {
    constructor() {
        super();
        this.storage = new Map();
    }

    async save(state, key = 'default') {
        try {
            this.storage.set(key, JSON.parse(JSON.stringify(state)));
        } catch (error) {
            throw new Error(`Failed to serialize state for key ${key}: ${error.message}`);
        }
        return {success: true, identifier: key};
    }

    async load(key = 'default') {
        return this.storage.get(key);
    }
}

const DEFAULT_CONFIG = Object.freeze({
    defaultAdapter: 'file',
    defaultPath: './agent.json'
});

export class PersistenceManager {
    constructor(options = {}) {
        this.adapters = new Map();
        this.defaultAdapter = options.defaultAdapter || DEFAULT_CONFIG.defaultAdapter;
        this._defaultPath = options.defaultPath || DEFAULT_CONFIG.defaultPath;

        this._registerDefaultAdapters();
    }

    get defaultPath() {
        return this._defaultPath;
    }

    set defaultPath(path) {
        this._defaultPath = path;
    }

    _registerDefaultAdapters() {
        this.registerAdapter('file', new FileSystemAdapter());
        this.registerAdapter('memory', new MemoryAdapter());
    }

    registerAdapter(name, adapter) {
        if (!(adapter instanceof PersistenceAdapter)) {
            throw new Error('Adapter must be an instance of PersistenceAdapter');
        }
        this.adapters.set(name, adapter);
    }

    getAdapter(name) {
        const adapter = this.adapters.get(name);
        if (!adapter) {
            throw new Error(`Adapter '${name}' not found`);
        }
        return adapter;
    }

    async save(state, adapterName = this.defaultAdapter, identifier = this.defaultPath) {
        return await this.getAdapter(adapterName).save(state, identifier);
    }

    async load(adapterName = this.defaultAdapter, identifier = this.defaultPath) {
        return await this.getAdapter(adapterName).load(identifier);
    }

    async saveToDefault(state) {
        return this.save(state, this.defaultAdapter, this.defaultPath);
    }

    async loadFromDefault() {
        return this.load(this.defaultAdapter, this.defaultPath);
    }

    async saveToPath(state, filePath) {
        return this.save(state, this.defaultAdapter, filePath);
    }

    async loadFromPath(filePath) {
        return this.load(this.defaultAdapter, filePath);
    }

    async exists(identifier = this.defaultPath) {
        try {
            await fs.access(identifier);
            return true;
        } catch {
            return false;
        }
    }
}

export {PersistenceAdapter, FileSystemAdapter, MemoryAdapter};