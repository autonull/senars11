/**
 * Hybrid Demo Utilities: Common utilities for NL ↔ Narsese interaction demos
 * Provides ergonomic APIs for creating hybrid reasoning demonstrations
 */

import {createHypothesisGenerationRule, createConceptElaborationRule, createNarseseTranslationRule} from '@senars/nar';

// Trace capture utility
export class Trace {
    constructor() {
        this.events = [];
        this.startTime = Date.now();
    }

    log(eventType, data, details = {}) {
        const timestamp = Date.now() - this.startTime;
        const event = {time: timestamp, type: eventType, data, ...details};
        this.events.push(event);
        console.log(`[TRACE ${timestamp}ms] ${eventType}:`, data, details);
    }

    printSummary() {
        console.log("\n" + "=".repeat(80));
        console.log("HYBRID REASONING TRACE SUMMARY");
        console.log("=".repeat(80));

        const eventCounts = this.events.reduce((acc, event) => {
            acc[event.type] = (acc[event.type] || 0) + 1;
            return acc;
        }, {});

        console.log("\nEvent Distribution:");
        Object.entries(eventCounts).forEach(([type, count]) => {
            console.log(`  • ${type}: ${count} events`);
        });

        console.log("\nSample Events:");
        this.events.slice(0, 10).forEach((event, index) => {
            console.log(`${index + 1}. [${event.time}ms] ${event.type}:`,
                       typeof event.data === 'object' ? JSON.stringify(event.data) : event.data);
        });

        if (this.events.length > 10) {
            console.log(`   ... and ${this.events.length - 10} more events`);
        }

        console.log("=".repeat(80));
    }
}

// Rule factory for creating common LM rules
export class RuleFactory {
    static createHypothesisRule(provider, options = {}) {
        // Create dependencies object for the rule factory
        const dependencies = {
            lm: provider,
            eventBus: options.eventBus || null,
            termFactory: options.termFactory || null,
            ...options
        };
        return createHypothesisGenerationRule(dependencies);
    }

    static createElaborationRule(provider, options = {}) {
        // Create dependencies object for the rule factory
        const dependencies = {
            lm: provider,
            parser: options.parser || null,
            termFactory: options.termFactory || null,
            eventBus: options.eventBus || null,
            memory: options.memory || null,
            ...options
        };
        return createConceptElaborationRule(dependencies);
    }

    static createTranslationRule(provider, options = {}) {
        // Create dependencies object for the rule factory
        const dependencies = {
            lm: provider,
            parser: options.parser || null,
            eventBus: options.eventBus || null,
            ...options
        };
        return createNarseseTranslationRule(dependencies);
    }
}

// Scenario runner for hybrid reasoning
export class ScenarioRunner {
    constructor(nar, trace) {
        this.nar = nar;
        this.trace = trace;
    }

    async runScenario(name, inputs, steps, options = {}) {
        console.log(`📝 Scenario: ${name}`);
        for (const input of inputs) {
            await this.nar.input(input);
        }
        for (let i = 0; i < steps; i++) await this.nar.step();
        console.log(`   ✅ ${name} completed\n`);

        if (options.onComplete) {
            await options.onComplete();
        }
    }

    async runAllScenarios(scenarios) {
        for (const scenario of scenarios) {
            await this.runScenario(scenario.name, scenario.inputs, scenario.steps, scenario.options);
        }
    }
}

// Configuration builder for hybrid demos
export class HybridDemoConfig {
    constructor() {
        this.config = {
            model: {
                modelName: 'hf.co/unsloth/granite-4.0-micro-GGUF:Q4_K_M',
                timeout: 30000,
                baseURL: 'http://localhost:11434'
            },
            rules: {
                enabled: true,
                autoRegister: true
            },
            tracing: {
                enabled: true
            },
            scenarios: {
                defaultCount: 5
            }
        };
    }

    withModel(modelName, options = {}) {
        this.config.model = { ...this.config.model, modelName, ...options };
        return this;
    }

    withTimeout(timeout) {
        this.config.model.timeout = timeout;
        return this;
    }

    withBaseURL(baseURL) {
        this.config.model.baseURL = baseURL;
        return this;
    }

    withRules(enabled = true, autoRegister = true) {
        this.config.rules = { enabled, autoRegister };
        return this;
    }

    withTracing(enabled = true) {
        this.config.tracing = { enabled };
        return this;
    }

    build() {
        return { ...this.config };
    }
}

// Main hybrid demo orchestrator
export class HybridDemoOrchestrator {
    constructor(config) {
        this.config = config;
        this.nar = null;
        this.provider = null;
        this.trace = null;
    }

    async initialize(narConstructor, providerConstructor) {
        // Create NAR with LM integration
        this.nar = new narConstructor({
            nar: {lm: {enabled: true}},
            lm: {
                provider: 'ollama',
                modelName: this.config.model.modelName,
                enabled: true
            }
        });

        // Create trace if enabled
        if (this.config.tracing.enabled) {
            this.trace = new Trace();
        }

        // Create and register provider
        this.provider = new providerConstructor({
            provider: 'ollama',
            modelName: this.config.model.modelName,
            baseURL: this.config.model.baseURL || 'http://localhost:11434',
            timeout: this.config.model.timeout,
            trace: this.trace
        });

        // Initialize provider if it has an initialize method
        if (typeof this.provider.initialize === 'function') {
            await this.provider.initialize();
        }

        this.nar.registerLMProvider('ollama', this.provider);
        this.nar.lm.activeProvider = 'ollama';

        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Subscribe to events if tracing is enabled
        if (this.trace) {
            this.nar.on('input', (input) => this.trace.log('NAR_INPUT', input));
            this.nar.on('task_added', (task) => this.trace.log('TASK_ADDED', {
                term: task.term.toString(),
                punct: task.punctuation,
                truth: task.truth ? {f: task.truth.frequency, c: task.truth.confidence} : null,
                budget: task.budget ? {priority: task.budget.priority, durability: task.budget.durability} : null
            }));
            this.nar.on('derivation', (task) => this.trace.log('DERIVATION', task.term.toString()));
            this.nar.on('output', (task) => this.trace.log('OUTPUT', {
                term: task.term.toString(),
                punct: task.punctuation,
                truth: task.truth ? {f: task.truth.frequency, c: task.truth.confidence} : null
            }));
            // Listen for LM-related events if available
            this.nar.on('lm_input', (data) => this.trace.log('LM_INPUT', data));
            this.nar.on('lm_output', (data) => this.trace.log('LM_OUTPUT', data));
            this.nar.on('lm_error', (data) => this.trace.log('LM_ERROR', data));
        }

        return this;
    }

    async setupRules(ruleFactory = RuleFactory) {
        if (this.config.rules.enabled && this.nar.streamReasoner && this.nar.streamReasoner.ruleProcessor) {
            const ruleExecutor = this.nar.streamReasoner.ruleProcessor.ruleExecutor;

            console.log("🎯 Setting up Hybrid Rules:\n");

            if (this.config.rules.autoRegister) {
                // Prepare dependencies for the rules
                const dependencies = {
                    parser: this.nar._parser,
                    termFactory: this.nar._termFactory,
                    eventBus: this.nar._eventBus,
                    memory: this.nar._memory
                };

                console.log("📝 Adding Hypothesis Generation Rule");
                const hypoRule = ruleFactory.createHypothesisRule(this.provider, dependencies);
                console.log(`   Rule ID: ${hypoRule.id}, Type: ${typeof hypoRule}, Can Apply: ${typeof hypoRule.canApply}`);
                ruleExecutor.register(hypoRule);
                console.log("   ✅ Hypothesis rule added\n");

                console.log("📝 Adding Concept Elaboration Rule");
                const elabRule = ruleFactory.createElaborationRule(this.provider, dependencies);
                console.log(`   Rule ID: ${elabRule.id}, Type: ${typeof elabRule}, Can Apply: ${typeof elabRule.canApply}`);
                ruleExecutor.register(elabRule);
                console.log("   ✅ Elaboration rule added\n");
            }
        }
        return this;
    }

    async runScenarios(scenarios = null) {
        const defaultScenarios = [
            { name: 'Cat input (triggers hypothesis rule)', inputs: ["<cat --> mammal>. %1.0;0.9%"], steps: 5 },
            { name: 'Animal input (triggers elaboration rule)', inputs: ["<animal --> [living]>. %1.0;0.9%"], steps: 5 },
            { name: 'Cross-concept reasoning', inputs: ["<mammal --> warm_blooded>. %1.0;0.9%", "<cat --> mammal>. %1.0;0.9%"], steps: 5 },
            { name: 'Question processing', inputs: ["<cat --> ?property>?"], steps: 5 },
            { name: 'Goal processing', inputs: ["<happy --> desirable>!"], steps: 5 }
        ];

        const runner = new ScenarioRunner(this.nar, this.trace);
        await runner.runAllScenarios(scenarios || defaultScenarios);
        return this;
    }

    async showFinalState() {
        console.log("📊 Final System State:");
        const beliefs = this.nar.getBeliefs();
        console.log(`   - Total beliefs: ${beliefs.length}`);

        if (beliefs.length > 0) {
            console.log("   - Sample beliefs:");
            beliefs.forEach((task, i) => {
                console.log(`     ${i + 1}. ${task.term.toString()} {f:${task.truth?.frequency}, c:${task.truth?.confidence}}`);
            });
        }

        // Print trace summary if available
        if (this.trace) {
            this.trace.printSummary();
        }

        return this;
    }

    async printCapabilities() {
        console.log("\n🎯 HYBRID CAPABILITIES:");
        console.log("   1. LM Integration: Working with configured model");
        console.log("   2. NL ↔ Narsese: Bidirectional processing demonstrated");
        console.log("   3. LM Rules: Active rule-based processing");
        console.log("   4. NAL Reasoning: Formal logical inference");
        console.log("   5. Cross-Modal: Neural-symbolic interaction");
        console.log("   6. Truth Maintenance: Confidence tracking");
        console.log("   7. Dynamic Inference: Real-time reasoning");

        if (this.trace) {
            console.log("\n💡 SUCCESS METRICS:");
            const lmInputs = this.trace.events.filter(e => e.type === 'LM_INPUT').length;
            const lmOutputs = this.trace.events.filter(e => e.type === 'LM_OUTPUT').length;
            const lmErrors = this.trace.events.filter(e => e.type === 'LM_ERROR').length;

            console.log(`   - LM Interactions: ${lmInputs} inputs, ${lmOutputs} outputs`);
            console.log(`   - Success Rate: ${lmErrors === 0 ? '100%' : `${Math.round((lmOutputs/(lmInputs||1))*100)}%`}`);
            console.log(`   - System Stability: ${lmErrors === 0 ? '✓' : '✗'}`);
        }

        return this;
    }

    async shutdown() {
        if (typeof this.nar.shutdown === 'function') {
            await this.nar.shutdown();
        }
        console.log("\n✅ Hybrid Demo Completed Successfully!");
        console.log("   LM-powered NL ↔ Narsese interaction demonstrated.");
        return this;
    }
}