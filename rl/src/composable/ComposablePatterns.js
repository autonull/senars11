/**
 * Composable Patterns
 * Reusable composition patterns: branch, loop, parallel
 */

/**
 * Conditional branching pattern
 */
export class BranchPattern {
    constructor(condition, truePipeline, falsePipeline = null) {
        this.id = `branch_${Date.now()}`;
        this.type = 'branch';
        this.condition = condition;
        this.truePipeline = truePipeline;
        this.falsePipeline = falsePipeline;
    }

    async act(input, context) {
        const shouldBranch = typeof this.condition === 'function'
            ? await this.condition(input, context)
            : this.condition;

        const pipeline = shouldBranch ? this.truePipeline : this.falsePipeline;
        if (!pipeline) return input;

        return pipeline.act ? pipeline.act(input, context) : input;
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            hasTruePipeline: !!this.truePipeline,
            hasFalsePipeline: !!this.falsePipeline
        };
    }
}

/**
 * Loop pattern with termination condition
 */
export class LoopPattern {
    constructor(pipeline, until, maxIterations = 10) {
        this.id = `loop_${Date.now()}`;
        this.type = 'loop';
        this.pipeline = pipeline;
        this.until = until;
        this.maxIterations = maxIterations;
    }

    async act(input, context) {
        let current = input;

        for (let i = 0; i < this.maxIterations; i++) {
            const result = this.pipeline.act
                ? await this.pipeline.act(current, context)
                : current;

            if (await this.until(result, context, i)) {
                break;
            }

            current = result;
        }

        return current;
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            maxIterations: this.maxIterations
        };
    }
}

/**
 * Parallel execution pattern
 */
export class ParallelPattern {
    constructor(pipelines) {
        this.id = `parallel_${Date.now()}`;
        this.type = 'parallel';
        this.pipelines = pipelines;
    }

    async act(input, context) {
        const results = await Promise.allSettled(
            this.pipelines.map(p => p.act ? p.act(input, context) : input)
        );

        return results.map((r, i) => ({
            pipeline: i,
            success: r.status === 'fulfilled',
            result: r.status === 'fulfilled' ? r.value : null,
            error: r.status === 'rejected' ? r.reason : null
        }));
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            pipelines: this.pipelines.length
        };
    }
}

/**
 * Pipeline chain pattern
 */
export class ChainPattern {
    constructor(pipelines, engine) {
        this.id = `chain_${Date.now()}`;
        this.type = 'chain';
        this.pipelines = pipelines;
        this.engine = engine;
    }

    async act(input, context) {
        let current = input;

        for (const pipelineName of this.pipelines) {
            const pipeline = this.engine.getPipeline(pipelineName);
            if (!pipeline) {
                throw new Error(`Pipeline not found: ${pipelineName}`);
            }

            const result = await this.engine.execute(pipelineName, current, context);
            if (!result.success) {
                return result;
            }
            current = result.output;
        }

        return { success: true, output: current };
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            pipelines: this.pipelines
        };
    }
}

/**
 * Retry pattern
 */
export class RetryPattern {
    constructor(pipeline, maxRetries = 3, delay = 1000) {
        this.id = `retry_${Date.now()}`;
        this.type = 'retry';
        this.pipeline = pipeline;
        this.maxRetries = maxRetries;
        this.delay = delay;
    }

    async act(input, context) {
        let lastError;

        for (let i = 0; i < this.maxRetries; i++) {
            try {
                const result = await this.pipeline.act(input, context);
                if (i > 0) {
                    result.retries = i;
                }
                return result;
            } catch (error) {
                lastError = error;
                if (i < this.maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, this.delay));
                }
            }
        }

        throw lastError;
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            maxRetries: this.maxRetries,
            delay: this.delay
        };
    }
}

/**
 * Timeout pattern
 */
export class TimeoutPattern {
    constructor(pipeline, timeout) {
        this.id = `timeout_${Date.now()}`;
        this.type = 'timeout';
        this.pipeline = pipeline;
        this.timeout = timeout;
    }

    async act(input, context) {
        return Promise.race([
            this.pipeline.act(input, context),
            new Promise((_, reject) => {
                const timer = setTimeout(
                    () => reject(new Error(`Timeout after ${this.timeout}ms`)),
                    this.timeout
                );
                timer.unref();
            })
        ]);
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            timeout: this.timeout
        };
    }
}

/**
 * Pattern factory for creating composition patterns
 */
export const Patterns = {
    branch(condition, truePipeline, falsePipeline) {
        return new BranchPattern(condition, truePipeline, falsePipeline);
    },

    loop(pipeline, until, maxIterations) {
        return new LoopPattern(pipeline, until, maxIterations);
    },

    parallel(pipelines) {
        return new ParallelPattern(pipelines);
    },

    chain(pipelines, engine) {
        return new ChainPattern(pipelines, engine);
    },

    retry(pipeline, maxRetries, delay) {
        return new RetryPattern(pipeline, maxRetries, delay);
    },

    timeout(pipeline, timeout) {
        return new TimeoutPattern(pipeline, timeout);
    }
};
