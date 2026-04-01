/**
 * ModelRouter.js — NAL-scored task-type routing over AIClient.js
 *
 * When multiModelRouting is false, invoke() routes directly to the configured
 * fallback model via AIClient.js. When true, it scores models by task type
 * using NAL truth values stored as model-score atoms in SemanticMemory.
 *
 * Model scoring atoms format:
 *   (model-score "gpt-4o" :reasoning (stv 0.85 0.72))
 *   (model-score "claude-sonnet-4-6" :introspection (stv 0.91 0.82))
 *   (model-score "qwen2.5-coder" :code (stv 0.82 0.65))
 *
 * NAL expectation for selection: E(stv(f,c)) = f + c*(0.5 - f)
 * — penalizes low-confidence scores without overvaluing untested models.
 *
 * Task types: :reasoning :code :creative :retrieval :tool-use :introspection :social
 */

import { Logger } from '@senars/core';
import { isEnabled } from '../config/capabilities.js';

/**
 * Task type classifier — lightweight heuristic (keyword + pattern matching).
 * The classifier is inspectable by the agent via read-file.
 */
export function classifyTaskType(prompt) {
  const text = prompt.toLowerCase();

  // Code-related patterns
  if (/\b(code|function|class|method|variable|loop|condition|api|endpoint|debug|refactor|implement|write.*code|snippet|syntax|error|bug|fix)\b/.test(text)) {
    return ':code';
  }

  // Reasoning / logic / math
  if (/\b(solve|calculate|compute|reason|logic|math|equation|formula|prove|derive|analyze|compare|evaluate|optimize|algorithm|complexity)\b/.test(text)) {
    return ':reasoning';
  }

  // Creative writing
  if (/\b(write|story|poem|song|creative|imagine|describe|narrate|compose|draft|rewrite|edit|style|tone|voice|metaphor)\b/.test(text)) {
    return ':creative';
  }

  // Information retrieval / Q&A
  if (/\b(what|who|when|where|why|how|find|search|lookup|retrieve|explain|define|describe|list|summarize)\b/.test(text)) {
    return ':retrieval';
  }

  // Tool use / function calling
  if (/\b(call|invoke|execute|run|skill|tool|function|api|command|dispatch|trigger|use.*tool)\b/.test(text)) {
    return ':tool-use';
  }

  // Introspection / self-reflection
  if (/\b(think|reflect|introspect|meta|self|aware|conscious|analyze.*own|improve.*self|learning.*process)\b/.test(text)) {
    return ':introspection';
  }

  // Social / conversational
  if (/\b(hello|hi|greet|chat|conversation|talk|discuss|opinion|feel|emotion|empathy| rapport|friendly|polite)\b/.test(text)) {
    return ':social';
  }

  // Default to reasoning
  return ':reasoning';
}

/**
 * Compute NAL expectation: E = f + c*(0.5 - f)
 * Penalizes low-confidence scores without overvaluing untested models.
 */
export function nalExpectation(frequency, confidence) {
  return frequency + confidence * (0.5 - frequency);
}

/**
 * ModelRouter class.
 */
export class ModelRouter {
  /**
   * @param {Object} config - Agent configuration
   * @param {Object} aiClient - AIClient instance for LLM invocation
   * @param {Object} semanticMemory - SemanticMemory instance for storing model-score atoms
   */
  constructor(config, aiClient, semanticMemory = null) {
    this._config = config;
    this._aiClient = aiClient;
    this._semanticMemory = semanticMemory;
    this._modelScores = new Map(); // "model:type" → { frequency, confidence }
    this._invocationHistory = []; // For modelScoreUpdates
    this._explorationRate = config.models?.explorationRate ?? 0.2;
  }

  /**
   * Initialize: load model-score atoms from SemanticMemory.
   */
  async initialize() {
    if (!this._semanticMemory) return;

    await this._semanticMemory.initialize();

    // Query for model-score atoms (procedural type)
    const scores = await this._semanticMemory.query('model-score', 1000, { type: ':procedural' });

    for (const score of scores) {
      // Parse content: (model-score "gpt-4o" :reasoning (stv 0.85 0.72))
      const match = score.content.match(/\(model-score\s+"([^"]+)"\s+(:\w+)\s+\(stv\s+([\d.]+)\s+([\d.]+)\)\)/);
      if (match) {
        const [, model, taskType, freq, conf] = match;
        const key = `${model}:${taskType}`;
        this._modelScores.set(key, {
          frequency: parseFloat(freq),
          confidence: parseFloat(conf)
        });
      }
    }

    Logger.info(`[ModelRouter] Loaded ${this._modelScores.size} model scores`);
  }

  /**
   * Select a model for a given task.
   * @param {string} prompt - The task prompt
   * @param {string} [override] - Explicit model override, or "auto" for routing
   * @returns {Promise<string>} Selected model name
   */
  async selectModel(prompt, override = 'auto') {
    // If multiModelRouting disabled, use fallback
    if (!isEnabled(this._config, 'multiModelRouting')) {
      return this._config.models?.fallback ?? 'gpt-4o-mini';
    }

    // Explicit override
    if (override && override !== 'auto') {
      Logger.debug(`[ModelRouter] Override: ${override}`);
      return override;
    }

    // Exploration mode: epsilon-greedy
    if (isEnabled(this._config, 'modelExploration')) {
      if (Math.random() < this._explorationRate) {
        return this._selectForExploration(prompt);
      }
    }

    // Task type classification
    const taskType = classifyTaskType(prompt);
    Logger.debug(`[ModelRouter] Task type: ${taskType}`);

    // Get all available models from config
    const providers = this._config.models?.providers ?? {};
    const availableModels = [];

    for (const [providerName, providerConfig] of Object.entries(providers)) {
      if (!providerConfig.enabled) continue;
      for (const model of providerConfig.models ?? []) {
        availableModels.push(model);
      }
    }

    if (availableModels.length === 0) {
      return this._config.models?.fallback ?? 'gpt-4o-mini';
    }

    // Score each model for this task type
    let bestModel = availableModels[0];
    let bestScore = -Infinity;

    for (const model of availableModels) {
      const key = `${model}:${taskType}`;
      const scoreData = this._modelScores.get(key);

      let score;
      if (scoreData) {
        score = nalExpectation(scoreData.frequency, scoreData.confidence);
      } else {
        // Unscored model: neutral prior with zero confidence
        score = nalExpectation(0.5, 0.0);
      }

      Logger.debug(`[ModelRouter] ${model} for ${taskType}: E=${score.toFixed(3)}`);

      if (score > bestScore) {
        bestScore = score;
        bestModel = model;
      }
    }

    Logger.info(`[ModelRouter] Selected ${bestModel} for ${taskType} (E=${bestScore.toFixed(3)})`);
    return bestModel;
  }

  /**
   * Select a model for exploration (epsilon-greedy).
   * Chooses the model with the lowest confidence score (fewest samples).
   */
  _selectForExploration(prompt) {
    const taskType = classifyTaskType(prompt);
    const providers = this._config.models?.providers ?? {};
    const availableModels = [];

    for (const [providerName, providerConfig] of Object.entries(providers)) {
      if (!providerConfig.enabled) continue;
      for (const model of providerConfig.models ?? []) {
        availableModels.push(model);
      }
    }

    // Find model with lowest confidence
    let lowestConfModel = availableModels[0];
    let lowestConf = Infinity;

    for (const model of availableModels) {
      const key = `${model}:${taskType}`;
      const scoreData = this._modelScores.get(key);
      const conf = scoreData?.confidence ?? 0.0;

      if (conf < lowestConf) {
        lowestConf = conf;
        lowestConfModel = model;
      }
    }

    Logger.info(`[ModelRouter] Exploration: ${lowestConfModel} for ${taskType}`);
    return lowestConfModel;
  }

  /**
   * Invoke the LLM with automatic model selection.
   * @param {string} prompt - The task prompt
   * @param {Object} options - AIClient options
   * @param {string} [override] - Model override
   * @returns {Promise<Object>} AIClient response
   */
  async invoke(prompt, options = {}, override = 'auto') {
    const model = await this.selectModel(prompt, override);
    const taskType = classifyTaskType(prompt);

    Logger.debug(`[ModelRouter] Invoking ${model} for ${taskType}`);

    const result = await this._aiClient.generate(prompt, {
      ...options,
      model,
      provider: this._getProviderForModel(model)
    });

    // Record invocation if modelScoreUpdates enabled
    if (isEnabled(this._config, 'modelScoreUpdates') && this._semanticMemory) {
      await this._recordInvocation(model, taskType, result);
    }

    return result;
  }

  /**
   * Record an invocation and update model scores.
   */
  async _recordInvocation(model, taskType, result) {
    const timestamp = Date.now();
    const success = this._evaluateSuccess(result);

    // Store invocation record
    this._invocationHistory.push({ model, taskType, success, timestamp });

    // Update model-score atom
    const key = `${model}:${taskType}`;
    const current = this._modelScores.get(key) ?? { frequency: 0.5, confidence: 0.0 };

    // Truth revision: success = stv(1.0, 0.9), failure = stv(0.0, 0.9)
    const newFreq = current.frequency + (success ? 0.1 : -0.1);
    const newConf = Math.min(0.95, current.confidence + 0.05);

    const updated = {
      frequency: Math.max(0.0, Math.min(1.0, newFreq)),
      confidence: newConf
    };

    this._modelScores.set(key, updated);

    // Persist to SemanticMemory
    await this._persistScore(model, taskType, updated);

    Logger.debug(`[ModelRouter] Updated ${model}:${taskType} → stv(${updated.frequency.toFixed(2)}, ${updated.confidence.toFixed(2)})`);
  }

  /**
   * Evaluate whether an LLM response was successful.
   * Simple heuristic: non-empty, no error markers.
   */
  _evaluateSuccess(result) {
    if (!result) return false;
    const text = result.text ?? '';
    if (!text || text.length < 10) return false;
    if (/\b(error|failed|unable|cannot|sorry)\b/i.test(text)) return false;
    return true;
  }

  /**
   * Persist a model score to SemanticMemory.
   */
  async _persistScore(model, taskType, score) {
    if (!this._semanticMemory) return;

    const content = `(model-score "${model}" ${taskType} (stv ${score.frequency.toFixed(2)} ${score.confidence.toFixed(2)}))`;

    // Remove existing score for this model:type
    const existing = await this._semanticMemory.query(`model-score "${model}" ${taskType}`, 10);
    for (const mem of existing) {
      await this._semanticMemory.forget(mem.content, 1);
    }

    // Store new score
    await this._semanticMemory.remember({
      content,
      type: ':procedural',
      source: 'model-router',
      tags: ['model-score', model, taskType],
      truth: { frequency: score.frequency, confidence: score.confidence }
    });
  }

  /**
   * Get provider for a model name.
   */
  _getProviderForModel(modelName) {
    const providers = this._config.models?.providers ?? {};

    for (const [providerName, providerConfig] of Object.entries(providers)) {
      if (!providerConfig.enabled) continue;
      if ((providerConfig.models ?? []).includes(modelName)) {
        return providerName;
      }
    }

    return null;
  }

  /**
   * Get all model scores as a structured object.
   * @returns {Object} { "model:type": { frequency, confidence, expectation } }
   */
  getScores() {
    const result = {};
    for (const [key, score] of this._modelScores.entries()) {
      result[key] = {
        frequency: score.frequency,
        confidence: score.confidence,
        expectation: nalExpectation(score.frequency, score.confidence)
      };
    }
    return result;
  }

  /**
   * Manually set a model score.
   */
  async setScore(model, taskType, frequency, confidence) {
    const score = { frequency, confidence };
    this._modelScores.set(`${model}:${taskType}`, score);
    await this._persistScore(model, taskType, score);
  }

  /**
   * Get statistics.
   */
  get stats() {
    return {
      totalScores: this._modelScores.size,
      totalInvocations: this._invocationHistory.length,
      byTaskType: this._getByTaskType()
    };
  }

  _getByTaskType() {
    const result = {};
    for (const [key, score] of this._modelScores.entries()) {
      const [model, taskType] = key.split(':');
      if (!result[taskType]) result[taskType] = [];
      result[taskType].push({ model, ...score });
    }
    return result;
  }
}
