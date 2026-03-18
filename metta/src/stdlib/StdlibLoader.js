/**
 * StdlibLoader.js - Standard Library Loader
 * Handles module loading using platform adapters
 */

import { ENV, getEnvironment } from '../platform/env.js';
import { FileLoader } from '../platform/node/FileLoader.js';
import { VirtualFS } from '../platform/browser/VirtualFS.js';
import {Logger} from '../../../core/src/util/Logger.js';

const DEFAULT_MODULES = ['core', 'list', 'match', 'types', 'hof', 'imagination', 'js'];

export class StdlibLoader {
    constructor(interpreter, options = {}) {
        this.interpreter = interpreter;
        this.options = options;
        this.modules = options.modules || DEFAULT_MODULES;
        this.loadedModules = new Set();

        // Create adapter synchronously
        this.adapter = this._createAdapter(options);
    }

    /**
     * Create appropriate file system adapter based on environment
     */
    _createAdapter(options) {
        if (options.adapter) {
            return options.adapter; // User-provided adapter
        }

        const env = getEnvironment();

        if (env === 'node') {
            return new FileLoader({
                baseDir: options.stdlibDir,
                searchPaths: options.searchPaths
            });
        } else if (env === 'browser' || env === 'worker') {
            return new VirtualFS({
                files: options.virtualFiles || {}
            });
        } else {
            throw new Error(`Unsupported environment: ${env}`);
        }
    }

    /**
     * Load all configured modules
     */
    load() {
        const stats = { loaded: [], failed: [], atomsAdded: 0 };

        for (const mod of this.modules) {
            try {
                const res = this.loadModule(mod);
                stats.loaded.push(mod);
                stats.atomsAdded += res.atomCount;
                this.loadedModules.add(mod);
            } catch (err) {
                stats.failed.push({ module: mod, error: err.message });
                Logger.warn(`Failed to load stdlib module '${mod}':`, err);
            }
        }

        return stats;
    }

    /**
     * Load a single module
     */
    loadModule(name) {
        const fileName = `${name}.metta`;

        if (!this.adapter.exists(fileName)) {
            throw new Error(`Module '${name}' not found`);
        }

        const content = this.adapter.read(fileName);
        const sizeBefore = this.interpreter.space?.size?.() ?? 0;
        this.interpreter.load(content);

        return {
            module: name,
            atomCount: (this.interpreter.space?.size?.() ?? 0) - sizeBefore
        };
    }

    getLoadedModules() { return Array.from(this.loadedModules); }

    reload() {
        this.loadedModules.clear();
        return this.load();
    }
}

/**
 * Convenience function to load stdlib
 */
export const loadStdlib = (interpreter, options) => {
    const loader = new StdlibLoader(interpreter, options);
    return loader.load();
};
