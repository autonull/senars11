import { mergeConfig } from '../utils/ConfigHelper.js';

const DEFAULTS = {
    parallel: true,
    timeout: 30000,
    retry: 0
};

const PipelineStrategies = {
    async executeSequential(stages, input, context, executor) {
        let current = input;
        const results = [];

        for (const stage of stages) {
            if (stage.condition && !await executor.evaluateCondition(stage.condition, current, context)) {
                results.push({ stage: stage.id, skipped: true });
                continue;
            }

            const result = await executor.executeStage(stage, current, context);
            current = executor.transformResult(result, stage, current);
            results.push({ stage: stage.id, result: current });
        }

        return { results, output: current };
    },

    async executeParallel(components, input, context, executor) {
        const results = await Promise.allSettled(
            components.map(comp => executor.executeComponent(comp, input, context, {}))
        );

        return results.map((result, idx) => ({
            index: idx,
            success: result.status === 'fulfilled',
            value: result.status === 'fulfilled' ? result.value : null,
            error: result.status === 'rejected' ? result.reason : null
        }));
    }
};

export class CompositionEngine {
    constructor(config = {}) {
        this.config = mergeConfig(DEFAULTS, config);
        this.pipelines = new Map();
        this.executing = new Set();
    }

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

    async execute(name, input, context = {}) {
        const pipeline = this.pipelines.get(name);
        if (!pipeline) {
            throw new Error(`Pipeline not found: ${name}`);
        }

        if (this.executing.has(name)) {
            throw new Error(`Pipeline already executing: ${name}`);
        }

        this.executing.add(name);
        const startTime = performance.now();

        try {
            const { results, output } = await PipelineStrategies.executeSequential(
                pipeline.stages, input, context, this
            );

            return {
                success: true,
                output,
                results,
                duration: performance.now() - startTime
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                results: [],
                duration: performance.now() - startTime
            };
        } finally {
            this.executing.delete(name);
        }
    }

    async executeStage(stage, input, context) {
        const component = stage.component;

        if (!component) {
            throw new Error(`Stage ${stage.id} has no component`);
        }

        if (stage.parallel && Array.isArray(component)) {
            return PipelineStrategies.executeParallel(component, input, context, this);
        }

        return this.executeComponent(component, input, context, stage.config);
    }

    async executeComponent(component, input, context, config) {
        if (component.initialize && !component.initialized) {
            await component.initialize();
        }

        const method = config.method || 'act';

        if (typeof component[method] !== 'function') {
            throw new Error(`Component does not have method: ${method}`);
        }

        const timeout = config.timeout || this.config.timeout;
        const promise = component[method].call(component, input, context);

        return Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
            )
        ]);
    }

    async evaluateCondition(condition, input, context) {
        if (typeof condition === 'function') return condition(input, context);
        if (typeof condition === 'boolean') return condition;
        return true;
    }

    transformResult(result, stage, previous) {
        return stage.transform?.(result, previous) ?? result;
    }

    getPipeline(name) {
        return this.pipelines.get(name);
    }

    listPipelines() {
        return Array.from(this.pipelines.entries()).map(([name, pipeline]) => ({
            name,
            stages: pipeline.stages.length,
            createdAt: pipeline.createdAt
        }));
    }

    removePipeline(name) {
        return this.pipelines.delete(name);
    }

    chain(name, pipelineNames) {
        const stages = pipelineNames.flatMap(pipelineName => {
            const pipeline = this.pipelines.get(pipelineName);
            if (!pipeline) {
                throw new Error(`Pipeline not found: ${pipelineName}`);
            }
            return pipeline.stages.map(s => ({ ...s, sourcePipeline: pipelineName }));
        });

        return this.createPipeline(name, stages);
    }

    branch(condition, trueStages, falseStages = []) {
        return [
            { id: 'branch_true', component: trueStages, condition, parallel: false },
            { id: 'branch_false', component: falseStages, condition: (input, ctx) => !condition(input, ctx), parallel: false }
        ];
    }

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

export class PipelineBuilder {
    constructor(engine) {
        this.engine = engine;
        this.stages = [];
        this.name = null;
    }

    named(name) {
        this.name = name;
        return this;
    }

    add(component, config = {}) {
        this.stages.push({ component, config });
        return this;
    }

    parallel(components) {
        this.stages.push({ component: components, parallel: true });
        return this;
    }

    when(condition, component, config = {}) {
        this.stages.push({ component, config, condition });
        return this;
    }

    transform(fn) {
        this.stages.push({ transform: fn });
        return this;
    }

    build() {
        if (!this.name) {
            throw new Error('Pipeline must have a name');
        }
        this.engine.createPipeline(this.name, this.stages);
        return this.engine;
    }

    async run(input, context = {}) {
        const tempName = this.name || `temp_${Date.now()}`;
        this.engine.createPipeline(tempName, this.stages);
        const result = await this.engine.execute(tempName, input, context);
        this.engine.removePipeline(tempName);
        return result;
    }
}
