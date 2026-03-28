import { promises as fs } from 'fs';
import { LMConfig } from '../../../core/src/lm/LMConfig.js';

export class LMConfigPersistence {
    static async save(config, path) {
        if (!config || !path) return false;
        try {
            const data = JSON.stringify(config.toJSON(), null, 2);
            await fs.writeFile(path, data, 'utf-8');
            return true;
        } catch (error) {
            console.warn(`Failed to save LM config to ${path}:`, error.message);
            return false;
        }
    }

    static async load(path) {
        try {
            const data = await fs.readFile(path, 'utf-8');
            const json = JSON.parse(data);
            return LMConfig.fromJSON(json);
        } catch (error) {
            // It's okay if file doesn't exist, return new default config
            return new LMConfig({ persistPath: path });
        }
    }
}
