import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const uiDir = path.join(rootDir, 'ui');
const examplesDir = path.join(rootDir, 'examples');
const outputFile = path.join(uiDir, 'examples.json');

const directoriesToScan = ['metta', 'scripts'];
const allowedExtensions = ['.metta', '.nars'];

function scanDirectory(dirPath, relativeToRoot) {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const children = [];

    items.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
    });

    for (const item of items) {
        const itemPath = path.join(dirPath, item.name);
        const relativePath = path.join(relativeToRoot, item.name);

        if (item.isDirectory()) {
            const grandChildren = scanDirectory(itemPath, relativePath);
            if (grandChildren.length > 0) {
                children.push({
                    id: 'examples-' + relativePath.replace(/[\/\\]/g, '-'),
                    name: item.name,
                    type: 'directory',
                    children: grandChildren
                });
            }
        } else {
            const ext = path.extname(item.name);
            if (allowedExtensions.includes(ext)) {
                children.push({
                    id: 'examples-' + relativePath.replace(/[\/\\]/g, '-'),
                    name: item.name,
                    path: relativePath.replace(/\\/g, '/'), // Ensure forward slashes
                    type: 'file',
                    extension: ext
                });
            }
        }
    }

    return children;
}

const rootNode = {
    id: 'examples',
    name: 'examples',
    type: 'directory',
    children: []
};

for (const dirName of directoriesToScan) {
    const fullPath = path.join(examplesDir, dirName);
    if (fs.existsSync(fullPath)) {
        const children = scanDirectory(fullPath, path.join('examples', dirName));
        if (children.length > 0) {
            rootNode.children.push({
                id: 'examples-' + dirName,
                name: dirName,
                type: 'directory',
                children: children
            });
        }
    } else {
        console.warn(`Warning: Directory not found: ${fullPath}`);
    }
}

fs.writeFileSync(outputFile, JSON.stringify(rootNode, null, 2));
console.log(`Updated ${outputFile}`);
