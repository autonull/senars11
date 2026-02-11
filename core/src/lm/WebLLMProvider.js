import {BaseProvider} from './BaseProvider.js';

let mlcPromise = null;
const importMLC = () => {
    if (!mlcPromise) {
        mlcPromise = import('@mlc-ai/web-llm');
    }
    return mlcPromise;
};

export class WebLLMProvider extends BaseProvider {
    constructor(config = {}) {
        super(config);
        // Default to a compact model as requested
        this.modelName = config.modelName || 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
        this.engine = null;
        this.tools = config.tools || [];
        this._initPromise = null;
    }

    async _initialize() {
        if (this.engine) return;
        if (this._initPromise) return this._initPromise;

        this._initPromise = this._doInitialize();
        try {
            await this._initPromise;
        } finally {
            if (!this.engine) {
                this._initPromise = null;
            }
        }
    }

    async _doInitialize() {
        const startTime = Date.now();
        this._emitEvent('lm:model-load-start', {modelName: this.modelName});

        try {
            const {CreateMLCEngine} = await importMLC();

            const initProgressCallback = (progress) => {
                // progress is { progress: number, text: string, timeElapsed: number }
                this._emitEvent('lm:model-dl-progress', {
                    modelName: this.modelName,
                    progress: progress.progress, // 0-1
                    text: progress.text
                });
            };

            // Initialize the engine
            this.engine = await CreateMLCEngine(this.modelName, {
                initProgressCallback
            });

            const elapsed = Date.now() - startTime;
            this._emitEvent('lm:model-load-complete', {
                modelName: this.modelName,
                elapsedMs: elapsed
            });
            this._emitDebug('WebLLM Model loaded successfully', {modelName: this.modelName, elapsedMs: elapsed});

        } catch (error) {
            const elapsed = Date.now() - startTime;
            this._emitEvent('lm:model-load-error', {
                modelName: this.modelName,
                error: error.message,
                elapsedMs: elapsed
            });
            this.engine = null;
            throw error;
        }
    }

    async generateText(prompt, options = {}) {
        await this._initialize();

        const {maxTokens, temperature} = options;
        const temp = temperature ?? this.temperature ?? 0.7;

        try {
            const messages = [{ role: "user", content: prompt }];
            const reply = await this.engine.chat.completions.create({
                messages,
                temperature: temp,
                max_tokens: maxTokens ?? this.maxTokens ?? 256, // WebLLM might use max_gen_len or similar, but standard OpenAI API param is max_tokens
            });

            const text = reply.choices[0].message.content;
            return text || '';
        } catch (error) {
            this._emitDebug('WebLLM Generate error', {error: error.message});
            throw error;
        }
    }

    async* streamText(prompt, options = {}) {
        await this._initialize();

        const {maxTokens, temperature} = options;
        const temp = temperature ?? this.temperature ?? 0.7;

        try {
            const messages = [{ role: "user", content: prompt }];
            const asyncChunkGenerator = await this.engine.chat.completions.create({
                messages,
                temperature: temp,
                max_tokens: maxTokens ?? this.maxTokens ?? 256,
                stream: true,
            });

            for await (const chunk of asyncChunkGenerator) {
                const text = chunk.choices[0]?.delta?.content || "";
                if (text) {
                    yield text;
                }
            }
        } catch (error) {
            this._emitDebug('WebLLM Stream error', {error: error.message});
            throw error;
        }
    }

    async destroy() {
        if (this.engine) {
            // WebLLM engine might have an unload method?
            // checking docs or types usually helpful, but engine.unload() is typical if available.
            // CreateMLCEngine returns an MLCEngineInterface which has unload().
            if (typeof this.engine.unload === 'function') {
                await this.engine.unload();
            }
            this.engine = null;
            this._initPromise = null;
        }
    }
}
