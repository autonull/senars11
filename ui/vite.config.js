import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Plugin to serve demo files from parent examples directory
const serveExamplesPlugin = () => ({
    name: 'serve-examples',
    configureServer(server) {
        server.middlewares.use((req, res, next) => {
            // Serve examples.json from ui directory
            if (req.url === '/examples.json') {
                const filePath = resolve(__dirname, 'examples.json');
                if (fs.existsSync(filePath)) {
                    res.setHeader('Content-Type', 'application/json');
                    fs.createReadStream(filePath).pipe(res);
                    return;
                }
            }

            // Serve example files from parent examples directory
            if (req.url.startsWith('/examples/')) {
                const filePath = resolve(__dirname, '..', req.url.slice(1));
                if (fs.existsSync(filePath)) {
                    const ext = filePath.split('.').pop();
                    const contentType = ext === 'metta' || ext === 'nars' ? 'text/plain' : 'application/octet-stream';
                    res.setHeader('Content-Type', contentType);
                    fs.createReadStream(filePath).pipe(res);
                    return;
                }
            }

            next();
        });
    }
});

export default defineConfig({
    root: '.',
    publicDir: 'libs',

    plugins: [serveExamplesPlugin()],

    resolve: {
        alias: {
            // Workspace aliases - handle both patterns:
            // 1. '@senars/core' -> ../core/src (package-level import)
            // 2. '@senars/core/src/...' -> ../core/src/... (deep import with /src in path)

            // Deep imports with /src in the import path (more specific, must come first)
            '@senars/core/src': resolve(__dirname, '../core/src'),
            '@senars/metta/src': resolve(__dirname, '../metta/src'),
            '@senars/agent/src': resolve(__dirname, '../agent/src'),

            // Package-level imports
            '@senars/core': resolve(__dirname, '../core/src'),
            '@senars/metta': resolve(__dirname, '../metta/src'),
            '@senars/agent': resolve(__dirname, '../agent/src'),

            // Node.js shims for browser
            'fs': resolve(__dirname, 'src/shims/mock-node.js'),
            'fs/promises': resolve(__dirname, 'src/shims/mock-fs-promises.js'),
            'path': resolve(__dirname, 'src/shims/mock-node.js'),
            'child_process': resolve(__dirname, 'src/shims/mock-node.js'),
            'os': resolve(__dirname, 'src/shims/mock-node.js'),
            'crypto': resolve(__dirname, 'src/shims/mock-node.js'),
            'url': resolve(__dirname, 'src/shims/mock-node.js'),
            'stream': resolve(__dirname, 'src/shims/mock-node.js'),
            'tty': resolve(__dirname, 'src/shims/mock-node.js'),
            'module': resolve(__dirname, 'src/shims/mock-node.js'),
            'buffer': resolve(__dirname, 'src/shims/mock-node.js'),
            'worker_threads': resolve(__dirname, 'src/shims/mock-node.js'),
            'events': resolve(__dirname, 'src/shims/events-shim.js'),
            'node:events': resolve(__dirname, 'src/shims/events-shim.js'),

            // Node prefixed imports
            'node:readline': resolve(__dirname, 'src/shims/mock-node.js'),
            'node:util': resolve(__dirname, 'src/shims/mock-node.js'),
            'node:path': resolve(__dirname, 'src/shims/mock-node.js'),
            'node:os': resolve(__dirname, 'src/shims/mock-node.js'),
            'node:crypto': resolve(__dirname, 'src/shims/mock-node.js'),
            'node:async_hooks': resolve(__dirname, 'src/shims/mock-node.js'),
            'node:process': resolve(__dirname, 'src/shims/process-shim.js'),
            'process': resolve(__dirname, 'src/shims/process-shim.js'),
            'node:module': resolve(__dirname, 'src/shims/mock-node.js'),
        }
    },

    // Multi-page app configuration
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                ide: resolve(__dirname, 'ide.html'),
                online: resolve(__dirname, 'online.html'),
                demo: resolve(__dirname, 'demo.html'),
                repl: resolve(__dirname, 'repl.html'),
            },
        },
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
    },

    // Development server configuration
    server: {
        port: 5173,
        strictPort: false,
        host: true,
    },

    // Optimize dependencies
    optimizeDeps: {
        include: ['cytoscape', 'cytoscape-fcose', 'golden-layout'],
    },

    // Define global constants
    define: {
        'import.meta.url': JSON.stringify(''),
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    },
});
