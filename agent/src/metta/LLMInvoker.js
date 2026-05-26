/**
 * LLMInvoker.js — Shared LLM invocation service
 *
 * Single source of truth for LLM calls across MeTTaLoopBuilder,
 * MeTTaOpRegistrar, CognitiveLLM, and HarnessOptimizer.
 *
 * Handles: model routing, override management, error handling,
 * circuit breaker integration, and audit emission.
 */
import { Logger } from '@senars/core';

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2000;
const RETRYABLE_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'UND_ERR_SOCKET']);

export class LLMInvoker {
    #agent;
    #agentCfg;
    #loopState;
    #cap;
    #auditSpace;

    constructor(agent, agentCfg, loopState, cap, auditSpace) {
        this.#agent = agent;
        this.#agentCfg = agentCfg;
        this.#loopState = loopState;
        this.#cap = cap;
        this.#auditSpace = auditSpace;
    }

    /**
     * Invoke LLM with context. Returns response text or an error sentinel.
     * Retries up to 3 times on transient network errors with exponential backoff.
     * @param {string} ctxStr — assembled context string
     * @returns {Promise<string>} LLM response text
     */
    async invoke(ctxStr) {
        let lastErr;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const text = await this.#route(ctxStr);
                this.#loopState.lastsend = text ?? '';
                this.#emitAudit(ctxStr, text);
                if (attempt > 1) Logger.info(`[LLMInvoker] Succeeded on attempt ${attempt}`);
                return text ?? '';
            } catch (err) {
                lastErr = err;
                const retryable = this.#isRetryable(err);
                if (retryable && attempt < MAX_RETRIES) {
                    const delay = BASE_BACKOFF_MS * 2 ** (attempt - 1);
                    Logger.warn(`[LLMInvoker] Transient error (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms: ${err.message}`);
                    await new Promise(res => setTimeout(res, delay));
                    continue;
                }
                Logger.error(`[LLMInvoker] Failed after ${attempt} attempt${attempt > 1 ? 's' : ''}: ${err.message}`);
                break;
            }
        }
        this.#loopState.error = `llm-error: ${lastErr?.message ?? 'unknown'}`;
        this.#emitAudit(ctxStr, null);
        return `(llm-error "${(lastErr?.message ?? 'unknown').slice(0, 200)}")`;
    }

    #isRetryable(err) {
        if (!err) return false;
        if (RETRYABLE_CODES.has(err.code)) return true;
        const msg = err.message?.toLowerCase() ?? '';
        return msg.includes('timed out') || msg.includes('socket') || msg.includes('network') || msg.includes('econn');
    }

    async #route(ctxStr) {
        if (this.#cap('multiModelRouting') && this.#agent.modelRouter) {
            return this.#invokeWithRouter(ctxStr);
        }

        let timer;
        try {
            const result = await Promise.race([
                this.#agent.ai.generate(ctxStr, { maxTokens: 256 }),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error('LLM generation timed out after 90s')), 90000);
                })
            ]);
            return result.text ?? '';
        } finally {
            clearTimeout(timer);
        }
    }

    async #invokeWithRouter(ctxStr) {
        let override = 'auto';
        if (this.#loopState.modelOverride && this.#loopState.modelOverrideCycles > 0) {
            override = this.#loopState.modelOverride;
            if (--this.#loopState.modelOverrideCycles <= 0) {
                this.#loopState.modelOverride = null;
            }
        }
        const result = await this.#agent.modelRouter.invoke(ctxStr, {}, override);
        return result.text ?? '';
    }

    #emitAudit(ctxStr, text) {
        if (!this.#auditSpace) return;
        this.#auditSpace.emitLlmCall?.({
            model: this.#agentCfg.lm?.modelName ?? 'unknown',
            inputChars: ctxStr?.length ?? 0,
            outputChars: text?.length ?? 0,
        });
    }
}
