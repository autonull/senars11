import http from 'http';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HTTP_PORT = parseInt(process.env.PORT ?? process.env.HTTP_PORT ?? '8080');
const BACKEND_WS_HOST = process.env.BACKEND_WS_HOST ?? process.env.WS_HOST ?? 'localhost';
const BACKEND_WS_PORT = parseInt(process.env.BACKEND_WS_PORT ?? process.env.WS_PORT ?? '8081');

console.log(`UI Server configuration:
  UI HTTP Port: ${HTTP_PORT}
  Backend WS Host: ${BACKEND_WS_HOST}
  Backend WS Port: ${BACKEND_WS_PORT}`);

const server = http.createServer((req, res) => {
    let filePath = req.url === '/' || req.url === '/index.html' ? './index.html' : req.url;

    let localPath = path.join(__dirname, filePath);
    let fullPath = path.join(__dirname, '..', filePath); // Default to repo root for modules

    // Determine base path logic
    const isModule = filePath.startsWith('/core/') || filePath.startsWith('/agent/') || filePath.startsWith('/examples/') || filePath.startsWith('/metta/') || filePath.startsWith('/node_modules/');

    if (!isModule) {
        fullPath = localPath; // UI local files
    }

    // Resolution logic
    if (!path.extname(filePath)) {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
            // Exact match (unlikely for no extension but possible)
        } else if (fs.existsSync(fullPath + '.js') && fs.statSync(fullPath + '.js').isFile()) {
            fullPath += '.js';
            filePath += '.js';
        } else if (fs.existsSync(path.join(fullPath, 'index.js'))) {
            fullPath = path.join(fullPath, 'index.js');
            filePath += '/index.js';
        } else if (!isModule) {
             filePath += '.html';
             fullPath += '.html';
        }
    } else {
        // Has extension, check if directory (e.g. some imports might end in /)
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
             fullPath = path.join(fullPath, 'index.js');
             filePath += '/index.js';
        }
    }

    fs.readFile(fullPath, 'utf8', (err, content) => {
        if (err) {
            const [code, msg] = err.code === 'ENOENT' ? [404, 'File not found'] : [500, 'Server error'];
            console.log(`${code}: ${fullPath}`);
            res.writeHead(code);
            res.end(msg);
        } else {
            if (fullPath.endsWith('.html')) {
                content = content
                    .replace(/\{\{WEBSOCKET_PORT}}/g, BACKEND_WS_PORT.toString())
                    .replace(/\{\{WEBSOCKET_HOST}}/g, 'undefined');
            }

            const contentTypeMap = {
                '.js': 'application/javascript',
                '.mjs': 'application/javascript',
                '.css': 'text/css',
                '.json': 'application/json'
            };
            const contentType = contentTypeMap[path.extname(fullPath)] ?? 'text/html';

            res.writeHead(200, {'Content-Type': contentType});
            res.end(content, 'utf-8');
        }
    });
});

server.listen(HTTP_PORT, () => {
    console.log(`UI Server running at http://localhost:${HTTP_PORT}`);
    console.log(`UI will connect to backend WebSocket at ws://${BACKEND_WS_HOST}:${BACKEND_WS_PORT}`);
    console.log('Open your browser at the URL above to use SeNARS UI.');
});
