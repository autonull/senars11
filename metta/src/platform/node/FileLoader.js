/**
 * FileLoader.js - Node.js File System Adapter
 * Handles file loading in Node.js environment
 */

import { createRequire } from 'module';
import { ENV, requireEnvironment } from '../env.js';

export class FileLoader {
    constructor(options = {}) {
        requireEnvironment('node');

        const require = createRequire(import.meta.url);
        this.fs = require('fs');
        this.path = require('path');
        this.url = require('url');

        this.searchPaths = options.searchPaths || [];
        this.baseDir = options.baseDir || this._getDefaultBaseDir();

        if (!this.searchPaths.includes(this.baseDir)) {
            this.searchPaths.unshift(this.baseDir);
        }
    }

    _getDefaultBaseDir() {
        const currentDir = this.path.dirname(this.url.fileURLToPath(import.meta.url));
        // Navigate from platform/node/ to stdlib/
        return this.path.join(currentDir, '../../stdlib');
    }

    /**
     * Check if file exists
     */
    exists(fileName) {
        return this.searchPaths.some(dir =>
            this.fs.existsSync(this.path.join(dir, fileName))
        );
    }

    /**
     * Read file content
     */
    read(fileName) {
        for (const dir of this.searchPaths) {
            const filePath = this.path.join(dir, fileName);
            if (this.fs.existsSync(filePath)) {
                return this.fs.readFileSync(filePath, 'utf-8');
            }
        }
        throw new Error(`File '${fileName}' not found in: ${this.searchPaths.join(', ')}`);
    }

    /**
     * List files in directory
     */
    list(dirName = '.') {
        const results = new Set();
        for (const searchPath of this.searchPaths) {
            const fullPath = this.path.join(searchPath, dirName);
            if (this.fs.existsSync(fullPath) && this.fs.statSync(fullPath).isDirectory()) {
                const files = this.fs.readdirSync(fullPath);
                files.forEach(f => results.add(f));
            }
        }
        return Array.from(results);
    }

    /**
     * Add search path
     */
    addSearchPath(path) {
        if (!this.searchPaths.includes(path)) {
            this.searchPaths.push(path);
        }
    }

    /**
     * Static helper to load a file directly
     */
    static load(filePath) {
        const require = createRequire(import.meta.url);
        const fs = require('fs');
        if (fs.existsSync(filePath)) {
             return fs.readFileSync(filePath, 'utf-8');
        }
        throw new Error(`File not found: ${filePath}`);
    }
}
