import {dirname} from 'path';
import {fileURLToPath} from 'url';

let __dirname;
try {
    __dirname = dirname(fileURLToPath(import.meta.url));
} catch {
    __dirname = process.cwd();
}

export const DEFAULT_CONFIG = Object.freeze({
    nar: {
        tools: {enabled: true},
        lm: {enabled: false},
        reasoningAboutReasoning: {enabled: true},
        debug: {pipeline: false}
    },
    lm: {
        provider: 'transformers',
        modelName: "Xenova/t5-small",
        baseUrl: "http://localhost:11434",
        temperature: 0,
        enabled: false
    },
    persistence: {
        defaultPath: './agent.json'
    },
    webSocket: {
        port: parseInt(process.env.WS_PORT) || 8080,
        host: process.env.WS_HOST || '0.0.0.0',
        maxConnections: 20
    },
    ui: {
        port: parseInt(process.env.PORT) || 5173,
        layout: 'default',
        dev: true
    }
});

export class Config {
    static parse(argv = process.argv.slice(2)) {
        const config = structuredClone(DEFAULT_CONFIG);

        // Create a copy to avoid modifying original during processing
        const args = [...argv];

        // Define the argument processing configuration
        const argHandlers = new Map([
            ['--ollama', (i) => {
                config.lm.enabled = true;
                if (args[i + 1] && !args[i + 1].startsWith('--')) {
                    config.lm.modelName = args[++i];
                }
                return i;
            }],
            ['--provider', (i) => {
                config.lm.provider = args[++i];
                config.lm.enabled = true;
                return i;
            }],
            ['--model', (i) => {
                config.lm.modelName = args[++i];
                config.lm.enabled = true;
                return i;
            }],
            ['--modelName', (i) => {
                config.lm.modelName = args[++i];
                config.lm.enabled = true;
                return i;
            }],
            ['--base-url', (i) => {
                config.lm.baseUrl = args[++i];
                return i;
            }],
            ['--temperature', (i) => {
                config.lm.temperature = parseFloat(args[++i]);
                return i;
            }],
            ['--api-key', (i) => {
                config.lm.apiKey = args[++i];
                return i;
            }],
            ['--ws-port', (i) => {
                config.webSocket.port = parseInt(args[++i]);
                return i;
            }],
            ['--host', (i) => {
                config.webSocket.host = args[++i];
                return i;
            }],
            ['--port', (i) => {
                config.ui.port = parseInt(args[++i]);
                return i;
            }],
            ['--graph-ui', (i) => {
                config.ui.layout = 'graph';
                return i;
            }],
            ['--layout', (i) => {
                config.ui.layout = args[++i];
                return i;
            }],
            ['--prod', (i) => {
                config.ui.dev = false;
                return i;
            }],
            ['--dev', (i) => {
                config.ui.dev = true;
                return i;
            }],
            ['--demo', (i) => {
                config.demo = true;
                return i;
            }],
            ['--embedding', (i) => {
                config.subsystems = config.subsystems || {};
                config.subsystems.embeddingLayer = config.subsystems.embeddingLayer || {};
                config.subsystems.embeddingLayer.enabled = true;
                return i;
            }],
            ['--embedding-model', (i) => {
                config.subsystems = config.subsystems || {};
                config.subsystems.embeddingLayer = config.subsystems.embeddingLayer || {};
                config.subsystems.embeddingLayer.enabled = true;
                config.subsystems.embeddingLayer.model = args[++i];
                return i;
            }]
        ]);

        // Process arguments using index tracking
        let i = 0;
        while (i < args.length) {
            const arg = args[i];
            const handler = argHandlers.get(arg);

            if (handler) {
                i = handler(i);
            }
            i++;
        }

        return config;
    }
}
