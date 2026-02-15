import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration - get from environment or use defaults
const HTTP_PORT = process.env.PORT ? parseInt(process.env.PORT) : (process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT) : 8080);
const BACKEND_WS_HOST = process.env.BACKEND_WS_HOST || process.env.WS_HOST || 'localhost';
const BACKEND_WS_PORT = process.env.BACKEND_WS_PORT ? parseInt(process.env.BACKEND_WS_PORT) : (process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 8081);

console.log(`UI Server configuration:`);
console.log(`  UI HTTP Port: ${HTTP_PORT}`);
console.log(`  Backend WS Host: ${BACKEND_WS_HOST}`);
console.log(`  Backend WS Port: ${BACKEND_WS_PORT}`);

// Create HTTP server to serve static files, with template replacement for index.html
const server = http.createServer((req, res) => {
    let filePath = req.url;

    // Default to index.html if requesting the root
    if (filePath === '/' || filePath === '/index.html') {
        filePath = './index.html';
    }

    // If the path doesn't have an extension, assume it's HTML
    if (!path.extname(filePath)) {
        filePath += '.html';
    }

    const fullPath = path.join(__dirname, filePath);

    fs.readFile(fullPath, 'utf8', (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error');
            }
        } else {
            // For HTML files, do template replacement to inject WebSocket port
            if (fullPath.endsWith('.html')) {
                content = content
                    .replace(/\{\{WEBSOCKET_PORT}}/g, BACKEND_WS_PORT.toString())
                    .replace(/\{\{WEBSOCKET_HOST}}/g, BACKEND_WS_HOST);
            }

            // Set content type based on file extension
            let contentType = 'text/html';
            if (fullPath.endsWith('.js')) {
                contentType = 'application/javascript';
            } else if (fullPath.endsWith('.css')) {
                contentType = 'text/css';
            } else if (fullPath.endsWith('.json')) {
                contentType = 'application/json';
            }

            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Start server
server.listen(HTTP_PORT, () => {
    console.log(`UI Server running at http://localhost:${HTTP_PORT}`);
    console.log(`UI will connect to backend WebSocket at ws://${BACKEND_WS_HOST}:${BACKEND_WS_PORT}`);
    console.log('Open your browser at the URL above to use SeNARS UI.');
});