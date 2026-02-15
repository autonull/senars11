import {ProviderConfigFactory} from './ProviderConfigFactory.js';
import {LangChainProvider} from './LangChainProvider.js';
import {HuggingFaceProvider} from './HuggingFaceProvider.js';
import {DummyProvider} from './DummyProvider.js';

export class LMConfigurator {
    constructor() {
        this.defaultProviders = this._initializeDefaultProviders();
    }

    _initializeDefaultProviders() {
        return {
            'ollama': {
                name: 'Ollama (OpenAI-compatible)',
                providerClass: LangChainProvider,
                defaultConfig: {
                    provider: 'ollama',
                    modelName: 'llama2',
                    baseURL: 'http://localhost:11434'
                }
            },
            'openai': {
                name: 'OpenAI',
                providerClass: LangChainProvider,
                defaultConfig: {
                    provider: 'openai',
                    modelName: 'gpt-3.5-turbo'
                }
            },
            'huggingface': {
                name: 'Hugging Face Transformers',
                providerClass: HuggingFaceProvider,
                defaultConfig: {
                    modelName: 'HuggingFaceTB/SmolLM-135M-Instruct',
                    device: 'cpu'
                }
            },
            'anthropic': {
                name: 'Anthropic (via LangChain)',
                providerClass: LangChainProvider,
                defaultConfig: {
                    provider: 'anthropic',
                    modelName: 'claude-3-haiku'
                }
            },
            'dummy': {
                name: 'Dummy/Null Provider',
                providerClass: DummyProvider,
                defaultConfig: {
                    id: 'dummy'
                }
            }
        };
    }

    async configure() {
        console.log('🚀 SeNARS Agent REPL - LM Configuration\n');

        const { inquirer } = await import('inquirer');
        const config = await inquirer.prompt([
            {
                type: 'list',
                name: 'providerType',
                message: 'Choose an LM provider:',
                choices: [
                    {name: 'OpenAI-compatible (Ollama)', value: 'ollama'},
                    {name: 'OpenAI', value: 'openai'},
                    {name: 'Hugging Face (with presets)', value: 'huggingface'},
                    {name: 'Anthropic (via LangChain)', value: 'anthropic'},
                    {name: 'Dummy/Null (testing)', value: 'dummy'},
                    {name: 'Add custom provider configuration', value: 'custom'}
                ],
                default: 'ollama'
            }
        ]);

        let providerConfig = {};

        if (config.providerType === 'custom') {
            providerConfig = await this._configureCustomProvider();
        } else {
            providerConfig = await this._configureDefaultProvider(config.providerType);
        }

        return this._createProviderResult(providerConfig, config.providerType);
    }

    async _configureCustomProvider() {
        const { inquirer } = await import('inquirer');
        const customConfig = await inquirer.prompt([
            {
                type: 'input',
                name: 'providerName',
                message: 'Enter provider name:',
                default: 'custom-provider'
            },
            {
                type: 'list',
                name: 'providerClass',
                message: 'Select provider class:',
                choices: [
                    {name: 'LangChainProvider (OpenAI-compatible)', value: 'LangChainProvider'},
                    {name: 'HuggingFaceProvider (Transformers)', value: 'HuggingFaceProvider'},
                    {name: 'DummyProvider (testing)', value: 'DummyProvider'}
                ]
            },
            {
                type: 'input',
                name: 'modelName',
                message: 'Enter model name:',
                default: 'llama2'
            }
        ]);

        return {
            id: customConfig.providerName,
            provider: customConfig.providerClass.toLowerCase().replace('provider', ''),
            modelName: customConfig.modelName
        };
    }

    async _configureDefaultProvider(providerType) {
        const configurator = ProviderConfigFactory.createProviderConfigurator(providerType, this.defaultProviders);
        return await configurator.configure();
    }

    _createProviderResult(providerConfig, providerType) {
        const providerInfo = this.defaultProviders[providerType] || this.defaultProviders[providerConfig.provider];
        if (!providerInfo) {
            throw new Error(`Unsupported provider type: ${providerType}`);
        }

        const ProviderClass = providerInfo.providerClass;
        const provider = new ProviderClass(providerConfig);

        console.log('✅ Configuration completed successfully!\n');
        return {
            provider,
            config: providerConfig
        };
    }

    async quickSelect() {
        console.log('🚀 SeNARS Agent REPL - Quick LM Selection\n');

        const quickOptions = [
            {name: 'Ollama - llama2 (fast, local)', value: 'ollama-llama2'},
            {name: 'Ollama - mistral (balanced)', value: 'ollama-mistral'},
            {name: 'SmolLM-135M (HuggingFace, small)', value: 'huggingface-smollm'},
            {name: 'Granite-3.0-2b (HuggingFace, small)', value: 'huggingface-granite'},
            {name: 'Dummy Provider (for testing)', value: 'dummy'},
            {name: 'Custom configuration', value: 'custom'}
        ];

        const { inquirer } = await import('inquirer');
        const selection = await inquirer.prompt([
            {
                type: 'list',
                name: 'choice',
                message: 'Quick select a provider:',
                choices: quickOptions
            }
        ]);

        return this._handleQuickSelection(selection.choice);
    }

    _handleQuickSelection(choice) {
        if (choice.startsWith('ollama-')) {
            const model = choice.split('-')[1];
            const provider = new LangChainProvider({
                provider: 'ollama',
                modelName: model,
                baseURL: 'http://localhost:11434'
            });
            return {provider, config: {provider: 'ollama', modelName: model}};
        } else if (choice.startsWith('huggingface-')) {
            const modelPreset = choice.split('-')[1];
            const modelName = this._getModelNameFromPreset(modelPreset);

            const provider = new HuggingFaceProvider({
                modelName: modelName,
                device: 'cpu'
            });
            return {provider, config: {provider: 'huggingface', modelName}};
        } else if (choice === 'dummy') {
            const provider = new DummyProvider();
            return {provider, config: {id: 'dummy'}};
        } else if (choice === 'custom') {
            return this.configure(); // Call full configuration
        }
    }

    _getModelNameFromPreset(preset) {
        const modelMap = {
            'smollm': 'HuggingFaceTB/SmolLM-135M-Instruct',
            'granite': 'ibm-granite/granite-3.0-2b-instruct'
        };
        return modelMap[preset] || 'sshleifer/distilbart-cnn-12-6'; // default
    }
}