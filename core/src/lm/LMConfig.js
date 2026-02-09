import { TransformersJSProvider } from './TransformersJSProvider.js';
import { DummyProvider } from './DummyProvider.js';
import { LangChainProvider } from './LangChainProvider.js';
import { HuggingFaceProvider } from './HuggingFaceProvider.js';

export class LMConfig {
    static PROVIDERS = Object.freeze({
        TRANSFORMERS: 'transformers',
        OLLAMA: 'ollama',
        OPENAI: 'openai',
        HUGGINGFACE: 'huggingface',
        DUMMY: 'dummy'
    });

    static DEFAULT_PROVIDERS = {
        ollama: {
            name: 'Ollama (OpenAI-compatible)',
            type: 'ollama',
            defaultConfig: { modelName: 'llama2', baseURL: 'http://localhost:11434' }
        },
        openai: {
            name: 'OpenAI',
            type: 'openai',
            defaultConfig: { modelName: 'gpt-3.5-turbo' }
        },
        huggingface: {
            name: 'Hugging Face Transformers',
            type: 'huggingface',
            defaultConfig: { modelName: 'HuggingFaceTB/SmolLM-135M-Instruct', device: 'cpu' },
            presets: {
                'SmolLM': ['HuggingFaceTB/SmolLM-135M-Instruct', 'HuggingFaceTB/SmolLM-360M-Instruct', 'HuggingFaceTB/SmolLM-1.7B-Instruct'],
                'Granite': ['ibm-granite/granite-3.0-8b-instruct', 'ibm-granite/granite-3.0-2b-instruct'],
                'Mistral': ['mistral/mistral-tiny', 'mistral/mistral-small', 'microsoft/DialoGPT-small']
            }
        },
        anthropic: {
            name: 'Anthropic (via LangChain)',
            type: 'anthropic',
            defaultConfig: { modelName: 'claude-3-haiku' }
        },
        transformers: {
            name: 'Transformers.js (local)',
            type: 'transformers',
            defaultConfig: { model: 'Xenova/all-MiniLM-L6-v2' }
        },
        dummy: {
            name: 'Dummy/Null Provider',
            type: 'dummy',
            defaultConfig: { id: 'dummy' }
        }
    };

    constructor(options = {}) {
        this.configs = new Map();
        this.active = null;
        this.persistPath = options.persistPath ?? '.senars-lm-config.json';

        this.setProvider(LMConfig.PROVIDERS.TRANSFORMERS, { model: 'Xenova/all-MiniLM-L6-v2', type: 'transformers' });
        this.setProvider(LMConfig.PROVIDERS.DUMMY, { type: 'dummy' });
        this.setActive(LMConfig.PROVIDERS.TRANSFORMERS);
    }

    static fromJSON(json) {
        const config = new LMConfig({ persistPath: json.persistPath });
        config.active = json.active;
        config.configs = new Map(Object.entries(json.providers ?? {}));
        return config;
    }

    static bindTools(provider, agent) {
        if (!agent?.tools?.registry) {
            provider.tools = [];
            return;
        }

        const registeredTools = agent.tools.registry.getDiscoveredTools() || [];
        const tools = registeredTools.map(tool => ({
            name: tool.id,
            description: tool.description,
            schema: tool.parameters ?? tool.schema,
            invoke: async (args) => {
                const result = await agent.tools.executeTool(tool.id, args);
                return result?.result !== undefined
                    ? typeof result.result === 'string' ? result.result : JSON.stringify(result.result)
                    : JSON.stringify(result);
            }
        }));

        provider.tools = tools;
        if (typeof provider.bindTools === 'function') provider.bindTools(tools);
    }

    setProvider(name, config) {
        this.configs.set(name, { name, ...config, enabled: config.enabled ?? true });
    }

    getProvider(name) {
        return this.configs.get(name) ?? null;
    }

    setActive(name) {
        if (!this.configs.has(name)) throw new Error(`Provider ${name} not configured`);
        this.active = name;
    }

    getActive() {
        if (!this.active) throw new Error('No active provider set');
        return this.configs.get(this.active);
    }

    listProviders() {
        return Array.from(this.configs.keys());
    }

    async test(name = this.active) {
        if (!name) return { success: false, message: 'No provider specified' };

        const config = this.getProvider(name);
        if (!config) return { success: false, message: `Provider ${name} not found` };

        try {
            const provider = this._createProvider(config);
            if (provider.embed) await provider.embed('test');
            else if (provider.complete) await provider.complete('test');
            return { success: true, message: 'Connection successful' };
        } catch (e) {
            return { success: false, message: e.message };
        }
    }


    createActiveProvider() {
        return this._createProvider(this.getActive());
    }

    isConfigured(name) {
        return this.configs.has(name);
    }

    getActiveProviderName() {
        return this.active;
    }

    clearAll() {
        this.configs.clear();
        this.active = null;
    }

    _createProvider(config) {
        if (!config) throw new Error('Cannot create provider from null config');

        const type = config.type ?? config.name;
        const { TRANSFORMERS, DUMMY, OLLAMA, OPENAI, HUGGINGFACE, ANTHROPIC } = LMConfig.PROVIDERS;

        if (type === 'transformers' || type === TRANSFORMERS) return new TransformersJSProvider(config);
        if (type === 'dummy' || type === DUMMY) return new DummyProvider(config);

        if (type === 'ollama' || type === OLLAMA || type === 'openai' || type === OPENAI || type === 'anthropic' || type === ANTHROPIC) {
            return new LangChainProvider({ ...config, provider: type });
        }

        if (type === 'huggingface' || type === HUGGINGFACE) {
            return new HuggingFaceProvider(config);
        }

        throw new Error(`Unknown provider type: ${type}`);
    }

    toJSON() {
        return {
            active: this.active,
            providers: Object.fromEntries(this.configs),
            version: '1.0.0'
        };
    }

    async interactive() {
        const { default: inquirer } = await import('inquirer');
        console.log('🚀 SeNARS - LM Configuration\n');

        const providerChoices = Object.entries(LMConfig.DEFAULT_PROVIDERS).map(([key, info]) => ({
            name: info.name,
            value: key
        }));

        const { providerType } = await inquirer.prompt([{
            type: 'list',
            name: 'providerType',
            message: 'Choose an LM provider:',
            choices: [...providerChoices, { name: 'Custom configuration', value: 'custom' }],
            default: 'ollama'
        }]);

        const providerConfig = providerType === 'custom'
            ? await this._configureCustom(inquirer)
            : await this._configureProvider(providerType, inquirer);

        this.setProvider(providerType, providerConfig);
        this.setActive(providerType);

        console.log('✅ Configuration completed!\n');
        return { provider: this.createActiveProvider(), config: providerConfig };
    }

    async _configureProvider(providerType, inquirer) {
        const providerInfo = LMConfig.DEFAULT_PROVIDERS[providerType];
        if (!providerInfo) throw new Error(`Unknown provider: ${providerType}`);

        if (providerType === 'ollama') {
            return await inquirer.prompt([
                {
                    type: 'input',
                    name: 'modelName',
                    message: 'Enter Ollama model name:',
                    default: providerInfo.defaultConfig.modelName
                },
                {
                    type: 'input',
                    name: 'baseURL',
                    message: 'Enter Ollama API URL:',
                    default: providerInfo.defaultConfig.baseURL
                }
            ]).then(cfg => ({ ...providerInfo.defaultConfig, ...cfg, type: providerType }));
        }

        if (providerType === 'openai' || providerType === 'anthropic') {
            return await inquirer.prompt([
                {
                    type: 'input',
                    name: 'modelName',
                    message: `Enter ${providerInfo.name} model name:`,
                    default: providerInfo.defaultConfig.modelName
                },
                { type: 'password', name: 'apiKey', message: `Enter ${providerInfo.name} API key:` }
            ]).then(cfg => ({ ...providerInfo.defaultConfig, ...cfg, type: providerType }));
        }

        if (providerType === 'huggingface') {
            const { presetCategory } = await inquirer.prompt([{
                type: 'list',
                name: 'presetCategory',
                message: 'Select model category:',
                choices: [
                    ...Object.keys(providerInfo.presets).map(k => ({ name: k, value: k })),
                    { name: 'Custom model name', value: 'custom' }
                ]
            }]);

            if (presetCategory === 'custom') {
                const { modelName } = await inquirer.prompt([{
                    type: 'input',
                    name: 'modelName',
                    message: 'Enter custom Hugging Face model name:',
                    default: 'sshleifer/distilbart-cnn-12-6'
                }]);
                return { ...providerInfo.defaultConfig, modelName, type: providerType };
            }

            const models = providerInfo.presets[presetCategory];
            const { modelName } = await inquirer.prompt([{
                type: 'list',
                name: 'modelName',
                message: `Select ${presetCategory} model:`,
                choices: models.map(m => ({ name: m, value: m }))
            }]);
            return { ...providerInfo.defaultConfig, modelName, type: providerType };
        }

        return { ...providerInfo.defaultConfig, type: providerType };
    }

    async _configureCustom(inquirer) {
        const { providerName, modelName } = await inquirer.prompt([
            { type: 'input', name: 'providerName', message: 'Enter provider name:', default: 'custom-provider' },
            { type: 'input', name: 'modelName', message: 'Enter model name:', default: 'llama2' }
        ]);
        return { id: providerName, modelName, type: 'custom' };
    }

    async quickSelect() {
        const { default: inquirer } = await import('inquirer');
        console.log('🚀 SeNARS - Quick LM Selection\n');

        const quickOptions = [
            { name: 'Ollama - llama2 (fast, local)', value: 'ollama-llama2' },
            { name: 'Ollama - mistral (balanced)', value: 'ollama-mistral' },
            { name: 'SmolLM-135M (HuggingFace, small)', value: 'huggingface-smollm' },
            { name: 'Granite-3.0-2b (HuggingFace, medium)', value: 'huggingface-granite' },
            { name: 'Dummy Provider (testing)', value: 'dummy' },
            { name: 'Custom configuration', value: 'custom' }
        ];

        const { choice } = await inquirer.prompt([{
            type: 'list',
            name: 'choice',
            message: 'Quick select a provider:',
            choices: quickOptions
        }]);

        if (choice === 'custom') return await this.interactive();

        const [providerType, preset] = choice.split('-');
        const modelMap = {
            'ollama-llama2': { provider: 'ollama', modelName: 'llama2', baseURL: 'http://localhost:11434' },
            'ollama-mistral': { provider: 'ollama', modelName: 'mistral', baseURL: 'http://localhost:11434' },
            'huggingface-smollm': {
                provider: 'huggingface',
                modelName: 'HuggingFaceTB/SmolLM-135M-Instruct',
                device: 'cpu'
            },
            'huggingface-granite': {
                provider: 'huggingface',
                modelName: 'ibm-granite/granite-3.0-2b-instruct',
                device: 'cpu'
            },
            'dummy': { provider: 'dummy', id: 'dummy' }
        };

        const config = modelMap[choice];
        this.setProvider(providerType, { ...config, type: providerType });
        this.setActive(providerType);

        console.log('✅ Configuration completed!\n');
        return { provider: this.createActiveProvider(), config };
    }
}
