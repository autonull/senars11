import { promises as fs } from 'fs';
import { LMConfig, Logger } from '@senars/core';

export class LMConfigPersistence {
    static async save(config, path) {
        if (!config || !path) return false;
        try {
            const data = JSON.stringify(config.toJSON(), null, 2);
            await fs.writeFile(path, data, 'utf-8');
            return true;
        } catch (error) {
            Logger.warn(`Failed to save LM config to ${path}:`, error.message);
            return false;
        }
    }

    static async load(path) {
        try {
            const data = await fs.readFile(path, 'utf-8');
            const json = JSON.parse(data);
            return LMConfig.fromJSON(json);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist - okay to return default
                return new LMConfig({ persistPath: path });
            }
            // Log other errors (JSON parse, permissions, etc.)
            Logger.warn(`Failed to load LM config from ${path}:`, error.message);
            return new LMConfig({ persistPath: path });
        }
    }
}
