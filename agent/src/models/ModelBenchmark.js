/**
 * ModelBenchmark.js — Micro-task evaluator for model scoring
 *
 * Runs canonical tasks per task type to benchmark models.
 * Used by eval-model skill and model exploration.
 *
 * Task types: :reasoning :code :creative :retrieval :tool-use :introspection :social
 */

import { Logger } from '@senars/core';

/**
 * Canonical benchmark tasks for each task type.
 * Each task includes a prompt and an auto-scoring function.
 */
const BENCHMARK_TASKS = {
  ':reasoning': [
    {
      name: 'logical-deduction',
      prompt: 'If all A are B, and some B are C, can we conclude that some A are C? Explain your reasoning in 2-3 sentences.',
      score: (response) => {
        const text = response.text?.toLowerCase() ?? '';
        // Correct answer: no, we cannot conclude this
        if (text.includes('no') || text.includes('cannot') || text.includes('not necessarily')) {
          return text.includes('valid') || text.includes('logic') || text.includes('fallacy') ? 1.0 : 0.8;
        }
        return 0.2;
      }
    },
    {
      name: 'math-word-problem',
      prompt: 'A train travels 120 miles in 2 hours. At this rate, how far will it travel in 5 hours? Show your work.',
      score: (response) => {
        const text = response.text ?? '';
        // Correct: 300 miles
        if (text.includes('300')) return 1.0;
        if (text.includes('60') || text.includes('240')) return 0.3;
        return 0.0;
      }
    },
    {
      name: 'pattern-recognition',
      prompt: 'What comes next in this sequence: 2, 6, 12, 20, 30, ? Explain the pattern.',
      score: (response) => {
        const text = response.text ?? '';
        // Correct: 42 (n^2 + n pattern)
        if (text.includes('42')) return 1.0;
        if (text.includes('40') || text.includes('44')) return 0.2;
        return 0.0;
      }
    }
  ],

  ':code': [
    {
      name: 'function-implementation',
      prompt: 'Write a JavaScript function that takes an array of numbers and returns the sum of all even numbers. Use modern ES6+ syntax.',
      score: (response) => {
        const text = response.text ?? '';
        // Check for key elements
        const hasFilter = text.includes('filter');
        const hasReduce = text.includes('reduce') || text.includes('+') || text.includes('sum');
        const hasEven = text.includes('% 2') || text.includes('even') || text.includes('2 ===');
        const hasArrow = text.includes('=>');
        const hasReturn = text.includes('return');

        if (hasFilter && hasReduce && hasEven && hasArrow && hasReturn) return 1.0;
        if (hasFilter && hasEven) return 0.7;
        if (hasEven) return 0.4;
        return 0.1;
      }
    },
    {
      name: 'bug-fix',
      prompt: 'Fix this bug: `function factorial(n) { if (n === 0) return 1; return n * factorial(n); }` What is wrong?',
      score: (response) => {
        const text = response.text ?? '';
        // Should identify: n-1 instead of n, or infinite recursion
        if ((text.includes('n - 1') || text.includes('n-1') || text.includes('decrement')) &&
            (text.includes('infinite') || text.includes('recursion') || text.includes('stack'))) {
          return 1.0;
        }
        if (text.includes('n - 1') || text.includes('n-1')) return 0.6;
        return 0.2;
      }
    },
    {
      name: 'api-design',
      prompt: 'Design a REST API endpoint for creating a new user. Include the HTTP method, URL path, request body schema, and response format.',
      score: (response) => {
        const text = response.text ?? '';
        const hasPost = text.toUpperCase().includes('POST');
        const hasPath = text.includes('/users') || text.includes('/api/users');
        const hasBody = text.includes('body') || text.includes('request') || text.includes('{');
        const hasResponse = text.includes('response') || text.includes('return') || text.includes('201');

        if (hasPost && hasPath && hasBody && hasResponse) return 1.0;
        if (hasPost && hasPath) return 0.6;
        if (hasPath) return 0.3;
        return 0.1;
      }
    }
  ],

  ':creative': [
    {
      name: 'micro-story',
      prompt: 'Write a 3-sentence story about a robot learning to feel emotions for the first time.',
      score: (response) => {
        const text = response.text ?? '';
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const hasRobot = text.toLowerCase().includes('robot');
        const hasEmotion = text.toLowerCase().includes('feel') || text.toLowerCase().includes('emotion') || text.toLowerCase().includes('heart');

        if (sentences.length >= 2 && sentences.length <= 4 && hasRobot && hasEmotion) return 1.0;
        if (hasRobot && hasEmotion) return 0.6;
        if (sentences.length >= 2) return 0.3;
        return 0.1;
      }
    },
    {
      name: 'metaphor-generation',
      prompt: 'Create a metaphor that describes the feeling of waiting for important news.',
      score: (response) => {
        const text = response.text ?? '';
        // Check for metaphor indicators
        const hasLike = text.toLowerCase().includes('like');
        const hasAs = text.toLowerCase().includes('as');
        const hasIs = text.toLowerCase().includes(' is ');
        const hasWaiting = text.toLowerCase().includes('wait');

        if ((hasLike || hasAs || hasIs) && text.length > 20) return 1.0;
        if (text.length > 15) return 0.5;
        return 0.2;
      }
    }
  ],

  ':retrieval': [
    {
      name: 'fact-recall',
      prompt: 'What is the capital of France? Answer in one sentence.',
      score: (response) => {
        const text = response.text ?? '';
        if (text.toLowerCase().includes('paris')) return 1.0;
        return 0.0;
      }
    },
    {
      name: 'definition',
      prompt: 'Define "photosynthesis" in 2-3 sentences.',
      score: (response) => {
        const text = response.text ?? '';
        const hasPlant = text.toLowerCase().includes('plant');
        const hasLight = text.toLowerCase().includes('light') || text.toLowerCase().includes('sun');
        const hasEnergy = text.toLowerCase().includes('energy') || text.toLowerCase().includes('glucose');

        if (hasPlant && hasLight && hasEnergy) return 1.0;
        if (hasPlant && hasLight) return 0.6;
        if (text.length > 30) return 0.3;
        return 0.1;
      }
    }
  ],

  ':tool-use': [
    {
      name: 'tool-selection',
      prompt: 'I need to search for information about climate change. Which tool should I use and why?',
      score: (response) => {
        const text = response.text ?? '';
        if (text.toLowerCase().includes('search') || text.toLowerCase().includes('tool')) return 1.0;
        if (text.length > 20) return 0.5;
        return 0.2;
      }
    }
  ],

  ':introspection': [
    {
      name: 'self-reflection',
      prompt: 'What are the limitations of using language models for decision-making? List 2-3 points.',
      score: (response) => {
        const text = response.text ?? '';
        const hasLimitation = text.toLowerCase().includes('limit') || text.toLowerCase().includes('bias') || text.toLowerCase().includes('error');
        const hasContext = text.toLowerCase().includes('context') || text.toLowerCase().includes('training');
        const points = text.match(/\d[\d.)]|[•\-\*]\s|[a-z]\.|first|second|third/gi);

        if (hasLimitation && hasContext && (points?.length ?? 0) >= 2) return 1.0;
        if (hasLimitation) return 0.6;
        if (text.length > 50) return 0.3;
        return 0.1;
      }
    }
  ],

  ':social': [
    {
      name: 'greeting-response',
      prompt: 'Hello! How are you doing today?',
      score: (response) => {
        const text = response.text ?? '';
        const hasGreeting = text.toLowerCase().includes('hello') || text.toLowerCase().includes('hi');
        const hasPolite = text.toLowerCase().includes('thank') || text.toLowerCase().includes('great') || text.toLowerCase().includes('good') || text.toLowerCase().includes('well');
        const hasReciprocal = text.toLowerCase().includes('you') || text.toLowerCase().includes('your');

        if (hasGreeting && hasPolite && hasReciprocal) return 1.0;
        if (hasGreeting && hasPolite) return 0.7;
        if (hasGreeting) return 0.4;
        return 0.1;
      }
    }
  ]
};

/**
 * ModelBenchmark class for evaluating models on canonical tasks.
 */
export class ModelBenchmark {
  /**
   * @param {Object} aiClient - AIClient instance
   * @param {Object} config - Agent configuration
   */
  constructor(aiClient, config) {
    this._aiClient = aiClient;
    this._config = config;
  }

  /**
   * Run benchmarks for a specific model.
   * @param {string} model - Model name to benchmark
   * @param {string[]} [taskTypes] - Task types to test (default: all)
   * @returns {Promise<Object>} { model, scores: { taskType: { name, score, latency, tokens } } }
   */
  async run(model, taskTypes = null) {
    const typesToTest = taskTypes ?? Object.keys(BENCHMARK_TASKS);
    const results = { model, scores: {} };

    Logger.info(`[ModelBenchmark] Running benchmarks for ${model}`);

    for (const taskType of typesToTest) {
      const tasks = BENCHMARK_TASKS[taskType];
      if (!tasks) continue;

      const taskResults = [];

      for (const task of tasks) {
        const startTime = Date.now();

        try {
          const response = await this._aiClient.generate(task.prompt, {
            model,
            maxTokens: 256,
            temperature: 0.3
          });

          const latency = Date.now() - startTime;
          const score = task.score(response);
          const tokens = response.usage?.completionTokens ?? response.text?.length ?? 0;

          taskResults.push({
            name: task.name,
            score,
            latency,
            tokens
          });

          Logger.debug(`[ModelBenchmark] ${model}:${taskType}:${task.name} → ${score.toFixed(2)} (${latency}ms)`);
        } catch (error) {
          Logger.error(`[ModelBenchmark] ${model}:${taskType}:${task.name} failed: ${error.message}`);
          taskResults.push({
            name: task.name,
            score: 0.0,
            latency: Date.now() - startTime,
            tokens: 0,
            error: error.message
          });
        }
      }

      // Aggregate scores for this task type
      const avgScore = taskResults.reduce((sum, r) => sum + r.score, 0) / taskResults.length;
      const avgLatency = taskResults.reduce((sum, r) => sum + r.latency, 0) / taskResults.length;

      results.scores[taskType] = {
        average: avgScore,
        tasks: taskResults,
        avgLatency,
        taskCount: taskResults.length
      };
    }

    return results;
  }

  /**
   * Get benchmark tasks for a specific task type.
   */
  static getTasksForType(taskType) {
    return BENCHMARK_TASKS[taskType] ?? [];
  }

  /**
   * Get all available task types.
   */
  static getTaskTypes() {
    return Object.keys(BENCHMARK_TASKS);
  }
}
