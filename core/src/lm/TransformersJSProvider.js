import {BaseProvider} from './BaseProvider.js';
import {withTimeout} from '../util/AsyncUtils.js';

let pipelinePromise = null;
const importPipeline = () => {
    if (!pipelinePromise) {
        pipelinePromise = import('@huggingface/transformers').then(mod => mod.pipeline);
    }
    return pipelinePromise;
};

export class TransformersJSProvider extends BaseProvider {
    constructor(config = {}) {
        super(config);
        this.modelName = config.modelName ?? 'Xenova/LaMini-Flan-T5-783M';
        this.task = config.task ?? 'text2text-generation';
        this.device = config.device ?? 'cpu';
        this.pipeline = null;
        this.tools = config.tools || [];
    }

    async _initialize() {
        if (this.pipeline) return;

        const startTime = Date.now();
        this._emitEvent('lm:model-load-start', {modelName: this.modelName, task: this.task});

        try {
            const pipeline = await importPipeline();
            const loadModelPromise = pipeline(this.task, this.modelName, {
                device: this.device,
                progress_callback: (progress) => {
                    // progress is usually an object like { status: 'progress', name: 'config.json', file: 'config.json', progress: 10, loaded: 1024, total: 10240 }
                    // or sometimes just a percentage number depending on version, safely handle both
                    if (progress) {
                        this._emitEvent('lm:model-dl-progress', {
                            modelName: this.modelName,
                            progress
                        });
                        // Simple log for immediate visibility in standard output if needed (optional, but requested by plan)
                        if (typeof progress === 'object' && progress.status === 'progress') {
                            // E.g. console.log(`[DL] ${progress.file}: ${Math.round(progress.progress)}%`);
                        }
                    }
                }
            });

            this.pipeline = await withTimeout(
                loadModelPromise,
                this.loadTimeout,
                `Model loading (${this.modelName})`
            );

            const elapsed = Date.now() - startTime;
            this._emitEvent('lm:model-load-complete', {
                modelName: this.modelName,
                task: this.task,
                elapsedMs: elapsed
            });
            this._emitDebug('Model loaded successfully', {modelName: this.modelName, elapsedMs: elapsed});
        } catch (error) {
            const elapsed = Date.now() - startTime;

            if (error.message.includes('timed out')) {
                this._emitEvent('lm:model-load-timeout', {
                    modelName: this.modelName,
                    task: this.task,
                    timeoutMs: this.loadTimeout,
                    elapsedMs: elapsed
                });
            }

            this.pipeline = null; // Cleanup on failure
            throw error;
        }
    }

    async generateText(prompt, options = {}) {
        await this._initialize();

        const {maxTokens, temperature} = options;
        const temp = temperature ?? this.temperature ?? 0.7;

        try {
            const generatePromise = this.pipeline(prompt, {
                max_new_tokens: maxTokens ?? this.maxTokens ?? 100,
                temperature: temp,
                do_sample: temp > 0,
            });

            const output = await withTimeout(
                generatePromise,
                this.loadTimeout,
                'Inference'
            );

            if (Array.isArray(output) && output[0]?.generated_text) {
                let text = output[0].generated_text;
                // Remove prompt prefix if present (common in text-generation)
                if (text.startsWith(prompt)) {
                    text = text.slice(prompt.length);
                }
                return text.trim();
            }
            return String(output);
        } catch (error) {
            this._emitDebug('Pipeline error', {error: error.message});
            throw error;
        }
    }

    async* streamText(prompt, options = {}) {
        // Streaming not reliably supported by transformers.js
        // Fall back to generating full text and yielding it
        const result = await this.generateText(prompt, options);
        yield result;
    }

    async destroy() {
        this.pipeline = null;
    }
}

