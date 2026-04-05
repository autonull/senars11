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
     * Invoke LLM with context.
     * @param {string} ctxStr — assembled context string
     * @returns {Promise<string>} LLM response text
     */
    async invoke(ctxStr) {
        try {
            const text = await this.#route(ctxStr);
            this.#loopState.lastsend = text ?? '';
            this.#emitAudit(ctxStr, text);
            return text ?? '';
        } catch (err) {
            Logger.error('[LLMInvoker]', err.message);
            this.#loopState.error = `llm-error: ${err.message}`;
            return `(llm-error "${err.message.slice(0, 200)}")`;
        }
    }

    async #route(ctxStr) {
        if (this.#cap('multiModelRouting') && this.#agent.modelRouter) {
            return this.#invokeWithRouter(ctxStr);
        }
        const result = await this.#agent.ai.generate(ctxStr);
        return result.text ?? '';
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
