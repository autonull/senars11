/**
 * FileTool.js - Safe File Operations Tool
 * Parity with mettaclaw's file modification capabilities, but sandboxed.
 */
import { Logger } from '@senars/core';
import fs from 'fs';
import path from 'path';

export class FileTool {
    constructor(config = {}) {
        this.workspace = config.workspace ? path.resolve(config.workspace) : path.resolve('./workspace');
        // Ensure workspace exists
        if (!fs.existsSync(this.workspace)) {
            try {
                fs.mkdirSync(this.workspace, { recursive: true });
            } catch (e) {
                Logger.error('Failed to create workspace:', e);
            }
        }
    }

    _resolvePath(filePath) {
        // Sanitize path to prevent directory traversal
        const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
        const fullPath = path.join(this.workspace, safePath);

        // Ensure path is still within workspace
        if (!fullPath.startsWith(this.workspace)) {
            throw new Error('Access denied: Path is outside workspace');
        }
        return fullPath;
    }

    readFile(filePath) {
        try {
            const fullPath = this._resolvePath(filePath);
            if (!fs.existsSync(fullPath)) return null;
            return fs.readFileSync(fullPath, 'utf8');
        } catch (error) {
            Logger.error(`Error reading file ${filePath}:`, error);
            throw error;
        }
    }

    writeFile(filePath, content) {
        try {
            const fullPath = this._resolvePath(filePath);
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(fullPath, content, 'utf8');
            return true;
        } catch (error) {
            Logger.error(`Error writing file ${filePath}:`, error);
            throw error;
        }
    }

    listFiles(dirPath = '.') {
        try {
            const fullPath = this._resolvePath(dirPath);
            if (!fs.existsSync(fullPath)) return [];
            return fs.readdirSync(fullPath);
        } catch (error) {
            Logger.error(`Error listing files in ${dirPath}:`, error);
            throw error;
        }
    }
}
