/**
 * @file ProviderConfigFactory.js
 * @description Factory for creating provider-specific configuration prompts
 */

export class ProviderConfigFactory {
    static createProviderConfigurator(providerType, defaultProviders) {
        const providerInfo = defaultProviders[providerType];
        if (!providerInfo) {
            throw new Error(`Unsupported provider type: ${providerType}`);
        }

        const configurators = {
            'ollama': new OllamaConfigurator(providerInfo),
            'openai': new OpenAIConfigurator(providerInfo),
            'huggingface': new HuggingFaceConfigurator(providerInfo, this.getPredefinedModels()),
            'anthropic': new AnthropicConfigurator(providerInfo),
            'dummy': new DummyConfigurator(providerInfo)
        };

        return configurators[providerType] || new DefaultConfigurator(providerInfo);
    }

    static getPredefinedModels() {
        return {
            'SmolLM': [
                'HuggingFaceTB/SmolLM-135M-Instruct',
                'HuggingFaceTB/SmolLM-360M-Instruct',
                'HuggingFaceTB/SmolLM-1.7B-Instruct'
            ],
            'Granite': [
                'ibm-granite/granite-3.0-8b-instruct',
                'ibm-granite/granite-3.0-2b-instruct'
            ],
            'Mistral': [
                'mistral/mistral-tiny',
                'mistral/mistral-small',
                'microsoft/DialoGPT-small'
            ]
        };
    }
}

class BaseConfigurator {
    constructor(providerInfo) {
        this.providerInfo = providerInfo;
    }

    async configure() {
        throw new Error('configure() method must be implemented by subclass');
    }

    async getConfiguration(questions) {
        const { inquirer } = await import('inquirer');
        return await inquirer.prompt(questions);
    }
}

class OllamaConfigurator extends BaseConfigurator {
    async configure() {
        const config = await this.getConfiguration([
            {
                type: 'input',
                name: 'modelName',
                message: 'Enter Ollama model name:',
                default: this.providerInfo.defaultConfig.modelName
            },
            {
                type: 'input',
                name: 'baseURL',
                message: 'Enter Ollama API URL:',
                default: this.providerInfo.defaultConfig.baseURL
            }
        ]);

        return {
            ...this.providerInfo.defaultConfig,
            ...config
        };
    }
}

class OpenAIConfigurator extends BaseConfigurator {
    async configure() {
        const config = await this.getConfiguration([
            {
                type: 'input',
                name: 'modelName',
                message: 'Enter OpenAI model name:',
                default: this.providerInfo.defaultConfig.modelName
            },
            {
                type: 'password',
                name: 'apiKey',
                message: 'Enter OpenAI API key:'
            }
        ]);

        return {
            ...this.providerInfo.defaultConfig,
            ...config
        };
    }
}

class HuggingFaceConfigurator extends BaseConfigurator {
    constructor(providerInfo, predefinedModels) {
        super(providerInfo);
        this.predefinedModels = predefinedModels;
    }

    async configure() {
        const hfConfig = await this.getConfiguration([
            {
                type: 'list',
                name: 'presetCategory',
                message: 'Select model category:',
                choices: [
                    {name: 'SmolLM (HuggingFaceTB)', value: 'SmolLM'},
                    {name: 'Granite (IBM)', value: 'Granite'},
                    {name: 'Mistral', value: 'Mistral'},
                    {name: 'Custom model name', value: 'custom'}
                ]
            }
        ]);

        if (hfConfig.presetCategory === 'custom') {
            const customModel = await this.getConfiguration([
                {
                    type: 'input',
                    name: 'modelName',
                    message: 'Enter custom Hugging Face model name:',
                    default: 'sshleifer/distilbart-cnn-12-6'
                }
            ]);
            return {
                ...this.providerInfo.defaultConfig,
                ...customModel
            };
        } else {
            const models = this.predefinedModels[hfConfig.presetCategory];
            const selectedModel = await this.getConfiguration([
                {
                    type: 'list',
                    name: 'modelName',
                    message: `Select ${hfConfig.presetCategory} model:`,
                    choices: models.map(model => ({name: model, value: model}))
                }
            ]);
            return {
                ...this.providerInfo.defaultConfig,
                ...selectedModel
            };
        }
    }
}

class AnthropicConfigurator extends BaseConfigurator {
    async configure() {
        const config = await this.getConfiguration([
            {
                type: 'input',
                name: 'modelName',
                message: 'Enter Anthropic model name:',
                default: this.providerInfo.defaultConfig.modelName
            },
            {
                type: 'password',
                name: 'apiKey',
                message: 'Enter Anthropic API key:'
            }
        ]);

        return {
            ...this.providerInfo.defaultConfig,
            ...config,
            provider: 'anthropic'
        };
    }
}

class DummyConfigurator extends BaseConfigurator {
    async configure() {
        return {
            ...this.providerInfo.defaultConfig
        };
    }
}

class DefaultConfigurator extends BaseConfigurator {
    async configure() {
        return {
            ...this.providerInfo.defaultConfig
        };
    }
}