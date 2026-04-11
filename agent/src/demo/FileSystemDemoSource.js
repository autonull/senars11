import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

let __dirname;
try {
    __dirname = path.dirname(fileURLToPath(import.meta.url));
} catch {
    __dirname = process.cwd();
}
const EXAMPLES_PATH = path.resolve(__dirname, '../../../examples');

export class FileSystemDemoSource {
    constructor(basePath = EXAMPLES_PATH) {
        this.basePath = basePath;
    }

    async getDemos() {
        try {
            // Check if directory exists
            try {
                await fs.promises.access(this.basePath);
            } catch {
                console.warn(`Examples directory not found at ${this.basePath}`);
                return [];
            }

            const files = await fs.promises.readdir(this.basePath);
            const demos = [];
            for (const file of files) {
                if (file.endsWith('.nars') || file.endsWith('.js')) {
                    const filePath = path.join(this.basePath, file);
                    // Skip some common non-demo files if necessary, e.g. utils
                    if (file.includes('util') || file.includes('test')) {
                        continue;
                    }

                    const content = await fs.promises.readFile(filePath, 'utf8');
                    const info = this._parseInfo(content);
                    const type = file.endsWith('.js') ? 'process' : 'narsese';

                    demos.push({
                        id: file.replace(/\.(nars|js)$/, ''),
                        name: info.title || file,
                        description: info.description || (type === 'process' ? 'JavaScript Demo' : 'Narsese Script'),
                        path: filePath,
                        type: type
                    });
                }
            }
            return demos;
        } catch (e) {
            console.error('Error loading demos:', e);
            return [];
        }
    }

    _parseInfo(content) {
        // Look for metadata comments
        // Supports // title: ... and * title: ... (for JSDoc style)
        const titleMatch = content.match(/^\s*(?:\/\/|\*)\s*title:\s*(.*)$/m);
        const descriptionMatch = content.match(/^\s*(?:\/\/|\*)\s*description:\s*(.*)$/m);
        return {
            title: titleMatch ? titleMatch[1].trim() : null,
            description: descriptionMatch ? descriptionMatch[1].trim() : null
        };
    }

    async getFileContent(filePath) {
        return await fs.promises.readFile(filePath, 'utf8');
    }

    async loadDemoSteps(filePath) {
        const content = await fs.promises.readFile(filePath, 'utf8');
        return this.parseSteps(content);
    }

    parseSteps(content) {
        const lines = content.split('\n');
        const steps = [];
        let currentComment = '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                continue;
            }

            if (trimmed.startsWith('//')) {
                const comment = trimmed.replace(/^\/\/\s*/, '');
                if (!comment.startsWith('title:') && !comment.startsWith('description:')) {
                    currentComment = comment;
                }
            } else if (trimmed.startsWith('\'')) {
                // Comment in Narsese is sometimes '
                const comment = trimmed.substring(1).trim();
                currentComment = comment;
            } else if (!trimmed.startsWith('*')) {
                // It's an input line (or command starting with /)
                steps.push({
                    description: currentComment || 'Execute input',
                    input: trimmed
                });
                currentComment = '';
            }
        }
        return steps;
    }
}
