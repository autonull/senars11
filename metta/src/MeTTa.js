/**
 * MeTTa.js - Ergonomic API for MeTTa interpreter
 */

import { MeTTaInterpreter } from './MeTTaInterpreter.js';
import { configManager } from './config/config.js';
import { Space } from './kernel/Space.js';

/**
 * Create a new MeTTa interpreter with optional configuration
 */
export function createMeTTa(options = {}) {
    return new MeTTaInterpreter(options);
}

/**
 * Fluent builder for MeTTa configuration
 */
export class MeTTaBuilder {
    constructor() {
        this.options = {};
    }

    withJIT(threshold = 50) {
        this.options.jit = true;
        this.options.jitThreshold = threshold;
        return this;
    }

    withCaching(capacity = 1000) {
        this.options.caching = true;
        this.options.cacheCapacity = capacity;
        return this;
    }

    withTensor() {
        this.options.tensor = true;
        return this;
    }

    withSMT() {
        this.options.smt = true;
        return this;
    }

    withDebugging() {
        this.options.debugging = true;
        return this;
    }

    withMaxSteps(steps = 1000) {
        this.options.maxReductionSteps = steps;
        return this;
    }

    build() {
        return new MeTTaInterpreter(this.options);
    }
}

/**
 * Quick evaluation helper - creates interpreter, runs code, returns result
 */
export function evaluate(code, options = {}) {
    return new MeTTaInterpreter(options).run(code);
}

/**
 * Run MeTTa code with custom space and ground
 */
export function runInContext(code, space, ground, options = {}) {
    const interp = new MeTTaInterpreter(options);
    interp.space = space;
    interp.ground = ground;
    return interp.run(code);
}

/**
 * Session with persistent state
 */
export class MeTTaSession {
    constructor(options = {}) {
        this.interpreter = new MeTTaInterpreter(options);
        this.history = [];
        this.spaces = new Map();
    }

    run(code) {
        const result = this.interpreter.run(code);
        this.history.push({ code, result, timestamp: Date.now() });
        return result;
    }

    evaluate(atom) {
        return this.interpreter.evaluate(this.interpreter.parser.parse(atom));
    }

    createSpace(name) {
        const space = new Space();
        this.spaces.set(name, space);
        return space;
    }

    getSpace(name) {
        return this.spaces.get(name);
    }

    getHistory() {
        return [...this.history];
    }

    clearHistory() {
        this.history = [];
        return this;
    }

    export() {
        return {
            history: this.history,
            spaceCount: this.spaces.size,
            options: this.interpreter.config.getAll()
        };
    }
}

/**
 * Configuration presets for common use cases
 */
export const Presets = {
    fast: { jit: true, jitThreshold: 30, caching: true, cacheCapacity: 2000 },
    debug: { debugging: true, tracing: true, maxReductionSteps: 10000 },
    reasoning: { smt: true, tensor: true, maxReductionSteps: 5000 },
    minimal: { jit: false, caching: false, tensor: false, smt: false }
};

/**
 * Create interpreter with a preset
 */
export function createWithPreset(preset, overrides = {}) {
    return new MeTTaInterpreter({ ...Presets[preset], ...overrides });
}
