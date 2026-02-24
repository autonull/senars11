/**
 * Enhanced Composable System
 * Expands component capabilities with advanced composition patterns
 */
import { Component } from './Component.js';
import { ComponentRegistry, globalRegistry } from './ComponentRegistry.js';
import { mergeConfig } from '../utils/ConfigHelper.js';
import { MetricsTracker } from '../utils/MetricsTracker.js';

const COMPOSABLE_DEFAULTS = {
    autoInitialize: true,
    trackMetrics: true,
    enableEvents: true,
    maxDepth: 10
};

/**
 * Enhanced Component with expanded capabilities
 */
export class EnhancedComponent extends Component {
    constructor(config = {}) {
        super(mergeConfig(COMPOSABLE_DEFAULTS, config));
        this._metricsTracker = this.config.trackMetrics ? new MetricsTracker() : null;
        this._middleware = [];
        this._validators = [];
    }

    get metrics() {
        return this._metricsTracker;
    }

    async initialize() {
        if (this.initialized) return;

        // Run validators
        for (const validator of this._validators) {
            const valid = await validator(this);
            if (!valid) {
                throw new Error(`Component validation failed: ${this.constructor.name}`);
            }
        }

        // Initialize children
        await Promise.all(Array.from(this.children.values()).map(child => child.initialize()));
        
        // Run middleware (before)
        for (const mw of this._middleware) {
            if (mw.beforeInitialize) {
                await mw.beforeInitialize(this);
            }
        }

        await this.onInitialize();
        this.initialized = true;
        
        // Run middleware (after)
        for (const mw of this._middleware) {
            if (mw.afterInitialize) {
                await mw.afterInitialize(this);
            }
        }

        this.emit('initialized', this);
    }

    async shutdown() {
        // Run middleware (before shutdown)
        for (const mw of this._middleware) {
            if (mw.beforeShutdown) {
                await mw.beforeShutdown(this);
            }
        }

        await Promise.all(Array.from(this.children.values()).map(child => child.shutdown()));
        await this.onShutdown();

        // Run middleware (after shutdown)
        for (const mw of this._middleware) {
            if (mw.afterShutdown) {
                await mw.afterShutdown(this);
            }
        }

        this._subscriptions.forEach(sub => this.unsubscribe(sub));
        this.initialized = false;
        this.emit('shutdown', this);
    }

    // Middleware support
    use(middleware) {
        this._middleware.push(middleware);
        return this;
    }

    // Validation support
    validate(fn) {
        this._validators.push(fn);
        return this;
    }

    // Enhanced method wrapping with metrics
    wrapMethod(methodName, fn) {
        const self = this;
        const original = this[methodName];

        this[methodName] = async function(...args) {
            const start = performance.now();
            
            if (self.metrics) {
                self.metrics.increment(`${methodName}_calls`);
            }

            try {
                // Run middleware (before)
                for (const mw of self._middleware) {
                    if (mw.beforeMethod) {
                        await mw.beforeMethod(methodName, args, self);
                    }
                }

                const result = await fn.apply(this, args);
                const duration = performance.now() - start;

                if (self.metrics) {
                    self.metrics.set(`${methodName}_last_duration`, duration);
                    self.metrics.increment(`${methodName}_total_duration`, duration);
                }

                // Run middleware (after)
                for (const mw of self._middleware) {
                    if (mw.afterMethod) {
                        await mw.afterMethod(methodName, result, self);
                    }
                }

                return result;
            } catch (e) {
                if (self.metrics) {
                    self.metrics.increment(`${methodName}_errors`);
                }
                self.emit('error', { method: methodName, error: e });
                throw e;
            }
        };

        return this;
    }

    // Enhanced state management with history
    setState(key, value, trackHistory = false) {
        const prev = this._state.get(key);
        this._state.set(key, value);

        if (trackHistory) {
            let history = this.getState(`${key}_history`) ?? [];
            history.push({ value, prev, timestamp: Date.now() });
            if (history.length > 100) history.shift();
            super.setState(`${key}_history`, history);
        }

        this.emit('stateChange', { key, value, prev });
        return this;
    }

    // Query state with path support
    getStatePath(path) {
        const parts = path.split('.');
        let current = this.getAllState();

        for (const part of parts) {
            if (current instanceof Map) {
                current = current.get(part);
            } else if (current && typeof current === 'object') {
                current = current[part];
            } else {
                return undefined;
            }
        }

        return current;
    }

    // Enhanced serialization with metadata
    serialize(includeMetadata = true) {
        const serialized = {
            type: this.constructor.name,
            config: this.config,
            state: Object.fromEntries(this._state),
            children: Array.from(this.children.entries()).map(([name, child]) => ({
                name,
                data: child.serialize(includeMetadata)
            }))
        };

        if (includeMetadata) {
            serialized.metadata = {
                initialized: this.initialized,
                childCount: this.children.size,
                serializedAt: Date.now()
            };

            if (this.metrics) {
                serialized.metrics = this.metrics.getAll();
            }
        }

        return serialized;
    }

    // Clone with deep copy of children
    cloneDeep(configOverrides = {}) {
        const serialized = this.serialize();
        const config = { ...serialized.config, ...configOverrides };
        const clone = new this.constructor(config);

        // Clone state
        this._state.forEach((value, key) => {
            clone.setState(key, JSON.parse(JSON.stringify(value)));
        });

        // Clone children
        this.children.forEach((child, name) => {
            const childClone = child.cloneDeep();
            clone.add(name, childClone);
        });

        return clone;
    }

    // Find component by predicate
    find(predicate) {
        if (predicate(this)) return this;

        for (const child of this.children.values()) {
            const found = child.find?.(predicate);
            if (found) return found;
        }

        return null;
    }

    // Find all components by predicate
    findAll(predicate) {
        const results = [];

        if (predicate(this)) {
            results.push(this);
        }

        for (const child of this.children.values()) {
            results.push(...(child.findAll?.(predicate) ?? []));
        }

        return results;
    }

    // Get all components by type
    findByType(type) {
        return this.findAll(c => c.constructor.name === type);
    }

    // Execute on all children (depth-first)
    forEach(fn, includeSelf = true) {
        if (includeSelf) fn(this);

        for (const child of this.children.values()) {
            child.forEach?.(fn, true);
        }

        return this;
    }

    // Map over all children
    map(fn, includeSelf = true) {
        const results = [];

        if (includeSelf) {
            results.push(fn(this));
        }

        for (const child of this.children.values()) {
            results.push(...(child.map?.(fn, true) ?? []));
        }

        return results;
    }
}

/**
 * Advanced Composition Engine with expanded patterns
 */
export class EnhancedCompositionEngine extends Component {
    constructor(config = {}) {
        super(mergeConfig(COMPOSABLE_DEFAULTS, config));
        this.pipelines = new Map();
        this.graphs = new Map();
        this.executing = new Set();
        this.registry = config.registry ?? globalRegistry;
    }

    // Pipeline creation with validation
    createPipeline(name, stages, options = {}) {
        const { validate = true, optimize = true } = options;

        const pipeline = {
            name,
            stages: stages.map((stage, idx) => this._normalizeStage(stage, idx)),
            createdAt: Date.now(),
            optimized: false
        };

        if (validate) {
            this._validatePipeline(pipeline);
        }

        if (optimize) {
            this._optimizePipeline(pipeline);
            pipeline.optimized = true;
        }

        this.pipelines.set(name, pipeline);
        return this;
    }

    _normalizeStage(stage, idx) {
        if (typeof stage === 'function') {
            return {
                id: `stage_${idx}`,
                component: { act: stage },
                config: {}
            };
        }

        return {
            id: stage.id || `stage_${idx}`,
            component: stage.component,
            config: stage.config || {},
            parallel: stage.parallel || false,
            condition: stage.condition || null,
            onError: stage.onError || 'stop',
            transform: stage.transform || null,
            retry: stage.retry || 0,
            timeout: stage.timeout || null
        };
    }

    _validatePipeline(pipeline) {
        // Check for circular dependencies
        const visited = new Set();
        const stack = new Set();

        const hasCycle = (stageId, dependencies) => {
            if (stack.has(stageId)) return true;
            if (visited.has(stageId)) return false;

            visited.add(stageId);
            stack.add(stageId);

            for (const dep of dependencies) {
                if (hasCycle(dep, dependencies)) return true;
            }

            stack.delete(stageId);
            return false;
        };

        // Validate each stage has required component
        for (const stage of pipeline.stages) {
            if (!stage.component) {
                throw new Error(`Stage ${stage.id} missing component`);
            }
        }
    }

    _optimizePipeline(pipeline) {
        // Merge consecutive stages with same config
        const optimized = [];
        let current = null;

        for (const stage of pipeline.stages) {
            if (!current) {
                current = { ...stage };
                continue;
            }

            if (current.config.mergeable && stage.config.mergeable) {
                // Merge stages
                current.merged = current.merged || [current];
                current.merged.push(stage);
            } else {
                optimized.push(current);
                current = stage;
            }
        }

        if (current) {
            optimized.push(current);
        }

        pipeline.stages = optimized;
    }

    // Execute pipeline with enhanced error handling
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
        const executionContext = { ...context, pipeline: name, startTime };

        try {
            const result = await this._executePipeline(pipeline, input, executionContext);
            const duration = performance.now() - startTime;

            this.emit('pipelineCompleted', { name, duration, ...result });
            return { success: true, duration, ...result };
        } catch (error) {
            const duration = performance.now() - startTime;
            this.emit('pipelineFailed', { name, duration, error: error.message });
            return { success: false, duration, error: error.message };
        } finally {
            this.executing.delete(name);
        }
    }

    async _executePipeline(pipeline, input, context) {
        let current = input;
        const results = [];

        for (const stage of pipeline.stages) {
            const stageResult = await this._executeStageWithRetry(stage, current, context);
            
            if (stageResult.success) {
                current = this._transformResult(stageResult.output, stage, current);
                results.push({ stage: stage.id, success: true, output: current });
            } else {
                results.push({ stage: stage.id, success: false, error: stageResult.error });

                if (stage.onError === 'stop') {
                    return { results, output: current, error: stageResult.error };
                } else if (stage.onError === 'skip') {
                    continue;
                } else if (stage.onError === 'default' && stage.defaultOutput !== undefined) {
                    current = stage.defaultOutput;
                }
            }
        }

        return { results, output: current };
    }

    async _executeStageWithRetry(stage, input, context, attempt = 0) {
        try {
            return await this._executeStage(stage, input, context);
        } catch (error) {
            if (attempt < stage.retry) {
                return this._executeStageWithRetry(stage, input, context, attempt + 1);
            }
            return { success: false, error: error.message };
        }
    }

    async _executeStage(stage, input, context) {
        // Check condition
        if (stage.condition && !(await this._evaluateCondition(stage.condition, input, context))) {
            return { success: true, output: input, skipped: true };
        }

        const component = stage.component;
        const method = stage.config.method ?? 'act';
        const timeout = stage.timeout ?? this.config.timeout;

        if (typeof component[method] !== 'function') {
            throw new Error(`Component method not found: ${method}`);
        }

        // Initialize if needed
        if (component.initialize && !component.initialized) {
            await component.initialize();
        }

        // Execute with timeout
        const promise = component[method].call(component, input, context);
        const output = await Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
            )
        ]);

        return { success: true, output };
    }

    _evaluateCondition(condition, input, context) {
        if (typeof condition === 'function') return condition(input, context);
        if (typeof condition === 'boolean') return condition;
        return true;
    }

    _transformResult(result, stage, previous) {
        if (stage.transform) {
            return stage.transform(result, previous);
        }
        return result;
    }

    // Graph-based composition
    createGraph(name, nodes, edges) {
        const graph = {
            name,
            nodes: new Map(nodes.map(n => [n.id, n])),
            edges: edges.map(e => ({
                from: e.from,
                to: e.to,
                condition: e.condition ?? null,
                transform: e.transform ?? null
            })),
            createdAt: Date.now()
        };

        this._validateGraph(graph);
        this.graphs.set(name, graph);
        return this;
    }

    _validateGraph(graph) {
        // Check all edges reference valid nodes
        for (const edge of graph.edges) {
            if (!graph.nodes.has(edge.from)) {
                throw new Error(`Edge references non-existent node: ${edge.from}`);
            }
            if (!graph.nodes.has(edge.to)) {
                throw new Error(`Edge references non-existent node: ${edge.to}`);
            }
        }
    }

    async executeGraph(name, input, context = {}) {
        const graph = this.graphs.get(name);
        if (!graph) {
            throw new Error(`Graph not found: ${name}`);
        }

        const results = new Map();
        const visited = new Set();
        const queue = [Array.from(graph.nodes.keys())[0]]; // Start from first node

        while (queue.length > 0) {
            const nodeId = queue.shift();
            if (visited.has(nodeId)) continue;

            const node = graph.nodes.get(nodeId);
            const nodeInput = nodeId === Array.from(graph.nodes.keys())[0] 
                ? input 
                : this._gatherNodeInputs(nodeId, graph, results);

            const nodeResult = await this._executeNode(node, nodeInput, context);
            results.set(nodeId, nodeResult);
            visited.add(nodeId);

            // Add successors to queue
            const successors = graph.edges
                .filter(e => e.from === nodeId)
                .map(e => e.to);
            
            queue.push(...successors);
        }

        return { results: Object.fromEntries(results), output: this._gatherGraphOutput(graph, results) };
    }

    _gatherNodeInputs(nodeId, graph, results) {
        const inputs = [];
        for (const edge of graph.edges) {
            if (edge.to === nodeId && results.has(edge.from)) {
                const sourceResult = results.get(edge.from);
                inputs.push(edge.transform ? edge.transform(sourceResult) : sourceResult);
            }
        }
        return inputs.length === 1 ? inputs[0] : inputs;
    }

    async _executeNode(node, input, context) {
        const component = node.component;
        const method = node.method ?? 'act';

        if (typeof component[method] !== 'function') {
            throw new Error(`Node method not found: ${method}`);
        }

        return component[method].call(component, input, context);
    }

    _gatherGraphOutput(graph, results) {
        // Find leaf nodes (nodes with no outgoing edges)
        const hasOutgoing = new Set(graph.edges.map(e => e.from));
        const leaves = Array.from(graph.nodes.keys()).filter(id => !hasOutgoing.has(id));
        
        if (leaves.length === 1) {
            return results.get(leaves[0]);
        }
        
        return Object.fromEntries(leaves.map(id => [id, results.get(id)]));
    }

    // Pipeline chaining
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

    // Conditional branching
    branch(condition, truePipeline, falsePipeline = null) {
        return {
            id: `branch_${Date.now()}`,
            type: 'branch',
            condition,
            truePipeline,
            falsePipeline,
            async act(input, context) {
                const shouldBranch = typeof condition === 'function' 
                    ? await condition(input, context) 
                    : condition;
                
                const pipeline = shouldBranch ? truePipeline : falsePipeline;
                if (!pipeline) return input;
                
                return pipeline.act ? pipeline.act(input, context) : input;
            }
        };
    }

    // Loop with termination condition
    loop(pipeline, until, maxIterations = 10) {
        return {
            id: `loop_${Date.now()}`,
            type: 'loop',
            pipeline,
            until,
            maxIterations,
            async act(input, context) {
                let current = input;
                
                for (let i = 0; i < maxIterations; i++) {
                    const result = pipeline.act 
                        ? await pipeline.act(current, context) 
                        : current;
                    
                    if (await until(result, context, i)) {
                        break;
                    }
                    
                    current = result;
                }
                
                return current;
            }
        };
    }

    // Parallel execution
    parallel(pipelines) {
        return {
            id: `parallel_${Date.now()}`,
            type: 'parallel',
            pipelines,
            async act(input, context) {
                const results = await Promise.allSettled(
                    pipelines.map(p => p.act ? p.act(input, context) : input)
                );
                
                return results.map((r, i) => ({
                    pipeline: i,
                    success: r.status === 'fulfilled',
                    result: r.status === 'fulfilled' ? r.value : null,
                    error: r.status === 'rejected' ? r.reason : null
                }));
            }
        };
    }

    // Get pipeline info
    getPipeline(name) {
        return this.pipelines.get(name);
    }

    listPipelines() {
        return Array.from(this.pipelines.entries()).map(([name, pipeline]) => ({
            name,
            stages: pipeline.stages.length,
            optimized: pipeline.optimized,
            createdAt: pipeline.createdAt
        }));
    }

    listGraphs() {
        return Array.from(this.graphs.entries()).map(([name, graph]) => ({
            name,
            nodes: graph.nodes.size,
            edges: graph.edges.length,
            createdAt: graph.createdAt
        }));
    }

    removePipeline(name) {
        return this.pipelines.delete(name);
    }

    removeGraph(name) {
        return this.graphs.delete(name);
    }

    // Export/Import
    export(name) {
        const pipeline = this.pipelines.get(name);
        if (!pipeline) return null;

        return JSON.stringify({
            name: pipeline.name,
            stages: pipeline.stages.map(s => ({
                id: s.id,
                component: s.component?.constructor?.name || 'unknown',
                config: s.config,
                parallel: s.parallel,
                retry: s.retry,
                timeout: s.timeout
            })),
            createdAt: pipeline.createdAt,
            optimized: pipeline.optimized
        });
    }

    import(jsonString) {
        const data = JSON.parse(jsonString);
        this.createPipeline(data.name, data.stages, { validate: false, optimize: false });
        return this;
    }
}

/**
 * Component composition utilities
 */
export const ComposableUtils = {
    compose(...components) {
        return {
            async act(input, context) {
                let current = input;
                for (const component of components) {
                    if (component.act) {
                        current = await component.act(current, context);
                    }
                }
                return current;
            }
        };
    },

    pipe(...fns) {
        return {
            async act(input, context) {
                return fns.reduce(async (acc, fn) => {
                    const result = await acc;
                    return typeof fn === 'function' ? fn(result, context) : result;
                }, Promise.resolve(input));
            }
        };
    },

    parallel(...components) {
        return {
            async act(input, context) {
                const results = await Promise.all(
                    components.map(c => c.act ? c.act(input, context) : input)
                );
                return results;
            }
        };
    },

    conditional(condition, trueComponent, falseComponent) {
        return {
            async act(input, context) {
                const shouldUseTrue = typeof condition === 'function'
                    ? await condition(input, context)
                    : condition;
                
                const component = shouldUseTrue ? trueComponent : falseComponent;
                return component?.act ? component.act(input, context) : input;
            }
        };
    },

    retry(component, attempts = 3) {
        return {
            async act(input, context) {
                let lastError;
                
                for (let i = 0; i < attempts; i++) {
                    try {
                        return await component.act(input, context);
                    } catch (error) {
                        lastError = error;
                    }
                }
                
                throw lastError;
            }
        };
    },

    timeout(component, ms) {
        return {
            async act(input, context) {
                return Promise.race([
                    component.act(input, context),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
                    )
                ]);
            }
        };
    }
};

export { EnhancedComponent as Component };
export { EnhancedCompositionEngine as CompositionEngine };
export { ComponentRegistry, globalRegistry } from './ComponentRegistry.js';
export { PipelineBuilder } from './CompositionEngine.js';
export { functionalComponent } from './Component.js';
