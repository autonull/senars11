/**
 * Composition Engine for building and executing component pipelines.
 * Supports parallel execution, conditional branching, and dynamic reconfiguration.
 */
export class CompositionEngine {
    constructor(config = {}) {
        this.config = {
            parallel: true,
            timeout: 30000,
            retry: 0,
            ...config
        };
        this.pipelines = new Map();
        this.executing = new Set();
    }

    /**
     * Create a new pipeline from components.
     * @param {string} name - Pipeline name
     * @param {Array} stages - Pipeline stages
     */
    createPipeline(name, stages) {
        const pipeline = {
            name,
            stages: stages.map((stage, idx) => ({
                id: stage.id || `stage_${idx}`,
                component: stage.component,
                config: stage.config || {},
                parallel: stage.parallel || false,
                condition: stage.condition || null,
                onError: stage.onError || 'stop',
                transform: stage.transform || null
            })),
            createdAt: Date.now()
        };

        this.pipelines.set(name, pipeline);
        return this;
    }

    /**
     * Execute a pipeline.
     * @param {string} name - Pipeline name
     * @param {*} input - Pipeline input
     * @param {Object} context - Execution context
     */
    async execute(name, input, context = {}) {
        const pipeline = this.pipelines.get(name);
        if (!pipeline) {
            throw new Error(`Pipeline not found: ${name}`);
        }

        if (this.executing.has(name)) {
            throw new Error(`Pipeline already executing: ${name}`);
        }

        this.executing.add(name);
        let current = input;
        const results = [];
        const startTime = performance.now();

        try {
            for (const stage of pipeline.stages) {
                // Check condition
                if (stage.condition && !await this.evaluateCondition(stage.condition, current, context)) {
                    results.push({ stage: stage.id, skipped: true });
                    continue;
                }

                // Execute stage
                const result = await this.executeStage(stage, current, context);
                current = this.transformResult(result, stage, current);
                results.push({ stage: stage.id, result: current });
            }

            return {
                success: true,
                output: current,
                results,
                duration: performance.now() - startTime
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                results,
                duration: performance.now() - startTime
            };
        } finally {
            this.executing.delete(name);
        }
    }

    /**
     * Execute a single pipeline stage.
     */
    async executeStage(stage, input, context) {
        const component = stage.component;
        
        if (!component) {
            throw new Error(`Stage ${stage.id} has no component`);
        }

        // Handle parallel execution for multiple components
        if (stage.parallel && Array.isArray(component)) {
            return this.executeParallel(component, input, context);
        }

        // Single component execution
        return this.executeComponent(component, input, context, stage.config);
    }

    /**
     * Execute components in parallel.
     */
    async executeParallel(components, input, context) {
        const results = await Promise.allSettled(
            components.map(comp => this.executeComponent(comp, input, context, {}))
        );

        return results.map((result, idx) => ({
            index: idx,
            success: result.status === 'fulfilled',
            value: result.status === 'fulfilled' ? result.value : null,
            error: result.status === 'rejected' ? result.reason : null
        }));
    }

    /**
     * Execute a single component.
     */
    async executeComponent(component, input, context, config) {
        // Initialize if needed
        if (component.initialize && !component.initialized) {
            await component.initialize();
        }

        // Determine method to call
        const method = config.method || 'act';
        
        if (typeof component[method] !== 'function') {
            throw new Error(`Component does not have method: ${method}`);
        }

        // Execute with timeout
        const timeout = config.timeout || this.config.timeout;
        const promise = component[method].call(component, input, context);
        
        const result = await Promise.race([
            promise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
            )
        ]);

        return result;
    }

    /**
     * Evaluate a condition function.
     */
    async evaluateCondition(condition, input, context) {
        if (typeof condition === 'function') {
            return condition(input, context);
        }
        if (typeof condition === 'boolean') {
            return condition;
        }
        return true;
    }

    /**
     * Transform result using stage transform function.
     */
    transformResult(result, stage, previous) {
        if (stage.transform && typeof stage.transform === 'function') {
            return stage.transform(result, previous);
        }
        return result;
    }

    /**
     * Get pipeline info.
     * @param {string} name - Pipeline name
     */
    getPipeline(name) {
        return this.pipelines.get(name);
    }

    /**
     * List all pipelines.
     */
    listPipelines() {
        return Array.from(this.pipelines.entries()).map(([name, pipeline]) => ({
            name,
            stages: pipeline.stages.length,
            createdAt: pipeline.createdAt
        }));
    }

    /**
     * Remove a pipeline.
     * @param {string} name - Pipeline name
     */
    removePipeline(name) {
        return this.pipelines.delete(name);
    }

    /**
     * Chain multiple pipelines.
     * @param {string} name - New chained pipeline name
     * @param {Array<string>} pipelineNames - Names of pipelines to chain
     */
    chain(name, pipelineNames) {
        const stages = [];
        
        for (const pipelineName of pipelineNames) {
            const pipeline = this.pipelines.get(pipelineName);
            if (!pipeline) {
                throw new Error(`Pipeline not found: ${pipelineName}`);
            }
            stages.push(...pipeline.stages.map(s => ({ ...s, sourcePipeline: pipelineName })));
        }

        return this.createPipeline(name, stages);
    }

    /**
     * Create a conditional branch.
     * @param {Function} condition - Condition function
     * @param {Array} trueStages - Stages if true
     * @param {Array} falseStages - Stages if false
     */
    branch(condition, trueStages, falseStages = []) {
        return [
            { id: 'branch_true', component: trueStages, condition, parallel: false },
            { id: 'branch_false', component: falseStages, condition: (input, ctx) => !condition(input, ctx), parallel: false }
        ];
    }

    /**
     * Create a loop stage.
     * @param {Array} stages - Stages to loop
     * @param {Function} until - Termination condition
     * @param {number} maxIterations - Maximum iterations
     */
    loop(stages, until, maxIterations = 10) {
        return {
            id: `loop_${Date.now()}`,
            component: {
                async act(input, context) {
                    let current = input;
                    for (let i = 0; i < maxIterations; i++) {
                        for (const stage of stages) {
                            const engine = new CompositionEngine();
                            engine.createPipeline('loop_stage', [stage]);
                            const result = await engine.execute('loop_stage', current, context);
                            current = result.output;
                        }
                        
                        if (await until(current, context, i)) {
                            break;
                        }
                    }
                    return current;
                }
            },
            config: { method: 'act' }
        };
    }

    /**
     * Serialize pipeline.
     * @param {string} name - Pipeline name
     */
    serialize(name) {
        const pipeline = this.pipelines.get(name);
        if (!pipeline) return null;
        
        return {
            name: pipeline.name,
            stages: pipeline.stages.map(s => ({
                id: s.id,
                component: s.component?.constructor?.name || 'unknown',
                config: s.config,
                parallel: s.parallel,
                condition: s.condition?.toString() || null,
                onError: s.onError,
                transform: s.transform?.toString() || null
            })),
            createdAt: pipeline.createdAt
        };
    }
}

/**
 * Pipeline builder for fluent API.
 */
export class PipelineBuilder {
    constructor(engine) {
        this.engine = engine;
        this.stages = [];
        this.name = null;
    }

    /**
     * Set pipeline name.
     */
    named(name) {
        this.name = name;
        return this;
    }

    /**
     * Add a stage.
     */
    add(component, config = {}) {
        this.stages.push({ component, config });
        return this;
    }

    /**
     * Add parallel stage.
     */
    parallel(components) {
        this.stages.push({ component: components, parallel: true });
        return this;
    }

    /**
     * Add conditional stage.
     */
    when(condition, component, config = {}) {
        this.stages.push({ component, config, condition });
        return this;
    }

    /**
     * Add transform stage.
     */
    transform(fn) {
        this.stages.push({ transform: fn });
        return this;
    }

    /**
     * Build and register the pipeline.
     */
    build() {
        if (!this.name) {
            throw new Error('Pipeline must have a name');
        }
        this.engine.createPipeline(this.name, this.stages);
        return this.engine;
    }

    /**
     * Execute immediately.
     */
    async run(input, context = {}) {
        const tempName = this.name || `temp_${Date.now()}`;
        this.engine.createPipeline(tempName, this.stages);
        const result = await this.engine.execute(tempName, input, context);
        this.engine.removePipeline(tempName);
        return result;
    }
}
