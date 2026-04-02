/**
 * ModelRouter.js — NAL-scored task-type routing over AIClient.js
 */

import { Logger } from '@senars/core';
import { isEnabled } from '../config/capabilities.js';

const TASK_PATTERNS = {
  ':code': /\b(code|function|class|method|variable|loop|condition|api|endpoint|debug|refactor|implement|write.*code|snippet|syntax|error|bug|fix)\b/,
  ':reasoning': /\b(solve|calculate|compute|reason|logic|math|equation|formula|prove|derive|analyze|compare|evaluate|optimize|algorithm|complexity)\b/,
  ':creative': /\b(write|story|poem|song|creative|imagine|describe|narrate|compose|draft|rewrite|edit|style|tone|voice|metaphor)\b/,
  ':retrieval': /\b(what|who|when|where|why|how|find|search|lookup|retrieve|explain|define|describe|list|summarize)\b/,
  ':tool-use': /\b(call|invoke|execute|run|skill|tool|function|api|command|dispatch|trigger|use.*tool)\b/,
  ':introspection': /\b(think|reflect|introspect|meta|self|aware|conscious|analyze.*own|improve.*self|learning.*process)\b/,
  ':social': /\b(hello|hi|greet|chat|conversation|talk|discuss|opinion|feel|emotion|empathy|rapport|friendly|polite)\b/,
};

export function classifyTaskType(prompt) {
  const text = prompt.toLowerCase();
  for (const [type, pattern] of Object.entries(TASK_PATTERNS)) {
    if (pattern.test(text)) return type;
  }
  return ':reasoning';
}

export function nalExpectation(frequency, confidence) {
  return frequency + confidence * (0.5 - frequency);
}

export class ModelRouter {
  constructor(config, aiClient, semanticMemory = null) {
    this._config = config;
    this._aiClient = aiClient;
    this._semanticMemory = semanticMemory;
    this._modelScores = new Map();
    this._invocationHistory = [];
    this._explorationRate = config.models?.explorationRate ?? 0.2;
  }

  async initialize() {
    if (!this._semanticMemory) return;
    await this._semanticMemory.initialize();

    const scores = await this._semanticMemory.query('model-score', 1000, { type: ':procedural' });
    for (const score of scores) {
      const match = score.content.match(/\(model-score\s+"([^"]+)"\s+(:\w+)\s+\(stv\s+([\d.]+)\s+([\d.]+)\)\)/);
      if (match) {
        const [, model, taskType, freq, conf] = match;
        this._modelScores.set(`${model}:${taskType}`, {
          frequency: parseFloat(freq),
          confidence: parseFloat(conf)
        });
      }
    }
    Logger.info(`[ModelRouter] Loaded ${this._modelScores.size} model scores`);
  }

  async selectModel(prompt, override = 'auto') {
    if (!isEnabled(this._config, 'multiModelRouting')) {
      return this._config.models?.fallback ?? 'gpt-4o-mini';
    }
    if (override && override !== 'auto') return override;

    if (isEnabled(this._config, 'modelExploration') && Math.random() < this._explorationRate) {
      return this._selectForExploration(prompt);
    }

    const taskType = classifyTaskType(prompt);
    Logger.debug(`[ModelRouter] Task type: ${taskType}`);

    const providers = this._config.models?.providers ?? {};
    const availableModels = Object.entries(providers)
      .filter(([_, cfg]) => cfg?.enabled)
      .flatMap(([_, cfg]) => cfg?.models ?? []);

    if (!availableModels.length) return this._config.models?.fallback ?? 'gpt-4o-mini';

    let bestModel = availableModels[0], bestScore = -Infinity;
    for (const model of availableModels) {
      const key = `${model}:${taskType}`;
      const scoreData = this._modelScores.get(key);
      const score = scoreData
        ? nalExpectation(scoreData.frequency, scoreData.confidence)
        : nalExpectation(0.5, 0.0);

      Logger.debug(`[ModelRouter] ${model} for ${taskType}: E=${score.toFixed(3)}`);
      if (score > bestScore) {
        bestScore = score;
        bestModel = model;
      }
    }

    Logger.info(`[ModelRouter] Selected ${bestModel} for ${taskType} (E=${bestScore.toFixed(3)})`);
    return bestModel;
  }

  _selectForExploration(prompt) {
    const taskType = classifyTaskType(prompt);
    const providers = this._config.models?.providers ?? {};
    const availableModels = Object.entries(providers)
      .filter(([_, cfg]) => cfg?.enabled)
      .flatMap(([_, cfg]) => cfg?.models ?? []);

    let lowestConfModel = availableModels[0], lowestConf = Infinity;
    for (const model of availableModels) {
      const key = `${model}:${taskType}`;
      const conf = this._modelScores.get(key)?.confidence ?? 0.0;
      if (conf < lowestConf) {
        lowestConf = conf;
        lowestConfModel = model;
      }
    }

    Logger.info(`[ModelRouter] Exploration: ${lowestConfModel} for ${taskType}`);
    return lowestConfModel;
  }

  async invoke(prompt, options = {}, override = 'auto') {
    const model = await this.selectModel(prompt, override);
    const taskType = classifyTaskType(prompt);
    Logger.debug(`[ModelRouter] Invoking ${model} for ${taskType}`);

    const result = await this._aiClient.generate(prompt, {
      ...options,
      model,
      provider: this._getProviderForModel(model)
    });

    if (isEnabled(this._config, 'modelScoreUpdates') && this._semanticMemory) {
      await this._recordInvocation(model, taskType, result);
    }
    return result;
  }

  async _recordInvocation(model, taskType, result) {
    const success = this._evaluateSuccess(result);
    this._invocationHistory.push({ model, taskType, success, timestamp: Date.now() });

    const key = `${model}:${taskType}`;
    const current = this._modelScores.get(key) ?? { frequency: 0.5, confidence: 0.0 };
    const updated = {
      frequency: Math.max(0.0, Math.min(1.0, current.frequency + (success ? 0.1 : -0.1))),
      confidence: Math.min(0.95, current.confidence + 0.05)
    };

    this._modelScores.set(key, updated);
    await this._persistScore(model, taskType, updated);
    Logger.debug(`[ModelRouter] Updated ${model}:${taskType} → stv(${updated.frequency.toFixed(2)}, ${updated.confidence.toFixed(2)})`);
  }

  _evaluateSuccess(result) {
    if (!result) return false;
    const text = result.text ?? '';
    if (!text || text.length < 10) return false;
    return !/\b(error|failed|unable|cannot|sorry)\b/i.test(text);
  }

  async _persistScore(model, taskType, score) {
    if (!this._semanticMemory) return;
    const content = `(model-score "${model}" ${taskType} (stv ${score.frequency.toFixed(2)} ${score.confidence.toFixed(2)}))`;

    const existing = await this._semanticMemory.query(`model-score "${model}" ${taskType}`, 10);
    for (const mem of existing) {
      await this._semanticMemory.forget(mem.content, 1);
    }
    await this._semanticMemory.remember({
      content, type: ':procedural', source: 'model-router',
      tags: ['model-score', model, taskType],
      truth: { frequency: score.frequency, confidence: score.confidence }
    });
  }

  _getProviderForModel(modelName) {
    const providers = this._config.models?.providers ?? {};
    for (const [providerName, providerConfig] of Object.entries(providers)) {
      if (!providerConfig.enabled) continue;
      if ((providerConfig.models ?? []).includes(modelName)) return providerName;
    }
    return null;
  }

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

  async setScore(model, taskType, frequency, confidence) {
    const score = { frequency, confidence };
    this._modelScores.set(`${model}:${taskType}`, score);
    await this._persistScore(model, taskType, score);
  }

  get stats() {
    const byTaskType = {};
    for (const [key, score] of this._modelScores.entries()) {
      const [model, taskType] = key.split(':');
      if (!byTaskType[taskType]) byTaskType[taskType] = [];
      byTaskType[taskType].push({ model, ...score });
    }
    return { totalScores: this._modelScores.size, totalInvocations: this._invocationHistory.length, byTaskType };
  }
}
