const META_DEFAULTS = {
    metaLearningRate: 0.1,
    explorationRate: 0.3,
    modificationThreshold: 0.5,
    evaluationWindow: 100,
    populationSize: 10,
    elitismRate: 0.2,
    mutationRate: 0.3,
    crossoverRate: 0.5,
    useImagination: true,
    imaginationHorizon: 10,
    maxGenerations: 100,
    minImprovement: 0.01,
    patience: 10
};

const DEFAULT_OPERATORS = [
    {type: 'add', parameters: {stage: 'perception', componentId: 'attention'}},
    {type: 'add', parameters: {stage: 'reasoning', componentId: 'causal_reasoner'}},
    {type: 'modify', parameters: {componentId: 'policy', config: {learningRate: 0.001}}},
    {type: 'modify', parameters: {componentId: 'policy', config: {learningRate: 0.01}}},
    {type: 'modify', parameters: {componentId: 'policy', config: {hiddenDim: 128}}},
    {type: 'connect', parameters: {fromId: 'perception', toId: 'reasoning'}}
];

const TypeMultipliers = {add: 1.2, remove: 0.8, modify: 1.0, replace: 1.1};

export class ModificationOperator {
    constructor(config = {}) {
        Object.assign(this, {
            type: 'unknown', target: null, parameters: {}, priority: 1.0,
            expectedImprovement: 0, applied: false, successful: null, ...config
        });
    }

    static fromJSON(json) {
        return new ModificationOperator(json);
    }

    static add(componentId, stage, config = {}) {
        return new ModificationOperator({type: 'add', parameters: {componentId, stage, config}});
    }

    static remove(componentId) {
        return new ModificationOperator({type: 'remove', parameters: {componentId}});
    }

    static modify(componentId, config) {
        return new ModificationOperator({type: 'modify', parameters: {componentId, config}});
    }

    static replace(oldId, newId, config = {}) {
        return new ModificationOperator({
            type: 'replace',
            parameters: {oldComponentId: oldId, newComponentId: newId, config}
        });
    }

    static connect(fromId, toId) {
        return new ModificationOperator({type: 'connect', parameters: {fromId, toId}});
    }

    async apply(architecture, context = {}) {
        const executor = ModificationExecutor[this.type];
        return executor
            ? executor(architecture, this.parameters, context)
            : {success: false, error: `Unknown type: ${this.type}`};
    }

    toJSON() {
        return {...this, parameters: {...this.parameters}};
    }
}

const ModificationExecutor = {
    async add(architecture, {componentId, stage, position, config}) {
        const {ComponentRegistry} = await import('../composable/ComponentRegistry.js');
        const registry = ComponentRegistry.getInstance?.() ?? new ComponentRegistry();
        const component = registry.create(componentId, config ?? {});

        if (stage && architecture.addToStage) {
            architecture.addToStage(stage, component, position);
        } else if (architecture.addComponent) {
            architecture.addComponent(component);
        } else if (architecture.add) {
            architecture.add(componentId, component);
        }

        return {success: true, component};
    },

    async remove(architecture, {componentId}) {
        let component;
        if (architecture.removeComponent) {
            component = architecture.removeComponent(componentId);
        } else if (architecture.remove) {
            component = architecture.get(componentId);
            architecture.remove(componentId);
        } else {
            return {success: false, error: 'Architecture does not support removal'};
        }

        if (component && component.shutdown) {
            await component.shutdown();
        }
        return {success: true, component};
    },

    async replace(architecture, {oldComponentId, newComponentId, config}) {
        const {ComponentRegistry} = await import('../composable/ComponentRegistry.js');
        const registry = ComponentRegistry.getInstance?.() ?? new ComponentRegistry();
        const newComponent = registry.create(newComponentId, config ?? {});

        let result;
        if (architecture.replaceComponent) {
            result = architecture.replaceComponent(oldComponentId, newComponent);
        } else {
            await this.remove(architecture, {componentId: oldComponentId});
            result = await this.add(architecture, {componentId: newComponentId, component: newComponent});
        }

        return result.success ? {success: true, oldComponent: result.old, newComponent} : result;
    },

    async modify(architecture, {componentId, config, method, args}) {
        const component = architecture.getComponent?.(componentId) ?? architecture.get?.(componentId);
        if (!component) {
            return {success: false, error: 'Component not found'};
        }

        if (config) {
            Object.assign(component.config, config);
        }
        if (method && typeof component[method] === 'function') {
            const result = await component[method](...(args ?? []));
            return {success: true, result};
        }

        return {success: true, component};
    },

    async connect(architecture, {fromId, fromOutput, toId, toInput}) {
        if (architecture.connect) {
            architecture.connect(fromId, fromOutput ?? 'output', toId, toInput ?? 'input');
        }
        return {success: true};
    },

    async disconnect(architecture, {fromId, toId}) {
        if (architecture.disconnect) {
            architecture.disconnect(fromId, toId);
        }
        return {success: true};
    }
};

export {META_DEFAULTS, DEFAULT_OPERATORS, TypeMultipliers, ModificationExecutor};
