/**
 * Embedder.js — Lazy-loaded embedding generator
 *
 * Supports:
 * - Local ONNX models via @huggingface/transformers (default: Xenova/all-MiniLM-L6-v2)
 * - OpenAI API fallback (text-embedding-3-small)
 *
 * Lazy initialization: model loads on first embed() call.
 */

import {Logger} from '@senars/core';

export class Embedder {
    constructor(config = {}) {
        this._config = config;
        this._model = null;
        this._modelName = config.model ?? 'Xenova/all-MiniLM-L6-v2';
        this._dimensions = config.dimensions ?? 384;
        this._fallback = config.fallback ?? null; // { provider: 'openai', apiKey: '...' }
        this._initialized = false;
        this._initPromise = null;
    }

    /**
     * Get the embedding dimensions.
     */
    get dimensions() {
        return this._dimensions;
    }

    /**
     * Lazy initialization. Loads the ONNX model on first call.
     */
    async _ensureInitialized() {
        if (this._initialized) {
            return;
        }
        if (this._initPromise) {
            return this._initPromise;
        }

        this._initPromise = (async () => {
            try {
                const {pipeline} = await import('@huggingface/transformers');
                Logger.info(`[Embedder] Loading ${this._modelName}...`);
                this._model = await pipeline('feature-extraction', this._modelName, {
                    quantized: true,
                    progress_callback: null // disable progress bar
                });
                this._dimensions = this._model.config?.hidden_size ?? 384;
                this._initialized = true;
                Logger.info(`[Embedder] Ready (${this._dimensions} dims)`);
            } catch (err) {
                Logger.error('[Embedder] Failed to load local model:', err.message);
                if (this._fallback) {
                    Logger.info('[Embedder] Will use API fallback');
                    this._initialized = true; // API fallback ready
                } else {
                    throw err;
                }
            }
        })();

        return this._initPromise;
    }

    /**
     * Generate embedding for a single text string.
     * @param {string} text - Input text
     * @returns {Promise<number[]>} - Embedding vector
     */
    async embed(text) {
        await this._ensureInitialized();

        if (!this._model && this._fallback) {
            return this._embedAPI(text);
        }

        try {
            const output = await this._model(text, {
                pooling: 'mean',
                normalize: true
            });
            return Array.from(output.data);
        } catch (err) {
            Logger.error('[Embedder] Local embed failed:', err.message);
            if (this._fallback) {
                return this._embedAPI(text);
            }
            throw err;
        }
    }

    /**
     * Generate embeddings for multiple texts (batch).
     * @param {string[]} texts - Array of input texts
     * @returns {Promise<number[][]>} - Array of embedding vectors
     */
    async embedBatch(texts) {
        await this._ensureInitialized();
        const results = [];
        for (const text of texts) {
            results.push(await this.embed(text));
        }
        return results;
    }

    /**
     * OpenAI API fallback embedding.
     */
    async _embedAPI(text) {
        if (!this._fallback || this._fallback.provider !== 'openai') {
            throw new Error('No API fallback configured');
        }

        const apiKey = this._fallback.apiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OpenAI API key not provided');
        }

        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'text-embedding-3-small',
                input: text,
                encoding_format: 'float'
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenAI API error: ${err}`);
        }

        const data = await response.json();
        return data.data[0].embedding;
    }
}
