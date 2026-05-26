#!/usr/bin/env node

/**
 * ruminate.js - SeNARS Reasoning Trace Tool
 * Provides a transparent view into the SeNARS reasoning process
 *
 * Usage: node examples/ruminate.js [options]
 *
 * Examples:
 *   node examples/ruminate.js "Birds can fly" "Animals are living things"
 *   node examples/ruminate.js --model ollama --provider granite --time 10000 --events all
 *   node examples/ruminate.js --inputs "cat is an animal" "animals are mammals" --time 5000
 */

import {
    NAR,
    LangChainProvider,
    TransformersJSProvider,
    createHypothesisGenerationRule,
    createConceptElaborationRule,
    createNarseseTranslationRule
} from '@senars/nar';

// ANSI color codes for formatting
const COLORS = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    underscore: '\x1b[4m',
    blink: '\x1b[5m',
    reverse: '\x1b[7m',
    hidden: '\x1b[8m'
};

// Event type color mapping and emojis
const EVENT_CONFIG = {
    'NAR_INPUT': {color: COLORS.cyan, emoji: '📥', name: 'NAR IN'},
    'TASK_ADDED': {color: COLORS.blue, emoji: '📋', name: 'TASK ADDED'},
    'DERIVATION': {color: COLORS.magenta, emoji: '🧠', name: 'DERIVATION'},
    'OUTPUT': {color: COLORS.green, emoji: '📤', name: 'OUTPUT'},
    'LM_INPUT': {color: COLORS.yellow, emoji: '💭', name: 'LM IN'},
    'LM_OUTPUT': {color: COLORS.bright + COLORS.yellow, emoji: '💬', name: 'LM OUT'},
    'LM_ERROR': {color: COLORS.red, emoji: '❌', name: 'LM ERROR'},
    'ERROR': {color: COLORS.red, emoji: '💥', name: 'ERROR'},
    'INFO': {color: COLORS.white, emoji: 'ℹ️', name: 'INFO'},
    'DEBUG': {color: COLORS.dim + COLORS.white, emoji: '🔍', name: 'DEBUG'}
};

class ReasoningTrace {
    constructor(options = {}) {
        this.events = [];
        this.startTime = Date.now();
        this.options = {
            logEvents: options.events || ['NAR_INPUT', 'OUTPUT', 'LM_INPUT', 'LM_OUTPUT', 'DERIVATION'],
            colorize: options.colorize !== false,
            maxEvents: options.maxEvents || 1000,
            truncateLM: options.truncateLM !== false, // Whether to truncate long LM outputs
            truncateLength: options.truncateLength || 200, // Length to truncate LM outputs
            ...options
        };
    }

    log(eventType, data, details = {}) {
        const timestamp = Date.now() - this.startTime;
        const event = {
            time: timestamp,
            type: eventType,
            data,
            ...details,
            timestamp: new Date().toISOString()
        };

        this.events.push(event);

        if (this._shouldLogEvent(eventType)) {
            this._printEvent(event);
        }

        // Limit memory usage
        if (this.events.length > this.options.maxEvents) {
            this.events.shift();
        }
    }

    _shouldLogEvent(eventType) {
        if (this.options.logEvents === 'all') return true;
        if (Array.isArray(this.options.logEvents)) {
            return this.options.logEvents.includes(eventType) ||
                this.options.logEvents.includes('all');
        }
        return true;
    }

    _printEvent(event) {
        const config = EVENT_CONFIG[event.type] || {color: COLORS.white, emoji: '🔹', name: event.type};
        const color = config.color;
        const emoji = config.emoji;
        const reset = this.options.colorize ? COLORS.reset : '';

        // Truncate long LM outputs if requested
        let displayData = event.data;
        if ((event.type === 'LM_OUTPUT' || event.type === 'LM_INPUT') && this.options.truncateLM) {
            if (typeof displayData === 'string' && displayData.length > this.options.truncateLength) {
                displayData = displayData.substring(0, this.options.truncateLength) + `${this.options.colorize ? COLORS.dim : ''}...${reset}`;
            }
        }

        let output = `[${this.options.colorize ? color : ''}${emoji} ${event.time}ms${reset}] `;
        output += `${this.options.colorize ? color : ''}${config.name}${reset}: `;

        if (typeof displayData === 'string') {
            output += displayData;
        } else if (typeof displayData === 'object') {
            output += JSON.stringify(displayData, null, 2);
        } else {
            output += String(displayData);
        }

        if (Object.keys(event).length > 4) { // More than time, type, data, timestamp
            const extra = {...event};
            delete extra.time;
            delete extra.type;
            delete extra.data;
            delete extra.timestamp;
            if (Object.keys(extra).length > 0) {
                output += ` | ${JSON.stringify(extra)}`;
            }
        }

        console.log(output);
    }

    getEvents() {
        return this.events;
    }

    printSummary() {
        console.log(`\n${COLORS.bright}${COLORS.underscore}=== REASONING TRACE SUMMARY ===${COLORS.reset}`);
        console.log(`📊 Total events: ${this.events.length}`);
        console.log(`⏱️  Duration: ${this.events.length > 0 ? this.events[this.events.length - 1].time : 0}ms`);

        const eventCounts = this.events.reduce((acc, event) => {
            acc[event.type] = (acc[event.type] || 0) + 1;
            return acc;
        }, {});

        console.log(`\n${COLORS.bright}📈 Event Distribution:${COLORS.reset}`);
        Object.entries(eventCounts).forEach(([type, count]) => {
            const config = EVENT_CONFIG[type] || {color: COLORS.white, emoji: '🔹', name: type};
            console.log(`  ${this.options.colorize ? config.color : ''}${config.emoji} ${config.name}${COLORS.reset}: ${count}`);
        });
    }
}

class OllamaProvider extends LangChainProvider {
    constructor(config = {}) {
        super(config);
        this.trace = config.trace || null;
    }

    async generateText(prompt, options = {}) {
        // Log LM input if trace is available
        if (this.trace) {
            this.trace.log('LM_INPUT', prompt, {model: this.modelName, options});
        }

        const startTime = Date.now();
        try {
            const result = await super.generateText(prompt, options);
            const duration = Date.now() - startTime;

            // Log LM output if trace is available
            if (this.trace) {
                this.trace.log('LM_OUTPUT', result, {duration_ms: duration, model: this.modelName});
            }

            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`[OLLAMA ERROR] ${error.message} after ${duration}ms`);

            // Log LM error if trace is available
            if (this.trace) {
                this.trace.log('LM_ERROR', error.message, {duration_ms: duration, model: this.modelName});
            }
            throw error;
        }
    }
}

class Ruminator {
    constructor(options = {}) {
        this.options = {
            provider: options.provider || 'ollama',
            model: options.model || 'hf.co/unsloth/granite-4.0-micro-GGUF:Q4_K_M',
            timeLimit: options.time || 10000, // 10 seconds default
            inputs: options.inputs || [],
            events: options.events || ['NAR_INPUT', 'OUTPUT', 'LM_INPUT', 'LM_OUTPUT', 'DERIVATION'],
            colorize: options.colorize !== false,
            baseURL: options.baseURL || 'http://localhost:11434',
            ...options
        };

        this.nar = null;
        this.provider = null;
        this.trace = null;
        this.isRunning = false;
    }

    async initialize() {
        console.log(`${COLORS.cyan}🧠 Initializing SeNARS Ruminator...${COLORS.reset}`);

        // Create NAR with LM integration
        this.nar = new NAR({
            nar: {lm: {enabled: true}},
            lm: {
                provider: this.options.provider,
                modelName: this.options.model,
                enabled: true
            }
        });

        // Create trace for logging
        this.trace = new ReasoningTrace({
            logEvents: this.options.events,
            colorize: this.options.colorize,
            maxEvents: this.options.maxEvents || 1000
        });

        // Create and register provider based on type
        let ProviderClass;
        if (this.options.provider === 'ollama') {
            ProviderClass = OllamaProvider;  // Use our custom provider
        } else {
            ProviderClass = TransformersJSProvider;
        }

        this.provider = new ProviderClass({
            provider: this.options.provider,
            modelName: this.options.model,
            baseURL: this.options.baseURL,
            timeout: this.options.timeout || 30000,
            trace: this.trace
        });

        try {
            if (typeof this.provider.initialize === 'function') {
                await this.provider.initialize();
            }
            console.log(`${COLORS.green}✅ Provider initialized: ${this.options.model}${COLORS.reset}`);
        } catch (error) {
            console.log(`${COLORS.red}❌ Provider initialization failed: ${error.message}${COLORS.reset}`);
            throw error; // Don't continue if provider fails
        }

        this.nar.registerLMProvider(this.options.provider, this.provider);
        this.nar.lm.activeProvider = this.options.provider;

        // Subscribe to NAR events
        this.nar.on('input', (input) => this.trace.log('NAR_INPUT', input));
        this.nar.on('task_added', (task) => this.trace.log('TASK_ADDED', {
            term: task.term.toString(),
            punct: task.punctuation,
            truth: task.truth ? {f: task.truth.frequency, c: task.truth.confidence} : null,
            budget: task.budget ? {priority: task.budget.priority} : null
        }));
        this.nar.on('derivation', (task) => this.trace.log('DERIVATION', task.term.toString()));
        this.nar.on('output', (task) => this.trace.log('OUTPUT', {
            term: task.term.toString(),
            punct: task.punctuation,
            truth: task.truth ? {f: task.truth.frequency, c: task.truth.confidence} : null
        }));

        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Register LM rules for hybrid reasoning
        await this._setupRules();

        console.log(`${COLORS.green}✅ Ruminator ready!${COLORS.reset}`);
    }

    async _setupRules() {
        if (this.nar.streamReasoner && this.nar.streamReasoner.ruleProcessor) {
            const ruleExecutor = this.nar.streamReasoner.ruleProcessor.ruleExecutor;

            const dependencies = {
                lm: this.provider,
                parser: this.nar._parser,
                termFactory: this.nar._termFactory,
                eventBus: this.nar._eventBus,
                memory: this.nar._memory
            };

            // Register hybrid reasoning rules
            ruleExecutor.register(createHypothesisGenerationRule(dependencies));
            ruleExecutor.register(createConceptElaborationRule(dependencies));
            ruleExecutor.register(createNarseseTranslationRule(dependencies));

            console.log(`${COLORS.green}✅ Hybrid reasoning rules registered${COLORS.reset}`);
        }
    }

    async ruminate(inputs = null) {
        const inputList = inputs || this.options.inputs;

        if (!inputList || inputList.length === 0) {
            console.log(`${COLORS.yellow}⚠️  No inputs provided. Use --inputs or pass inputs as arguments.${COLORS.reset}`);
            return;
        }

        console.log(`\n${COLORS.bright}💭 Starting rumination with ${inputList.length} inputs...${COLORS.reset}`);
        console.log(`${COLORS.dim}⏰ Time limit: ${this.options.timeLimit}ms${COLORS.reset}`);

        this.isRunning = true;
        const startTime = Date.now();

        // Process each input
        for (const input of inputList) {
            if (Date.now() - startTime > this.options.timeLimit) {
                console.log(`${COLORS.yellow}⏰ Time limit reached before processing all inputs${COLORS.reset}`);
                break;
            }

            console.log(`\n${COLORS.cyan}📥 Processing input: ${input}${COLORS.reset}`);

            try {
                // Try to process as Narsese first, then as natural language
                let processedInput = input.trim();

                // If it doesn't look like Narsese, wrap it as a natural language statement
                if (!processedInput.includes('<') && !processedInput.includes('(')) {
                    processedInput = `"${processedInput}"`; // Wrap as natural language
                }

                await this.nar.input(processedInput);

                // Run reasoning cycles
                const reasoningCycles = 5; // Run a few cycles per input
                for (let i = 0; i < reasoningCycles && this.isRunning; i++) {
                    if (Date.now() - startTime > this.options.timeLimit) {
                        console.log(`${COLORS.yellow}⏰ Time limit reached during reasoning cycles${COLORS.reset}`);
                        break;
                    }

                    await this.nar.step();

                    // Small delay to allow LM processing
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (error) {
                this.trace.log('ERROR', `Failed to process input "${input}": ${error.message}`);
                console.log(`${COLORS.red}❌ Error processing input "${input}": ${error.message}${COLORS.reset}`);
            }
        }

        // Continue reasoning for remaining time
        const remainingTime = this.options.timeLimit - (Date.now() - startTime);
        if (remainingTime > 0) {
            console.log(`${COLORS.dim}⏳ Continuing reasoning for ${remainingTime}ms...${COLORS.reset}`);
            const reasoningEndTime = startTime + this.options.timeLimit;

            while (Date.now() < reasoningEndTime && this.isRunning) {
                await this.nar.step();

                // Check time more frequently
                if (Date.now() >= reasoningEndTime) {
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
            }
        }

        console.log(`\n${COLORS.bright}🏁 Rumination completed!${COLORS.reset}`);
        this.trace.printSummary();
    }

    async shutdown() {
        this.isRunning = false;

        // Try to shutdown NAR if available
        if (this.nar && typeof this.nar.shutdown === 'function') {
            try {
                await this.nar.shutdown();
            } catch (error) {
                console.log(`${COLORS.yellow}⚠️  NAR shutdown error (may be expected): ${error.message}${COLORS.reset}`);
            }
        }

        // Try to shutdown provider if available
        if (this.provider && typeof this.provider.destroy === 'function') {
            try {
                await this.provider.destroy();
            } catch (error) {
                console.log(`${COLORS.yellow}⚠️  Provider destroy error: ${error.message}${COLORS.reset}`);
            }
        }

        console.log(`${COLORS.green}✅ Ruminator shutdown complete${COLORS.reset}`);

        // Force exit to prevent hanging
        process.exit(0);
    }

    getBeliefs() {
        return this.nar ? this.nar.getBeliefs() : [];
    }

    getTrace() {
        return this.trace ? this.trace.getEvents() : [];
    }
}

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {};
    const inputs = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const nextArg = args[i + 1];

            if (nextArg && !nextArg.startsWith('--')) {
                options[key] = nextArg;
                i++; // Skip next argument as it's a value
            } else {
                options[key] = true;
            }
        } else {
            inputs.push(arg);
        }
    }

    // Convert string boolean options
    if (options.colorize === 'false') options.colorize = false;
    if (options.colorize === 'true') options.colorize = true;
    if (options.truncateLM === 'false') options.truncateLM = false;
    if (options.truncateLM === 'true') options.truncateLM = true;

    // Parse time limit
    if (options.time) {
        options.time = parseInt(options.time);
    }

    // Parse truncate length
    if (options.truncateLength) {
        options.truncateLength = parseInt(options.truncateLength);
    }

    // Parse events
    if (options.events) {
        options.events = options.events === 'all' ? 'all' : options.events.split(',');
    }

    // Parse inputs
    if (options.inputs) {
        options.inputs = options.inputs.split(',');
    }

    return {
        options,
        inputs: inputs.length > 0 ? inputs : (options.inputs || [])
    };
}

// Display help
function showHelp() {
    console.log(`
${COLORS.bright}🧠 SeNARS Ruminator - Reasoning Trace Tool${COLORS.reset}

${COLORS.underscore}Usage:${COLORS.reset}
  node examples/ruminate.js [options] [inputs...]

${COLORS.underscore}Options:${COLORS.reset}
  --provider      LM provider (ollama, transformers) [default: ollama]
  --model         Model name [default: hf.co/unsloth/granite-4.0-micro-GGUF:Q4_K_M]
  --time          Time limit in ms [default: 10000]
  --events        Events to log (comma-separated or 'all') [default: NAR_INPUT,OUTPUT,LM_INPUT,LM_OUTPUT,DERIVATION]
  --colorize      Enable/disable colors (true/false) [default: true]
  --truncateLM    Truncate long LM inputs/outputs (true/false) [default: true]
  --truncateLength Maximum length for LM text before truncation [default: 200]
  --baseURL       Ollama base URL [default: http://localhost:11434]
  --help          Show this help message

${COLORS.underscore}Examples:${COLORS.reset}
  ${COLORS.dim}# Basic rumination${COLORS.reset}
  node examples/ruminate.js "Birds can fly" "Animals are living things"

  ${COLORS.dim}# With custom options${COLORS.reset}
  node examples/ruminate.js --model granite --time 5000 --events all "Cat is an animal"

  ${COLORS.dim}# All events, longer time, no truncation${COLORS.reset}
  node examples/ruminate.js --events all --time 15000 --truncateLM false "Dogs are loyal" "Cats are independent"

  ${COLORS.dim}# Quick rumination with minimal output${COLORS.reset}
  node examples/ruminate.js --time 2000 --events NAR_INPUT,OUTPUT "The sky is blue"
    `);
}

async function main() {
    const {options, inputs} = parseArgs();

    if (options.help) {
        showHelp();
        return;
    }

    if (inputs.length === 0 && !options.inputs) {
        console.log(`${COLORS.yellow}⚠️  No inputs provided. Use --help for usage information.${COLORS.reset}`);
        return;
    }

    const ruminator = new Ruminator({
        ...options,
        inputs
    });

    try {
        await ruminator.initialize();
        await ruminator.ruminate();

        // Show final state
        console.log(`\n${COLORS.bright}📊 FINAL STATE:${COLORS.reset}`);
        const beliefs = ruminator.getBeliefs();
        console.log(`Total beliefs: ${beliefs.length}`);

        if (beliefs.length > 0) {
            console.log('Recent beliefs:');
            beliefs.slice(-5).forEach((task, i) => {
                console.log(`  ${i + 1}. ${task.term.toString()} ${task.truth ? `{f:${task.truth.frequency}, c:${task.truth.confidence}}` : ''}`);
            });
        }
    } catch (error) {
        console.error(`${COLORS.red}❌ Ruminator error: ${error.message}${COLORS.reset}`);
        console.error(error.stack);
    } finally {
        await ruminator.shutdown();
    }
}

// Run if this file is executed directly
if (process.argv[1] && process.argv[1].endsWith('ruminate.js')) {
    main().catch(console.error);
}

export {Ruminator, ReasoningTrace};