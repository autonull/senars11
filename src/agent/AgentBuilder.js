import {Agent} from './Agent.js';
import {PluginManager} from '../util/Plugin.js';
import {FunctorProvider} from './FunctorProvider.js';
import {LMProviderBuilder} from '../lm/LMProviderBuilder.js';

export class AgentBuilder {
    constructor(initialConfig = {}) {
        this.config = this.constructor.getDefaultConfig();
        this.dependencies = new Map();
        if (initialConfig) this.withConfig(initialConfig);
    }

    static getDefaultConfig() {
        return {
            subsystems: {
                metrics: true,
                embeddingLayer: false,
                functors: ['core-arithmetic', 'set-operations'],
                rules: ['syllogistic-core', 'temporal'],
                tools: false,
                lm: false,
            },
            memory: { enableMemoryValidation: true, memoryValidationInterval: 30000 },
            nar: {},
            lm: {
                circuitBreaker: { failureThreshold: 5, timeout: 60000, resetTimeout: 30000 },
            },
            persistence: {},
            inputProcessing: {}
        };
    }

    static createAgent(config = {}) {
        return new AgentBuilder(config).build();
    }

    static createBasicAgent() {
        return AgentBuilder.createAgent({
            subsystems: {
                metrics: true,
                embeddingLayer: false,
                functors: ['core-arithmetic'],
                rules: ['syllogistic-core'],
                tools: false,
                lm: false
            }
        });
    }

    static createAdvancedAgent(config = {}) {
        const advancedConfig = {
            subsystems: {
                metrics: true,
                embeddingLayer: true,
                functors: ['core-arithmetic', 'set-operations'],
                rules: ['syllogistic-core', 'temporal'],
                tools: true,
                lm: { enabled: true },
            },
        };
        return new AgentBuilder(advancedConfig).withConfig(config).build();
    }

    withConfig(config) {
        Object.assign(this.config, config);
        return this;
    }

    withSubsystem(name, config = true) {
        this.config.subsystems[name] = config;
        return this;
    }

    withMetrics(config = true) { return this.withSubsystem('metrics', config); }
    withEmbeddings(config = true) { return this.withSubsystem('embeddingLayer', config); }
    withFunctors(config) { return this.withSubsystem('functors', Array.isArray(config) ? config : config); }
    withRules(config) { return this.withSubsystem('rules', Array.isArray(config) ? config : config); }
    withTools(config = true) { return this.withSubsystem('tools', config); }
    withLM(config = true) { return this.withSubsystem('lm', config); }

    registerDependency(name, dependency) {
        this.dependencies.set(name, dependency);
        return this;
    }

    async build() {
        const agent = this._createAgent();
        this._setupPlugins(agent);
        FunctorProvider.registerFunctors(agent.evaluator?.getFunctorRegistry?.(), this.config.subsystems.functors);
        await this._initializeSubsystems(agent);
        this._setupLM(agent);
        return agent;
    }

    _createAgent() {
        return new Agent(this._buildAgentConfig());
    }

    _buildAgentConfig() {
        const { subsystems, nar, memory, persistence, inputProcessing, lm } = this.config;
        const { lm: lmSubsystem, tools, embeddingLayer, metrics } = subsystems;

        const getSubsystemConfig = (subsystem) => ({
            enabled: !!subsystem,
            ...(typeof subsystem === 'object' ? subsystem : {})
        });

        return {
            ...nar,
            memory,
            persistence,
            inputProcessing,
            lm: { ...getSubsystemConfig(lmSubsystem), ...lm },
            tools: getSubsystemConfig(tools),
            embeddingLayer: getSubsystemConfig(embeddingLayer),
            metricsMonitor: metrics ? (typeof metrics === 'object' ? metrics : {}) : undefined
        };
    }

    _setupPlugins(agent) {
        agent._pluginManager = new PluginManager({ nar: agent, agent: agent, eventBus: agent._eventBus });
        if (this.config.subsystems.plugins) {
            this._registerPlugins(agent._pluginManager, this.config.subsystems.plugins);
        }
    }

    _registerPlugins(pluginManager, pluginConfig) {
        const register = (config, id) => {
            if (config.instance) {
                pluginManager.registerPlugin(config.instance);
            } else if (config.constructor) {
                const pluginId = id ?? config.constructor.name.toLowerCase();
                pluginManager.registerPlugin(new config.constructor(pluginId, config.config ?? {}));
            }
        };

        if (Array.isArray(pluginConfig)) {
            pluginConfig.filter(Boolean).forEach(p => register(p, p.id));
        } else if (typeof pluginConfig === 'object') {
            Object.entries(pluginConfig)
                .filter(([, c]) => c?.enabled !== false)
                .forEach(([id, c]) => register(c, id));
        }
    }

    async _initializeSubsystems(agent) {
        await agent.initialize?.();
        if (agent._pluginManager) {
            try {
                if (await agent._pluginManager.initializeAll()) {
                    await agent._pluginManager.startAll();
                }
            } catch (e) {
                console.error('Failed to initialize or start plugins:', e);
            }
        }
    }

    _setupLM(agent) {
        const lmProvider = LMProviderBuilder.create(agent, this.config.lm);
        if (lmProvider) {
            agent.lm?.registerProvider(lmProvider.name, lmProvider);
            agent.lm?.providers.setDefault(lmProvider.name);
        }
    }
}
